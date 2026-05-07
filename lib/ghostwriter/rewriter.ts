import OpenAI from 'openai';
import { AUTHOR_VOICES, KILL_LIST, TIER_RULES } from './prompts';
import type { RiskItem } from './stages/foureyes';

const COST_IN = (5 / 1_000_000) * 0.79;
const COST_OUT = (15 / 1_000_000) * 0.79;

export interface RewriteResult {
  revisedDraft: string;
  tokensIn: number;
  tokensOut: number;
  costGbp: number;
  issuesAddressed: string[];
}

/**
 * NARRATIVE RULES — injected into every rewrite prompt.
 * Ensures drift toward story/anecdote does not compound across iterations.
 */
const NARRATIVE_RULES = `
NARRATIVE RULES (apply throughout the rewrite):
- Named cast (Sarah Mitchell, David Harrison, Emily Patterson, Jordan Hayes, Sophie Williams, Marcus Thompson, Robert Ashford, James Stewart, Claire) MAY appear in the chapter.
- Every cast narrative passage MUST end with a principle the reader can implement at their own firm on Monday.
- Maximum 12% of paragraphs may be cast narrative or anecdote. If current ratio exceeds this, shorten or cut the longest scenes first.
- External anecdotes (James's Midlands firm, etc.) are limited to ONE per chapter. They MUST include specific data (numbers, dates, outcomes).
- NEVER add new anecdotes, stories, or characters not already in the chapter.
- If a narrative passage has no implementable takeaway: delete it entirely and replace with a one-sentence factual summary of what it illustrated.

READER TEST — apply to every paragraph you rewrite:
Ask: "Would a practice manager in a 12-person high street firm stop here and know exactly what to do next?"
If the answer is NO: rewrite until it is YES, or cut the paragraph.
`;

/**
 * DRIFT PREVENTION — injected when drift findings are present.
 */
const DRIFT_RULES = `
DRIFT PREVENTION:
This chapter is written for practice managers and senior partners in UK high street or regional law firms (4–25 fee earners, SRA-regulated).
Every section must be directly applicable to a firm of this type. Remove or rewrite:
- Content that assumes a firm with 50+ staff
- Content that assumes a dedicated IT department
- Abstract descriptions of technology that do not end with a concrete action
- Academic framing that a busy practice manager would skip
`;

function buildRewritePrompt(
  chapter: number,
  draft: string,
  risk3Items: RiskItem[],
  risk2Items: RiskItem[],
  iteration: number,
): string {
  const authorVoice = AUTHOR_VOICES[chapter] ?? AUTHOR_VOICES[1];
  const hasDrift = [...risk3Items, ...risk2Items].some((r) =>
    r.category.toLowerCase().includes('drift'),
  );

  const blockingList = risk3Items
    .map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`)
    .join('\n');

  const advisoryList = risk2Items
    .map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`)
    .join('\n');

  return `You are rewriting Chapter ${chapter} of a Law Society Publishing book. This is iteration ${iteration} of the quality review loop.

AUTHOR VOICE:
${authorVoice}

${TIER_RULES}

KILL LIST — NEVER use these words or phrases:
${KILL_LIST}
Also never use: transformative, landscape, game-changer, seamless, synergy, paradigm, holistic, cutting-edge, revolutionary, innovative, disruptive, ecosystem, straightforward, leverage (as verb), delve, navigate (business context), robust (be specific instead).

${NARRATIVE_RULES}
${hasDrift ? DRIFT_RULES : ''}

---

YOUR TASK:
Fix ONLY the issues listed below. Do not change sections that are not affected by these issues.
Preserve all visual aids (ASCII art, tables, flowcharts) exactly as written.
Preserve all TLDR boxes, Try This Week boxes, Common Mistakes boxes, Two-Path boxes, and Forward Bridge paragraphs.
Preserve all citation references and Tier 1 source attributions.

BLOCKING ISSUES — RISK-3 (MUST fix all of these):
${blockingList || '(none)'}

ADVISORY ISSUES — RISK-2 (fix if possible without introducing new problems):
${advisoryList || '(none)'}

---

ORIGINAL CHAPTER DRAFT:
${draft}

---

Return the complete revised chapter, preserving all original structure. Do not add a preamble or commentary. Return only the revised text.
`;
}

/**
 * Rewrite a chapter to fix RISK-3 (blocking) and RISK-2 (advisory) findings.
 * Called by the batch runner when Four-Eyes returns issues.
 */
export async function rewriteChapter(
  chapter: number,
  draft: string,
  risk3Items: RiskItem[],
  risk2Items: RiskItem[],
  iteration: number,
): Promise<RewriteResult> {
  if (risk3Items.length === 0 && risk2Items.length === 0) {
    return {
      revisedDraft: draft,
      tokensIn: 0,
      tokensOut: 0,
      costGbp: 0,
      issuesAddressed: [],
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const prompt = buildRewritePrompt(chapter, draft, risk3Items, risk2Items, iteration);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    // Long chapters need full context — no max_tokens limit here
  });

  const revisedDraft = response.choices[0].message.content ?? draft;
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const costGbp = tokensIn * COST_IN + tokensOut * COST_OUT;

  const issuesAddressed = [
    ...risk3Items.map((r) => `RISK-3: [${r.category}] ${r.finding}`),
    ...risk2Items.map((r) => `RISK-2: [${r.category}] ${r.finding}`),
  ];

  return { revisedDraft, tokensIn, tokensOut, costGbp, issuesAddressed };
}
