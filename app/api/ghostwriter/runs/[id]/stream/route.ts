import { NextRequest } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase/server';
import { runGemini } from '../../../../../../lib/ghostwriter/stages/gemini';
import { runPerplexity } from '../../../../../../lib/ghostwriter/stages/perplexity';
import { runGrok } from '../../../../../../lib/ghostwriter/stages/grok';
import { runChatGPT } from '../../../../../../lib/ghostwriter/stages/chatgpt';
import { buildFourEyes } from '../../../../../../lib/ghostwriter/stages/foureyes';
import { AUTHOR_VOICES } from '../../../../../../lib/ghostwriter/prompts';
import type { StageResult } from '../../../../../../lib/ghostwriter/stages/gemini';

export const maxDuration = 300;

type StageName = 'gemini' | 'perplexity' | 'grok' | 'chatgpt' | 'foureyes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: run, error } = await service
    .from('ghostwriter_runs')
    .select('id, chapter, draft_text, word_count, status')
    .eq('id', id)
    .single();

  if (error || !run) {
    return new Response('Run not found', { status: 404 });
  }

  if (run.status === 'running') {
    return new Response('Pipeline already running', { status: 409 });
  }

  if (run.status === 'complete' || run.status === 'blocked') {
    return new Response('Pipeline already finished', { status: 409 });
  }

  const encoder = new TextEncoder();

  function send(controller: ReadableStreamDefaultController, payload: object) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  }

  async function saveStage(
    runId: string,
    stage: StageName,
    result: StageResult,
    status: 'complete' | 'error' = 'complete'
  ) {
    const { error: saveErr } = await service.from('ghostwriter_stages').insert({
      run_id: runId,
      stage,
      status,
      output: result.output,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_gbp: result.costGbp,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    if (saveErr) console.error(`[ghostwriter] saveStage ${stage} error:`, saveErr.message);
  }

  const stream = new ReadableStream({
    async start(controller) {
      await service
        .from('ghostwriter_runs')
        .update({ status: 'running' })
        .eq('id', id);

      send(controller, { stage: 'start', runId: id, chapter: run.chapter });

      const draft = run.draft_text as string;
      const chapter = run.chapter as number;
      const authorVoice = AUTHOR_VOICES[chapter] ?? 'Follow the voice brief in CLAUDE.md.';

      let geminiOut = '';
      let perplexityOut = '';
      let grokOut = '';
      let chatgptOut = '';

      const stages: Array<{ name: StageName; fn: () => Promise<StageResult> }> = [
        { name: 'gemini', fn: () => runGemini(chapter, draft) },
        { name: 'perplexity', fn: () => runPerplexity(chapter, draft, geminiOut) },
        { name: 'grok', fn: () => runGrok(chapter, draft, geminiOut, perplexityOut) },
        { name: 'chatgpt', fn: () => runChatGPT(chapter, draft, authorVoice) },
      ];

      for (const { name, fn } of stages) {
        send(controller, { stage: name, status: 'running' });
        try {
          const result = await fn();
          await saveStage(id, name, result);
          if (name === 'gemini') geminiOut = result.output;
          if (name === 'perplexity') perplexityOut = result.output;
          if (name === 'grok') grokOut = result.output;
          if (name === 'chatgpt') chatgptOut = result.output;
          send(controller, { stage: name, status: 'complete', words: result.output.split(/\s+/).length });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          send(controller, { stage: name, status: 'error', error: msg });
          await service.from('ghostwriter_stages').insert({
            run_id: id, stage: name, status: 'error', output: msg,
            started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
          });
        }
      }

      // Four-Eyes
      send(controller, { stage: 'foureyes', status: 'running' });
      const { report, isBlocked } = buildFourEyes(
        chapter, run.word_count as number,
        geminiOut, perplexityOut, grokOut, chatgptOut
      );
      await saveStage(id, 'foureyes', { output: report, tokensIn: 0, tokensOut: 0, costGbp: 0 });

      await service
        .from('ghostwriter_runs')
        .update({
          status: isBlocked ? 'blocked' : 'complete',
          is_blocked: isBlocked,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      send(controller, { stage: 'foureyes', status: 'complete', isBlocked });
      send(controller, { stage: 'done', isBlocked });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
