import OpenAI from 'openai';
import type { StageResult } from './gemini';

const COST_IN = (1 / 1_000_000) * 0.79;
const COST_OUT = (1 / 1_000_000) * 0.79;

export async function runPerplexity(
  chapter: number,
  draft: string,
  geminiNotes: string
): Promise<StageResult> {
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY!,
    baseURL: 'https://api.perplexity.ai',
  });

  const prompt = `You are a regulatory currency checker. Use live web search to verify claims from a UK legal book chapter are still accurate as of today.

For each claim, confirm:
- Is the regulation/guidance still in force?
- Has it been amended, replaced, or withdrawn?
- If changed: what replaced it and when?

Return findings as: CLAIM → STATUS (Current / Amended / Withdrawn) → SOURCE URL → DATE VERIFIED

Chapter ${chapter} — Gemini citation notes (Tier 1 claims to verify):
${geminiNotes.slice(0, 3000)}

Also scan the draft for date-sensitive claims:
${draft.slice(0, 4000)}`;

  const response = await client.chat.completions.create({
    model: 'sonar-reasoning-pro',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  return { output: text, tokensIn, tokensOut, costGbp: tokensIn * COST_IN + tokensOut * COST_OUT };
}
