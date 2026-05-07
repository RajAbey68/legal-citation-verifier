import OpenAI from 'openai';
import type { StageResult } from './gemini';

export interface RiskItem {
  /** RISK-0 = no issue | RISK-1 = minor/informational | RISK-2 = acceptable, note added | RISK-3 = blocking, must fix */
  level: 0 | 1 | 2 | 3;
  category: string;
  finding: string;
}

export interface FourEyesResult {
  report: string;
  risks: RiskItem[];
  /** true only when any RISK-3 finding remains */
  isBlocked: boolean;
  /** highest risk level found */
  maxRisk: 0 | 1 | 2 | 3;
  narrativePct: number;
}

const COST_IN = (5 / 1_000_000) * 0.79;
const COST_OUT = (15 / 1_000_000) * 0.79;

/**
 * Estimate the percentage of words in a chapter that are narrative/story content
 * (named cast scenes, anecdote paragraphs) vs practical/framework content.
 * Heuristic: paragraphs starting with a cast member name or containing scene-setting
 * language count as narrative.
 */
function estimateNarrativePct(draft: string): number {
  const paragraphs = draft.split(/\n{2,}/).filter((p) => p.trim().length > 20);
  if (paragraphs.length === 0) return 0;

  const castNames = ['sarah', 'david', 'emily', 'jordan', 'sophie', 'marcus', 'robert', 'james', 'claire'];
  const narrativeMarkers = [
    'stepped into', 'walked', 'drove', 'sat at', 'looked at', 'opened her', 'opened his',
    'picked up', 'put down', 'noticed', 'glanced', 'said nothing', 'nodded', 'leaned back',
    'the car park', 'that morning', 'that afternoon', 'that evening', 'the following',
  ];

  let narrativeCount = 0;
  for (const para of paragraphs) {
    const lower = para.toLowerCase();
    const hasCast = castNames.some((n) => lower.startsWith(n) || lower.includes(` ${n} `));
    const hasScene = narrativeMarkers.some((m) => lower.includes(m));
    if (hasCast && hasScene) narrativeCount++;
  }

  return Math.round((narrativeCount / paragraphs.length) * 100);
}

/**
 * Parse the LLM risk scoring response into structured RiskItem[].
 * Expects lines like:  RISK-2 | Citation | "X claim has no Tier 1 source"
 */
function parseRisks(text: string): RiskItem[] {
  const items: RiskItem[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/RISK-([0-3])\s*\|\s*([^|]+)\|\s*(.+)/i);
    if (match) {
      items.push({
        level: parseInt(match[1], 10) as 0 | 1 | 2 | 3,
        category: match[2].trim(),
        finding: match[3].trim(),
      });
    }
  }
  return items;
}

/**
 * Build the drift-detection and risk-scoring prompt.
 * This is the core Four-Eyes synthesis — it combines all prior stage outputs
 * and scores each finding for the batch runner to act on.
 */
