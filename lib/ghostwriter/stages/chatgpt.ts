import OpenAI from 'openai';
import { KILL_LIST } from '../prompts';
import type { StageResult } from './gemini';

const COST_IN = (5 / 1_000_000) * 0.79;
const COST_OUT = (15 / 1_000_000) * 0.79;

export async function runChatGPT(
  chapter: number,
  draft: string,
  authorVoice: string
): Promise<StageResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const prompt = `You are an editorial consistency checker for a Law Society Publishing book.
Check ONLY: (1) voice compliance, (2) kill-list violations, (3) structural coherence.
Do NOT rewrite. Return a numbered list of issues only.

Voice brief for Chapter ${chapter}:
${authorVoice}

Kill list — NEVER use:
${KILL_LIST}

Copyright rule: no quote may exceed 15 words. Flag any violation.

Chapter ${chapter} draft:
${draft}`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.5',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  return { output: text, tokensIn, tokensOut, costGbp: tokensIn * COST_IN + tokensOut * COST_OUT };
}
