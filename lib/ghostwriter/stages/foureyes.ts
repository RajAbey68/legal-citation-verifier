import OpenAI from 'openai';
import type { StageResult } from './gemini';

export interface RiskItem {
  /**
   * RISK-1 = Low impact, acceptable — log only, no action required
   * RISK-2 = Must be considered and logged — author awareness, no rewrite needed
   * RISK-3 = Borderline — would attract investigation if challenged; rewrite advisable
   * RISK-4 = Arguable — a regulator or opposing counsel could contest this; must fix
   * RISK-5 = Certain SRA challenge / regulator non-compliance — blocks publication
   */
  level: 1 | 2 | 3 | 4 | 5;
  category: string;
  finding: string;
}

export interface FourEyesResult {
  report: string;
  risks: RiskItem[];
  /** true when any RISK-4 or RISK-5 finding remains — publication blocked */
  isBlocked: boolean;
  /** highest risk level found */
  maxRisk: 1 | 2 | 3 | 4 | 5;
  narrativePct: number;
}

// gpt-5.1 pricing: $3 input / $12 output per 1M tokens → GBP at 0.79
const COST_IN = (3 / 1_000_000) * 0.79;
const COST_OUT = (12 / 1_000_000) * 0.79;

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
 * Expects lines like:  RISK-4 | Evidence | "X claim has no Tier 1 source"
 * Scale: 1 (low) → 5 (certain SRA challenge)
 */