function buildScoringPrompt(
  chapter: number,
  draft: string,
  gemini: string,
  perplexity: string,
  grok: string,
  chatgpt: string,
): string {
  return `You are the final quality gate for Chapter ${chapter} of a Law Society Publishing book.

TARGET READER: A practice manager or senior partner in a UK high street or regional law firm.
Firm size: 4–25 fee earners. Regulated by the SRA. Practice areas: conveyancing, probate, employment, commercial property.
This person is time-poor, change-sceptical, and accountable for outcomes. They will only act on information that is directly relevant to their firm.

YOUR TASK:
Consolidate all four prior review stages and score every issue using this exact format:
RISK-[0|1|2|3] | [Category] | [One-sentence finding]

RISK LEVELS:
- RISK-0: No issue. Compliant. No action needed.
- RISK-1: Minor/informational. The reader should know but no rewrite needed.
- RISK-2: Acceptable with a caveat note. May need a brief disclaimer added.
- RISK-3: BLOCKING. Must be rewritten before publication.

RISK-3 TRIGGERS (automatic blocking):
- Any statistic without a named Tier 1 source (SRA, Law Society, EUR-Lex, Thomson Reuters, Clio, LEAP, Legal Futures named journalist + date)
- Any US statistic applied to UK context without explicit caveat
- Any SRA outcome interpretation stated as definitive when it is contested
- Any quote exceeding 15 words from an external source
- Practitioner frameworks (Story Files, HITL, Shadow Efficiency, Task Classification) presented as SRA-recognised standards
- Client data or personally identifiable information described as uploadable to any AI tool
- Any legal claim a competent solicitor would reject as implausible

DRIFT CHECK (score each finding as RISK-2 or RISK-3):
Ask for each paragraph or section: "Would a practice manager in a 12-person high street firm stop reading here and think: what do I do with this?"
- If the answer is NO because the content is too abstract, too academic, or too large-firm-focused → RISK-3 Drift
- If the answer is NO but the content provides useful context → RISK-2 Drift
- Named cast narrative (Sarah, David, Emily, Jordan, Sophie, Marcus, Robert, James) is ACCEPTABLE when it directly demonstrates a principle the reader will implement. Flag if it does not.

NARRATIVE RATIO CHECK:
- Narrative content (named cast scenes, external anecdotes) should not exceed 15% of the chapter.
- If you estimate narrative > 15%: flag the excess scenes as RISK-2 with note "narrative ratio — consider cutting or shortening"
- If narrative > 20%: flag as RISK-3 Drift

STORY QUALITY CHECK (for every narrative passage):
Score each story/anecdote:
- Does it feature a named cast member or a named external case (James Stewart, Midlands firm)?
- Does it end with a principle the reader can implement?
- Is it under 200 words?
If any answer is NO → flag as RISK-2 or RISK-3 depending on severity.

---

PRIOR STAGE INPUTS:

Stage 2 — Evidence Hierarchy (GPT-4o):
${gemini.slice(0, 2000)}

Stage 2b — Currency Check (Perplexity):
${perplexity.slice(0, 2000)}

Stage 3 — Critical Challenge (Grok):
${grok.slice(0, 2000)}

Stage 4 — Editorial Consistency (ChatGPT):
${chatgpt.slice(0, 2000)}

---

CHAPTER DRAFT (first 6,000 words for drift analysis):
${draft.slice(0, 6000)}

---

OUTPUT FORMAT — return ONLY this structure, no preamble:

## Risk Register

[list all findings as: RISK-[0-3] | [Category] | [Finding]]

## Summary

Max risk level: RISK-[0-3]
Total RISK-3 findings: [n]
Total RISK-2 findings: [n]
Estimated narrative %: [n]%
Iteration recommendation: [PASS — no further review needed | REWRITE — fix RISK-3 items then re-run | HUMAN GATE — pass to author for RISK-2 decisions]
`;
}

