import OpenAI from 'openai';
import type { StageResult } from './gemini';

const COST_IN = (5 / 1_000_000) * 0.79;
const COST_OUT = (15 / 1_000_000) * 0.79;

export async function runGrok(
  chapter: number,
  draft: string,
  geminiNotes: string,
  perplexityNotes: string
): Promise<StageResult> {
  const client = new OpenAI({
    apiKey: process.env.GROK_API_KEY!,
    baseURL: 'https://api.x.ai/v1',
  });

  const prompt = `You are a critical reviewer stress-testing a chapter for a Law Society Publishing book.
Your role: find weaknesses, not fix them. Return a numbered list of issues only.

Check specifically:
1. US/UK data conflation — any US statistic applied to UK without explicit caveat?
2. ROI and efficiency claims — is there a named Tier 1 source, or is this assertion?
3. Practitioner framework overclaims — are Task Classification Matrix, Shadow Efficiency, HITL protocol, or Story Files presented as SRA-recognised standards?
4. "Law Society recommends" vs "Law Society requires" — flag any conflation.
5. SRA Outcome interpretations stated as definitive — flag any that are contested.
6. Any claim a competent solicitor would reject as implausible.

Prior research notes:
${geminiNotes.slice(0, 1500)}
${perplexityNotes.slice(0, 1500)}

DRAFT:
${draft}`;

  const response = await client.chat.completions.create({
    model: 'grok-4.3',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  return { output: text, tokensIn, tokensOut, costGbp: tokensIn * COST_IN + tokensOut * COST_OUT };
}