function parseRisks(text: string): RiskItem[] {
  const items: RiskItem[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/RISK-([1-5])\s*\|\s*([^|]+)\|\s*(.+)/i);
    if (match) {
      const level = parseInt(match[1], 10) as 1 | 2 | 3 | 4 | 5;
      items.push({
        level,
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
  notebooklmVerification?: string,
): string {
  return `You are the final quality gate for Chapter ${chapter} of a Law Society Publishing book.

TARGET READER: A practice manager or senior partner in a UK high street or regional law firm.
Firm size: 4–25 fee earners. Regulated by the SRA. Practice areas: conveyancing, probate, employment, commercial property.
This person is time-poor, change-sceptical, and accountable for outcomes. They will only act on information that is directly relevant to their firm.

YOUR TASK:
Consolidate all four prior review stages and score every issue using this exact format:
RISK-[1|2|3|4|5] | [Category] | [One-sentence finding]

RISK SCALE — 1 to 5:
- RISK-1: Low impact, acceptable. Log only. No action or rewrite needed.
- RISK-2: Must be considered and logged. Author awareness required. No rewrite unless author chooses.
- RISK-3: Borderline. Would attract investigation if the book were challenged. Rewrite strongly advisable.
- RISK-4: Arguable. A regulator, opposing counsel, or Law Society editor would contest this. Must be fixed before publication.
- RISK-5: Certain SRA challenge or regulator non-compliance. Blocks publication. Must be removed or fundamentally rewritten.

CATEGORY TAXONOMY — use exactly one of these categories per finding.
Three risk axes determine severity: Regulatory first, then Law, then Ethics/Reputation.

AXIS 1 — REGULATORY (SRA / ICO / FCA where applicable) — highest severity
- Regulatory: SRA Outcomes Reporting, SRA Codes of Conduct, AML obligations, client account rules
- Compliance: Client data / PII in AI tools, AI disclosure to clients, data processor obligations

AXIS 2 — LAW (statute, case law, copyright, defamation)
- Evidence: Statistics or claims without verified Tier 1 source (SRA, Law Society, Clio, LEAP, Legal Futures)
- Attribution: Stat real but source named incorrectly or imprecisely
- Legal: Defamation risk, copyright violation (>15-word quotes), IP attribution gaps
- Framework: Practitioner tools (HITL, Shadow Efficiency, Task Classification, Story Files) — labelling as quasi-standards

AXIS 3 — ETHICS & REPUTATION (unregulated but carries monetary/reputational risk)
- Bias: Unbalanced tool recommendations, vendor preference without disclosure, demographic assumptions
- IP: Methodology, dataset, or third-party framework used without attribution
- Drift: Content too abstract, academic, or large-firm-focused for the target reader
- Narrative: Cast scenes, anecdotes — quality, length, or missing implementable takeaway
- Editorial: Kill list violations, voice inconsistency, structural issues, logic contradictions

RISK-5 TRIGGERS (publication blocked — certain regulatory/legal exposure):
- SRA outcome interpretation stated as definitive when it is contested or unpublished
- Client data or PII described as uploadable to any AI tool without data processing caveat
- Any legal claim a competent solicitor would reject as implausible or defamatory
- Practitioner frameworks presented explicitly as SRA-recognised standards

RISK-4 TRIGGERS (must fix — arguable, would be contested):
- Any statistic WITHOUT a named Tier 1 source AND NOT verified by Stage 0 NotebookLM
- Any US or global statistic applied to UK context without explicit caveat
- Any quote exceeding 15 words from an external source
- HITL / Shadow Efficiency / Task Classification described as producing "SRA compliance evidence" without appropriate hedging

RISK-3 TRIGGERS (rewrite advisable — borderline):
- Statistics with a named source but no date, publication name, or sample size
- Drift: content a practice manager in a 12-person firm would stop reading because it's irrelevant to them
- Narrative passages exceeding 200 words without an implementable takeaway
- Framework descriptions that imply regulatory recognition without explicitly denying it

RISK-2 TRIGGERS (log and consider):
- Narrative ratio 13–20% of chapter (flag; do not auto-rewrite)
- Minor drift: content useful but marginally too academic
- Minor kill list adjacency: word not on list but in the same spirit
- Attribution could be more precise but is not wrong

RISK-1 TRIGGERS (acceptable, log only):
- Stylistic preferences that do not affect compliance or credibility
- Narrative ratio under 12% (compliant — RISK-1 PASS, no flag needed)
- Minor repetition that an editor would catch in normal copy-editing

CRITICAL RULE — NOTEBOOKLM PRE-VERIFICATION:
${notebooklmVerification
  ? `Stage 0 has already verified claims against the 184-source master library.
Claims marked VERIFIED are sourced — do NOT raise Evidence flags against them.
Claims marked UNVERIFIED are genuinely unsourced — flag as RISK-4 Evidence.
Claims marked MISATTRIBUTED need source correction — flag as RISK-3 Attribution.

${notebooklmVerification}`
  : 'Stage 0 NotebookLM verification was not available for this run. Apply Evidence triggers conservatively.'}

DRIFT CHECK:
Ask of every paragraph: "Would a practice manager in a 12-person high street firm stop here and know exactly what to do next?"
- Absolutely not — too abstract/academic/large-firm → RISK-4 Drift
- Probably not, but provides useful context → RISK-3 Drift
- Marginally unclear but acceptable → RISK-2 Drift
- Named cast narrative is acceptable ONLY when it ends with an implementable principle. If it does not → RISK-3 Narrative.

NARRATIVE RATIO:
- Over 20% → RISK-4 Narrative (too high, publication concern)
- 13–20% → RISK-2 Narrative (log, author decision)
- Under 12% → RISK-1 PASS (do not flag)

---

PRIOR STAGE INPUTS:

Stage 1 — Evidence Hierarchy (GPT-5.4):
${gemini.slice(0, 2000)}

Stage 2 — Currency Check (Perplexity):
${perplexity.slice(0, 2000)}

Stage 3 — Critical Challenge (Grok-4.3):
${grok.slice(0, 2000)}

Stage 4 — Editorial Consistency (GPT-5.4):
${chatgpt.slice(0, 2000)}

---

CHAPTER DRAFT (first 6,000 words for drift analysis):
${draft.slice(0, 6000)}

---

OUTPUT FORMAT — return ONLY this structure, no preamble:

## Risk Register

[list all findings as: RISK-[1-5] | [Category] | [Finding]]

## Summary

Max risk level: RISK-[1-5]
Total RISK-5 findings: [n]
Total RISK-4 findings: [n]
Total RISK-3 findings: [n]
Total RISK-2 findings: [n]
Total RISK-1 findings: [n]
Estimated narrative %: [n]%
Iteration recommendation: [PASS — no further review needed | REWRITE — fix RISK-4/5 items then re-run | HUMAN GATE — Tier 1 HITL review required for RISK-5 items]
`;
}

export async function runFourEyes(
  chapter: number,
  draft: string,
  gemini: string,
  perplexity: string,
  grok: string,
  chatgpt: string,
  notebooklmVerification?: string,
): Promise<{ stageResult: StageResult; fourEyes: FourEyesResult }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });

  const narrativePct = estimateNarrativePct(draft);
  const wordCount = draft.split(/\s+/).length;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const prompt = buildScoringPrompt(chapter, draft, gemini, perplexity, grok, chatgpt, notebooklmVerification);

  const response = await client.chat.completions.create({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content ?? '';
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const costGbp = tokensIn * COST_IN + tokensOut * COST_OUT;

  const risks = parseRisks(text);
  const maxRisk = risks.reduce((max, r) => Math.max(max, r.level) as 1 | 2 | 3 | 4 | 5, 1 as 1 | 2 | 3 | 4 | 5);
  // RISK-4 or RISK-5 blocks publication. RISK-3 requires rewrite but is not a hard block.
  const isBlocked = maxRisk >= 4;

  const risk5 = risks.filter((r) => r.level === 5);
  const risk4 = risks.filter((r) => r.level === 4);
  const risk3 = risks.filter((r) => r.level === 3);
  const risk2 = risks.filter((r) => r.level === 2);
  const risk1 = risks.filter((r) => r.level === 1);
  const status = risk5.length > 0
    ? '🔴 BLOCKED — RISK-5: certain SRA/regulatory challenge'
    : risk4.length > 0
      ? '🟠 BLOCKED — RISK-4: arguable, must fix before publication'
      : risk3.length > 0
        ? '🟡 REWRITE ADVISABLE — RISK-3: borderline, would attract investigation'
        : maxRisk === 2
          ? '🔵 LOGGED — RISK-2: noted, author awareness required'
          : '🟢 PASS — RISK-1 only';

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

| Level | Description | Count | Categories |
|-------|-------------|-------|------------|
| RISK-5 🔴 | Certain SRA/regulatory challenge — publication blocked | ${risk5.length} | ${risk5.map((r) => r.category).join(', ') || '—'} |
| RISK-4 🟠 | Arguable — must fix before publication | ${risk4.length} | ${risk4.map((r) => r.category).join(', ') || '—'} |
| RISK-3 🟡 | Borderline — rewrite strongly advisable | ${risk3.length} | ${risk3.map((r) => r.category).join(', ') || '—'} |
| RISK-2 🔵 | Must be considered and logged | ${risk2.length} | ${risk2.map((r) => r.category).join(', ') || '—'} |
| RISK-1 🟢 | Low impact, acceptable | ${risk1.length} | ${risk1.map((r) => r.category).join(', ') || '—'} |

---

## Risk Hierarchy — UK Legal Publication Standard

**Primary risk axis — Regulatory (SRA / FCA / ICO):**
RISK-5 triggers: Definitive SRA compliance claims, client data/PII in AI tools, defamatory vendor criticism, legal advice without caveat

**Secondary risk axis — Law:**
RISK-4 triggers: Unsourced statistics, US data applied to UK without caveat, contested regulatory interpretation presented as settled, copyright violations (>15 word quotes)

**Tertiary risk axis — Ethics & Reputation:**
RISK-3 triggers: Bias in tool recommendations, IP attribution gaps, unverified market claims, drift from target reader, framework labelling
RISK-2 triggers: Reputational adjacency (association with contested AI claims), narrative quality, author voice consistency

---

## Stage 5 — Legal Risk Checklist (Tier 1 HITL — human sign-off required)

- [ ] No RISK-5 items remain (SRA/regulatory non-compliance would be certain)
- [ ] No RISK-4 items remain unresolved (arguable claims fixed or caveated)
- [ ] Client data upload warnings present wherever any AI tool is described
- [ ] SRA interpretations carry "practitioners should seek independent advice" caveat
- [ ] Copyright: no quote exceeds 15 words; one quote per source per chapter
- [ ] Practitioner frameworks labelled "practitioner-developed, not SRA-recognised"
- [ ] Bias check: no tool or vendor recommended without balanced disclosure of limitations
- [ ] IP check: no methodology, framework, or dataset used without attribution

---

## Stage 6 — Iteration Decision

${risk5.length > 0
    ? `### ⛔ PUBLICATION BLOCKED — RISK-5\n\n${risk5.length} finding(s) represent certain regulatory challenge. Tier 1 HITL review mandatory.\n\n${risk5.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}\n\n---\n\n${risk4.length > 0 ? `Also fix before re-run — RISK-4 (${risk4.length}):\n${risk4.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}` : ''}`
    : risk4.length > 0
      ? `### 🟠 REWRITE REQUIRED — RISK-4\n\n${risk4.length} finding(s) are arguable and must be fixed.\n\nItems:\n${risk4.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}`
      : risk3.length > 0
        ? `### 🟡 REWRITE ADVISABLE — RISK-3\n\n${risk3.length} borderline finding(s). Rewrite strongly recommended before author review.\n\nItems:\n${risk3.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}`
        : maxRisk === 2
      ? `### 🔵 LOGGED — RISK-2\n\nNo blocking issues. ${risk2.length} item(s) logged for author awareness.\n\nItems:\n${risk2.map((r, i) => `${i + 1}. [${r.category}] ${r.finding}`).join('\n')}`
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