export async function runFourEyes(
  chapter: number,
  draft: string,
  gemini: string,
  perplexity: string,
  grok: string,
  chatgpt: string,
): Promise<{ stageResult: StageResult; fourEyes: FourEyesResult }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const narrativePct = estimateNarrativePct(draft);
  const wordCount = draft.split(/\s+/).length;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const prompt = buildScoringPrompt(chapter, draft, gemini, perplexity, grok, chatgpt);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const costGbp = tokensIn * COST_IN + tokensOut * COST_OUT;

  const risks = parseRisks(text);
  const maxRisk = risks.reduce((max, r) => Math.max(max, r.level) as 0 | 1 | 2 | 3, 0 as 0 | 1 | 2 | 3);
  const isBlocked = maxRisk >= 3;

  const risk3 = risks.filter((r) => r.level === 3);
  const risk2 = risks.filter((r) => r.level === 2);
  const risk1 = risks.filter((r) => r.level === 1);
  const status = isBlocked ? '🔴 BLOCKED — rewrite required' : maxRisk === 2 ? '🟡 HUMAN GATE — author review' : '🟢 PASS';

  const report = `# Four-Eyes Verification Report — Chapter ${chapter}
Generated: ${ts}
Word count: ${wordCount.toLocaleString()}
Estimated narrative content: ${narrativePct}%
Status: ${status}

---

## Risk Register

${text}

---

## Stage Evidence

### Stage 2 — Evidence Hierarchy (GPT-4o)
${gemini}

### Stage 2b — Currency Check (Perplexity)
${perplexity}

### Stage 3 — Critical Challenge (Grok)
${grok}

### Stage 4 — Editorial Consistency (ChatGPT)
${chatgpt}

---

## Consolidated Risk Summary

| Level | Count | Items |
|-------|-------|-------|
| RISK-3 (blocking) | ${risk3.length} | ${risk3.map((r) => r.category).join(', ') || '—'} |
| RISK-2 (author review) | ${risk2.length} | ${risk2.map((r) => r.category).join(', ') || '—'} |
| RISK-1 (informational) | ${risk1.length} | ${risk1.map((r) => r.category).join(', ') || '—'} |

---

## Stage 5 — Legal Risk Checklist (Human review required)

- [ ] All vendor criticism has factual basis and is not defamatory
- [ ] Client data upload warnings present wherever any AI tool is described
- [ ] SRA Outcome interpretations carry appropriate "practitioners should seek independent advice" caveat
- [ ] Copyright: no quote exceeds 15 words; one quote per source per chapter
- [ ] Practitioner frameworks labelled as "practitioner-developed, not SRA-recognised"
- [ ] Narrative passages: each named character scene ends with an implementable principle

---

## Stage 6 — Iteration Decision

${isBlocked
    ? `### ⛔ REWRITE REQUIRED\n\n${risk3.length} RISK-3 finding(s) must be fixed before next review.\n\nBlocking items:\n${risk3.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}`
    : maxRisk === 2
      ? `### 🟡 HUMAN GATE\n\nNo blocking issues. ${risk2.length} item(s) require author decision.\n\nItems for review:\n${risk2.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}`
      : '### ✅ PASS\n\nNo blocking issues. No author decisions required. Ready for publication.'
  }

**Decision required from:** Author / Rajiv Abeysinghe
**Deliver to next stage?** ☐ Yes  ☐ No — reason: _______________
`;

  return {
    stageResult: { output: text, tokensIn, tokensOut, costGbp },
    fourEyes: { report, risks, isBlocked, maxRisk, narrativePct },
  };
}

/** Legacy synchronous builder — kept for backward compatibility with existing SSE route */
export function buildFourEyes(
  chapter: number,
  wordCount: number,
  gemini: string,
  perplexity: string,
  grok: string,
  chatgpt: string,
): { report: string; isBlocked: boolean } {
  const allNotes = [gemini, perplexity, grok, chatgpt].join('\n').toLowerCase();
  const BLOCKING_KEYWORDS = [
    'tier 1 claim without citation',
    'definitive sra',
    'client data upload',
    'quote exceeds 15 words',
    'us statistic applied to uk',
  ];
  const flagged = BLOCKING_KEYWORDS.filter((kw) => allNotes.includes(kw));
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const status = flagged.length > 0 ? '🔴 BLOCKED' : '🟡 PENDING HUMAN GATE';

  const report = `# Four-Eyes Verification Report — Chapter ${chapter}
Generated: ${ts}
Word count: ${wordCount.toLocaleString()}
Status: ${status}

## Stage 2 — Evidence Hierarchy\n${gemini}
## Stage 2b — Currency Check\n${perplexity}
## Stage 3 — Critical Challenge\n${grok}
## Stage 4 — Editorial Consistency\n${chatgpt}

## Stage 6 — Final Approval Gate
${flagged.length > 0 ? '### ⛔ BLOCKING CONDITIONS DETECTED\n' + flagged.map((k) => `- ${k}`).join('\n') : '### ✓ No automatic blocks detected'}
`;
  return { report, isBlocked: flagged.length > 0 };
}
