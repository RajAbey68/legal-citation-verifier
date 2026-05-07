import OpenAI from 'openai';
import { TIER_RULES } from '../prompts';

export interface StageResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  costGbp: number;
}

// gpt-4o: $2.50/$10 per 1M tokens → GBP at 0.79
const COST_IN = (15 / 1_000_000) * 0.79;
const COST_OUT = (60 / 1_000_000) * 0.79;

/** Citation depth stage — uses GPT-4o (Gemini free-tier quota exhausted). */
export async function runGemini(chapter: number, draft: string): Promise<StageResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const prompt = `You are a research depth checker for a Law Society Publishing book.
${TIER_RULES}

Chapter ${chapter} draft follows. Your task:
1. List every factual claim and classify it TIER 1 / TIER 2 / TIER 3 / UNCLASSIFIED.
2. For each UNCLASSIFIED claim: suggest a specific public URL or search query to find a Tier 1 source.
3. For each TIER 1 claim already present: confirm the source is named and dated.
4. Flag any Thomson Reuters data applied to UK without caveat.
5. Flag any forward-looking SRA guidance not yet published.

Return a numbered list of findings only. No rewriting. No commentary.

DRAFT:
${draft}`;

  const response = await client.chat.completions.create({
    model: 'gpt-5.5',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  return {
    output: text,
    tokensIn,
    tokensOut,
    costGbp: tokensIn * COST_IN + tokensOut * COST_OUT,
  };
}
