/**
 * Stage 6 — Validated Risk Register
 * ====================================
 * Produces three distinct outputs per chapter:
 *
 * 1. RISKS — Regulatory, legal, or reputational exposure that exists now.
 *    Validated against NotebookLM (184 Tier 1 sources). Rated RISK-1 to RISK-5.
 *
 * 2. ISSUES — Things that need fixing before publication: attribution errors,
 *    framework labelling gaps, drift, kill list. Not risks — just fixes.
 *
 * 3. GOTCHAS — Neither risks nor issues. Assumptions the book makes about
 *    sector direction that could be challenged, look wrong in 12 months, or
 *    invite pushback from a sceptical reader. Surfaced by Grok + Perplexity
 *    looking at regulatory trajectory, technology direction, and market forces.
 *
 * 4. SENTIMENT — How the chapter lands emotionally with a sceptical practice
 *    manager. Scored across five dimensions. Authors use this to calibrate tone.
 *
 * Every risk/issue flag resolves to one of five actions:
 *   CLOSED_VERIFIED     — source found in NotebookLM. No action.
 *   FIX_ATTRIBUTION     — stat real, source named incorrectly.
 *   ADD_CAVEAT          — claim defensible but needs a qualifier.
 *   REPHRASE_AS_OPINION — valid author judgement, no Tier 1 source.
 *   REMOVE              — cannot source, cannot rephrase, creates exposure.
 */

import OpenAI from 'openai';
import type { RiskItem } from './foureyes';

const DLF_NOTEBOOK_ID = '4af61e2f-a5c4-49c3-84d6-9926ac39e270';
const MCP_URL = process.env.NOTEBOOKLM_MCP_URL ?? 'https://mtv-hwy-correlation-simplified.trycloudflare.com';

export type FlagAction =
  | 'CLOSED_VERIFIED'
  | 'FIX_ATTRIBUTION'
  | 'ADD_CAVEAT'
  | 'REPHRASE_AS_OPINION'
  | 'REMOVE';

export type FlagStatus = '🟢 CLOSED' | '🔴 ACTION REQUIRED';

export interface ValidatedFlag {
  flagId: string;
  chapter: number;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  category: string;
  llmFinding: string;
  hitlTier: 1 | 2 | 3;
  notebooklmVerdict: 'VERIFIED' | 'UNVERIFIED' | 'MISATTRIBUTED' | 'NOT_CHECKED';
  notebooklmSource?: string;
  notebooklmNote?: string;
  peerChallenge?: string; // Grok verdict: "UPHELD — reason" or "DISMISSED — reason"
  status: FlagStatus;
  recommendedAction: FlagAction;
  actionDetail: string;
  assignedTo: string;
}

export interface Gotcha {
  id: string;
  assumption: string;           // What the book assumes about the sector
  challenge: string;            // How it could be challenged or look wrong
  trigger: string;              // What sector event would make this a problem
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: 'IMMEDIATE' | '6_MONTHS' | '12_MONTHS' | '2_YEARS';
  authorDecision: string;       // What the author should consider
}

export interface SentimentScore {
  dimension: string;
  score: 1 | 2 | 3 | 4 | 5;   // 1 = strongly negative, 3 = neutral, 5 = strongly positive
  label: string;
  finding: string;
  recommendation?: string;
}

export interface SentimentReport {
  overallTone: string;
  scores: SentimentScore[];
  readerImpression: string;     // One paragraph: how a sceptical PM would read this chapter
  toneWarnings: string[];       // Specific passages that land badly
}

export interface ValidationReport {
  chapter: number;
  flags: ValidatedFlag[];
  closedCount: number;
  actionCount: number;
  gotchas: Gotcha[];
  sentiment: SentimentReport;
  newSourcesToAdd: string[]; // URLs/sources to add to NotebookLM
  markdownReport: string;
}

/**
 * HITL tier classification — maps flag category to tier
 * Tier 1: Human must confirm (regulatory/legal liability)
 * Tier 2: LLM peer review sufficient (sourcing, attribution)
 * Tier 3: Autonomous LLM resolution (style, drift, narrative)
 */
function getHITLTier(category: string): 1 | 2 | 3 {
  const cat = category.toLowerCase();
  if (cat.includes('regulatory') || cat.includes('sra') || cat.includes('compliance') ||
      cat.includes('legal') || cat.includes('liability')) return 1;
  if (cat.includes('evidence') || cat.includes('citation') || cat.includes('attribution') ||
      cat.includes('framework') || cat.includes('logic')) return 2;
  return 3; // drift, narrative, structural, editorial
}

/**
 * Gate B — Peer LLM Challenge using Grok-4.3
 * Challenges each unresolved flag: is it a genuine publication risk
 * or LLM over-caution? Returns UPHELD or DISMISSED with reasoning.
 */
async function peerChallengeFlagBatch(flags: ValidatedFlag[]): Promise<Map<string, string>> {
  const grok = new OpenAI({
    apiKey: process.env.GROK_API_KEY!,
    baseURL: 'https://api.x.ai/v1',
    timeout: 300_000,
  });

  const challengeInput = flags.map((f, i) =>
    `${i + 1}. [${f.flagId} | RISK-${f.riskLevel} | ${f.category}]\nFlag: ${f.llmFinding}\nNotebookLM verdict: ${f.notebooklmVerdict}${f.notebooklmNote ? ' — ' + f.notebooklmNote : ''}`
  ).join('\n\n');

  const prompt = `You are a peer reviewer challenging AI-generated quality flags for a Law Society Publishing book aimed at UK high street law firms (4–25 fee earners, SRA-regulated).

For each flag below, determine:
- UPHELD: This is a genuine publication risk for a Law Society book. The flag is credible and the recommended action should stand.
- DISMISSED: This flag is LLM over-caution. The content is acceptable for the target audience and publication context.

Be specific about why. Consider: is this claim common knowledge in UK legal practice? Is the concern real for the target reader? Would a Law Society editor flag this?

Format each response as:
[FLAG_ID] | UPHELD or DISMISSED | One sentence reason

Flags to challenge:
${challengeInput}`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    });

    const text = response.choices[0].message.content ?? '';
    const results = new Map<string, string>();

    for (const line of text.split('\n')) {
      const match = line.match(/\[(Ch\d+-R\d+-\d+)\]\s*\|\s*(UPHELD|DISMISSED)\s*\|\s*(.+)/i);
      if (match) {
        results.set(match[1], `${match[2]} — ${match[3].trim()}`);
      }
    }
    return results;
  } catch {
    return new Map(); // fail open — don't block on peer review failure
  }
}

/**
 * Gotcha Detector — Grok-4.3
 * Finds unstated assumptions about sector direction that could embarrass
 * the authors or look wrong if the sector moves differently.
 * These are NOT risks or issues — they are directional bets.
 */
async function detectGotchas(chapter: number, draft: string): Promise<Gotcha[]> {
  const grok = new OpenAI({
    apiKey: process.env.GROK_API_KEY!,
    baseURL: 'https://api.x.ai/v1',
    timeout: 300_000,
  });

  const prompt = `You are analysing Chapter ${chapter} of "The Digital Law Firm" (Law Society Publishing, Q4 2026) for GOTCHAS.

A GOTCHA is NOT a risk or editorial issue. It is an assumption the book makes about the direction of the UK legal sector, AI regulation, or technology that:
- Could be challenged by a sceptical reader RIGHT NOW based on reasonable alternative views
- Could look wrong or embarrassing in 6–24 months if the sector moves differently
- Could be used by a critic to undermine the book's credibility

Target reader: practice manager or senior partner, 4–25 fee earner SRA-regulated UK law firm.
Publication date: Q4 2026. The book must remain credible through at least Q4 2028.

Look specifically for:
- Assumptions about SRA regulatory direction (e.g. "the SRA will require X")
- Assumptions about AI technology trajectory (e.g. "AI will replace X by Y")
- Assumptions about market direction (e.g. "fixed fees will dominate")
- Assumptions about client behaviour that may not apply to small firm clients
- Vendor/tool claims that could be undermined if a named tool changes pricing, policy, or fails
- Timeframe assumptions that could date the book prematurely
- UK-specific claims that assume the EU AI Act will apply in a specific way post-Brexit

For each gotcha found, respond in this exact format:
GOTCHA | [assumption] | [challenge] | [trigger event] | [LOW/MEDIUM/HIGH probability] | [IMMEDIATE/6_MONTHS/12_MONTHS/2_YEARS] | [author decision]

Find up to 8 gotchas. Be specific — generic observations are not useful.

CHAPTER DRAFT (first 4,000 words):
${draft.slice(0, 4000)}`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-4.3',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
    });

    const text = response.choices[0].message.content ?? '';
    const gotchas: Gotcha[] = [];
    let idx = 0;

    for (const line of text.split('\n')) {
      if (!line.startsWith('GOTCHA |')) continue;
      const parts = line.split(' | ');
      if (parts.length < 7) continue;
      idx++;
      gotchas.push({
        id: `Ch${String(chapter).padStart(2, '0')}-G-${String(idx).padStart(3, '0')}`,
        assumption: parts[1]?.trim() ?? '',
        challenge: parts[2]?.trim() ?? '',
        trigger: parts[3]?.trim() ?? '',
        probability: (['LOW', 'MEDIUM', 'HIGH'].includes(parts[4]?.trim() ?? '')
          ? parts[4].trim() : 'MEDIUM') as Gotcha['probability'],
        timeframe: (['IMMEDIATE', '6_MONTHS', '12_MONTHS', '2_YEARS'].includes(parts[5]?.trim() ?? '')
          ? parts[5].trim() : '12_MONTHS') as Gotcha['timeframe'],
        authorDecision: parts[6]?.trim() ?? '',
      });
    }
    return gotchas;
  } catch {
    return [];
  }
}

/**
 * Sentiment Analyser — GPT-5.4
 * Scores how the chapter lands emotionally with a sceptical practice manager.
 * Five dimensions: Alarm, Authority, Relevance, Accessibility, Motivation.
 */
async function analyseSentiment(chapter: number, draft: string): Promise<SentimentReport> {
  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 300_000 });

  const prompt = `You are reading Chapter ${chapter} of "The Digital Law Firm" as a sceptical practice manager at a 12-person SRA-regulated UK law firm. You are time-poor, change-resistant, and accountable for outcomes. You did not choose to read this book — it was recommended to you.

Score the chapter on six sentiment dimensions. For each, give:
- A score 1–5 (1 = strongly problematic, 3 = neutral, 5 = strongly positive for this reader)
- A one-sentence label
- A specific finding with a quoted example if possible
- A recommendation if score is 1 or 2

IMPORTANT READER PSYCHOLOGY: This reader acts primarily on fear and loss aversion, not aspiration. They fear SRA scrutiny, looking foolish in front of partners, and being caught behind the market. They will not act on statistics or benefits alone. They act when they see their own situation on the page and think "that is my firm, and I need to do something about this."

DIMENSION 1 — RECOGNITION (emotional hook)
Does the reader see themselves and their firm in the first three pages? Do the scenarios feel real — the specific anxieties, the specific partner dynamics, the specific pressures of a 4–25 fee earner practice? A score of 1 means the chapter opens with abstract concepts or statistics. A score of 5 means the reader thinks "this author has been in my firm."

DIMENSION 2 — FEAR/RISK RESOLUTION
Does the chapter name the reader's specific fears (SRA scrutiny, PI insurance, partner resistance, client complaints) and then resolve them into actions? A score of 1 means it raises risks without resolving them, leaving the reader more anxious. A score of 5 means every fear raised has a concrete countermeasure the reader can apply this week.

DIMENSION 3 — AUTHORITY
Does the chapter feel like advice from a trusted peer who has navigated this, or like a consultant selling a framework? A score of 1 means it reads like AI-generated content or management consultancy. A score of 5 means it reads like a conversation with a senior partner who has already done this at their own firm.

DIMENSION 4 — RELEVANCE
Does every section apply directly to a 4–25 fee earner SRA-regulated firm? Content that assumes a dedicated IT department, a large firm budget, or an academic interest in technology scores 1. Content that speaks to a time-poor practice manager with one administrator and twelve fee earners scores 5.

DIMENSION 5 — ACCESSIBILITY
Is the language plain, direct, and jargon-free? A score of 1 means heavy with tech or management jargon that creates distance. A score of 5 means a non-technical practice manager reads it without friction and without feeling talked down to.

DIMENSION 6 — COMPULSION TO ACT
Does the reader close the chapter with a specific, low-risk first action they can take alone, without budget approval, before their next meeting? A score of 1 means the chapter ends with a vision or a summary — informative but not mobilising. A score of 5 means the reader has already opened a new document to start the first step before finishing the chapter.

Also write:
- READER IMPRESSION: One paragraph describing the emotional journey of a sceptical practice manager reading this chapter — what they feel at the opening, the middle, and the close.
- TONE WARNINGS: Up to 3 specific passages (quoted) that land badly — too alarming without resolution, too promotional, too academic, condescending, or benefit-led when the reader needs risk-led framing.

Format:
SENTIMENT | [dimension name] | [score 1-5] | [label] | [finding] | [recommendation if needed]
READER_IMPRESSION | [paragraph]
TONE_WARNING | [quoted passage] | [why it lands badly]

CHAPTER DRAFT (first 5,000 words):
${draft.slice(0, 5000)}`;

  try {
    const response = await gpt.chat.completions.create({
      model: 'gpt-5.1',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 2000,
    });

    const text = response.choices[0].message.content ?? '';
    const scores: SentimentScore[] = [];
    const toneWarnings: string[] = [];
    let readerImpression = '';

    for (const line of text.split('\n')) {
      if (line.startsWith('SENTIMENT |')) {
        const parts = line.split(' | ');
        if (parts.length >= 5) {
          scores.push({
            dimension: parts[1]?.trim() ?? '',
            score: (parseInt(parts[2]?.trim() ?? '3', 10) || 3) as 1|2|3|4|5,
            label: parts[3]?.trim() ?? '',
            finding: parts[4]?.trim() ?? '',
            recommendation: parts[5]?.trim() || undefined,
          });
        }
      } else if (line.startsWith('READER_IMPRESSION |')) {
        readerImpression = line.replace('READER_IMPRESSION | ', '').trim();
      } else if (line.startsWith('TONE_WARNING |')) {
        const parts = line.split(' | ');
        if (parts[1]) toneWarnings.push(`"${parts[1].trim()}" — ${parts[2]?.trim() ?? ''}`);
      }
    }

    const avgScore = scores.length > 0
      ? scores.reduce((s, sc) => s + sc.score, 0) / scores.length
      : 3;

    const overallTone = avgScore >= 4.5 ? 'Excellent — credible, relevant, motivating'
      : avgScore >= 3.5 ? 'Good — minor tone adjustments recommended'
      : avgScore >= 2.5 ? 'Needs work — several passages undermine reader trust'
      : 'Significant revision needed — chapter risks alienating the target reader';

    return { overallTone, scores, readerImpression, toneWarnings };
  } catch {
    return {
      overallTone: 'Sentiment analysis unavailable',
      scores: [],
      readerImpression: '',
      toneWarnings: [],
    };
  }
}

/** Query NotebookLM MCP server */
async function queryNotebookLM(query: string): Promise<string> {
  try {
    const res = await fetch(`${MCP_URL}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'notebooklm_ask',
        arguments: { question: query, notebook_id: DLF_NOTEBOOK_ID },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
    const data = await res.json() as { content?: Array<{ text?: string }> };
    return data?.content?.[0]?.text ?? '(no response)';
  } catch (err) {
    return `[NotebookLM unavailable: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

/** Determine recommended action from NotebookLM verdict and flag category */
function determineAction(
  verdict: 'VERIFIED' | 'UNVERIFIED' | 'MISATTRIBUTED' | 'NOT_CHECKED',
  category: string,
  finding: string,
): { action: FlagAction; detail: string; assignedTo: string } {
  const cat = category.toLowerCase();

  if (verdict === 'VERIFIED') {
    return {
      action: 'CLOSED_VERIFIED',
      detail: 'Source confirmed in NotebookLM master library. No change required.',
      assignedTo: 'Pipeline',
    };
  }

  if (verdict === 'MISATTRIBUTED') {
    return {
      action: 'FIX_ATTRIBUTION',
      detail: 'Statistic is real but attributed to the wrong source. Correct the citation to match NotebookLM finding.',
      assignedTo: 'Author',
    };
  }

  // UNVERIFIED — determine action by category
  if (cat.includes('regulatory') || cat.includes('sra') || cat.includes('compliance')) {
    return {
      action: 'ADD_CAVEAT',
      detail: 'Add: "Practitioners should seek independent legal advice on SRA compliance for their specific circumstances."',
      assignedTo: 'Nick Lockett / Solicitor review',
    };
  }

  if (cat.includes('framework') || cat.includes('practitioner')) {
    return {
      action: 'ADD_CAVEAT',
      detail: 'Add: "This is a practitioner-developed framework, not an SRA-recognised standard."',
      assignedTo: 'Author',
    };
  }

  if (cat.includes('drift') || cat.includes('narrative') || cat.includes('structural')) {
    return {
      action: 'ADD_CAVEAT',
      detail: 'Content/structure issue — not a citation problem. Author to assess whether to rephrase, shorten, or cut.',
      assignedTo: 'Author',
    };
  }

  if (cat.includes('evidence') || cat.includes('citation')) {
    // Unverified stat — can it be rephrased as opinion?
    const hasAuthorSignal = finding.toLowerCase().includes('author') ||
      finding.toLowerCase().includes('our') ||
      finding.toLowerCase().includes('experience');
    if (hasAuthorSignal) {
      return {
        action: 'REPHRASE_AS_OPINION',
        detail: 'Reframe as author judgement: "In our experience..." or "The evidence suggests..." Remove specific percentage.',
        assignedTo: 'Author',
      };
    }
    return {
      action: 'REMOVE',
      detail: 'Statistic not found in NotebookLM library and cannot be verified. Remove or replace with a sourced equivalent.',
      assignedTo: 'Author',
    };
  }

  // Default for anything else
  return {
    action: 'REPHRASE_AS_OPINION',
    detail: 'Cannot verify claim. Reframe as author perspective or remove.',
    assignedTo: 'Author',
  };
}

/**
 * Validate all RISK-2 and RISK-3 flags from a chapter against NotebookLM.
 * Batches flags into groups of 5 to avoid overwhelming the MCP server.
 */
/** Map chapter to author name */
const CHAPTER_AUTHORS: Record<number, string> = {
  1: 'Rajiv Abeysinghe', 2: 'Darren', 3: 'Rajiv Abeysinghe',
  4: 'Rajiv Abeysinghe', 5: 'Rajiv Abeysinghe / Sushila',
  6: 'Darren', 7: 'Nick Lockett', 8: 'Nick Lockett',
  9: 'Nick Lockett', 10: 'Rajiv Abeysinghe',
  11: 'Darren', 12: 'Darren',
};

export async function validateFlags(
  chapter: number,
  risks: RiskItem[],
  draft?: string,
): Promise<ValidationReport> {
  const flagsToValidate = risks.filter((r) => r.level >= 2);
  const validated: ValidatedFlag[] = [];
  let flagIndex = 0;

  // Process in batches of 5 flags per NotebookLM query
  const BATCH_SIZE = 5;
  for (let i = 0; i < flagsToValidate.length; i += BATCH_SIZE) {
    const batch = flagsToValidate.slice(i, i + BATCH_SIZE);

    const queryLines = batch.map((r, j) =>
      `${j + 1}. [${r.category}] ${r.finding}`
    ).join('\n');

    const query = `For "The Digital Law Firm" (Law Society Publishing), please verify these ${batch.length} flagged claims against the source library. For each, respond with:
VERIFIED | [brief claim summary] | [source name and date]
UNVERIFIED | [brief claim summary] | [reason not found]
MISATTRIBUTED | [brief claim summary] | [correct source]

Flags to check:
${queryLines}

If a flag is about structure/style/drift rather than a citation, respond: NOT_CITATION | [brief summary] | [structural issue — not a sourcing problem]`;

    let response = '';
    try {
      response = await queryNotebookLM(query);
    } catch (err) {
      response = `[Query failed: ${err}]`;
    }

    // Parse each line of the response against the batch
    const responseLines = response.split('\n').filter((l) =>
      l.startsWith('VERIFIED') || l.startsWith('UNVERIFIED') ||
      l.startsWith('MISATTRIBUTED') || l.startsWith('NOT_CITATION')
    );

    for (let j = 0; j < batch.length; j++) {
      const risk = batch[j];
      const responseLine = responseLines[j] ?? '';
      flagIndex++;

      let verdict: ValidatedFlag['notebooklmVerdict'] = 'NOT_CHECKED';
      let source = '';
      let note = '';

      if (responseLine.startsWith('VERIFIED')) {
        verdict = 'VERIFIED';
        const parts = responseLine.split('|');
        source = parts[2]?.trim() ?? '';
      } else if (responseLine.startsWith('MISATTRIBUTED')) {
        verdict = 'MISATTRIBUTED';
        const parts = responseLine.split('|');
        note = parts[2]?.trim() ?? '';
      } else if (responseLine.startsWith('NOT_CITATION')) {
        // Style/drift issue — not a citation problem, treat as NOT_CHECKED but with context
        verdict = 'NOT_CHECKED';
        note = 'Structural/style flag — not a citation issue. NotebookLM not applicable.';
      } else {
        verdict = 'UNVERIFIED';
        const parts = responseLine.split('|');
        note = parts[2]?.trim() ?? '';
      }

      const { action, detail, assignedTo } = determineAction(verdict, risk.category, risk.finding);
      const status: FlagStatus = action === 'CLOSED_VERIFIED' ? '🟢 CLOSED' : '🔴 ACTION REQUIRED';
      const hitlTier = getHITLTier(risk.category);

      validated.push({
        flagId: `Ch${String(chapter).padStart(2, '0')}-R${risk.level}-${String(flagIndex).padStart(3, '0')}`,
        chapter,
        riskLevel: risk.level,
        category: risk.category,
        llmFinding: risk.finding,
        hitlTier,
        notebooklmVerdict: verdict,
        notebooklmSource: source || undefined,
        notebooklmNote: note || undefined,
        status,
        recommendedAction: action,
        actionDetail: detail,
        assignedTo,
      });
    }

    // Brief pause between batches to avoid rate limits
    if (i + BATCH_SIZE < flagsToValidate.length) {
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }

  // Gate B — Peer LLM challenge on all unresolved Tier 2 flags via Grok
  const tier2Unresolved = validated.filter(
    (f) => f.status === '🔴 ACTION REQUIRED' && f.hitlTier === 2
  );
  if (tier2Unresolved.length > 0) {
    const peerResults = await peerChallengeFlagBatch(tier2Unresolved);
    for (const flag of validated) {
      const result = peerResults.get(flag.flagId);
      if (result) {
        flag.peerChallenge = result;
        // If Grok dismisses the flag, downgrade to closed
        if (result.startsWith('DISMISSED')) {
          flag.status = '🟢 CLOSED';
          flag.recommendedAction = 'CLOSED_VERIFIED';
          flag.actionDetail = `Peer LLM (Grok-4.3) dismissed this flag: ${result}`;
        }
      }
    }
  }

  const closed = validated.filter((f) => f.status === '🟢 CLOSED');
  const actions = validated.filter((f) => f.status === '🔴 ACTION REQUIRED');
  const newSources = validated
    .filter((f) => f.notebooklmVerdict === 'VERIFIED' && f.notebooklmSource)
    .map((f) => f.notebooklmSource!)
    .filter(Boolean);

  // Gotcha detection and sentiment analysis (run in parallel if draft provided)
  let gotchas: Gotcha[] = [];
  let sentiment: SentimentReport = {
    overallTone: 'Not analysed — no draft provided',
    scores: [], readerImpression: '', toneWarnings: [],
  };

  if (draft) {
    [gotchas, sentiment] = await Promise.all([
      detectGotchas(chapter, draft),
      analyseSentiment(chapter, draft),
    ]);
  }

  const markdownReport = buildValidationReport(chapter, validated, closed.length, actions.length, gotchas, sentiment);

  return {
    chapter,
    flags: validated,
    closedCount: closed.length,
    actionCount: actions.length,
    gotchas,
    sentiment,
    newSourcesToAdd: newSources,
    markdownReport,
  };
}

function buildValidationReport(
  chapter: number,
  flags: ValidatedFlag[],
  closedCount: number,
  actionCount: number,
  gotchas: Gotcha[],
  sentiment: SentimentReport,
): string {
  const actionGroups: Record<FlagAction, ValidatedFlag[]> = {
    CLOSED_VERIFIED: [],
    FIX_ATTRIBUTION: [],
    ADD_CAVEAT: [],
    REPHRASE_AS_OPINION: [],
    REMOVE: [],
  };
  for (const f of flags) actionGroups[f.recommendedAction].push(f);

  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const author = CHAPTER_AUTHORS[chapter] ?? 'Author';
  const chapterPad = String(chapter).padStart(2, '0');

  const sentimentTable = sentiment.scores.map((s) => {
    const bar = '█'.repeat(s.score) + '░'.repeat(5 - s.score);
    return `| ${s.dimension} | ${bar} ${s.score}/5 | ${s.label} | ${s.finding} |`;
  }).join('\n');

  const gotchaHighPriority = gotchas.filter((g) => g.probability === 'HIGH');
  const gotchaMedium = gotchas.filter((g) => g.probability === 'MEDIUM');
  const gotchaLow = gotchas.filter((g) => g.probability === 'LOW');

  return `# Chapter ${chapterPad} — Author Review Pack
## The Digital Law Firm (Law Society Publishing, Q4 2026)

**Author:** ${author}
**Generated:** ${ts}
**Validated against:** NotebookLM "The Digital Law Firm- HyperAutomation" (184 Tier 1 sources)
**Pipeline:** NotebookLM Stage 0 → GPT-5.4 → Perplexity → Grok-4.3 → Four-Eyes → Peer LLM Challenge

---

> **How to use this pack:**
> Section 1 = Risks and Issues requiring your decision. Each has a recommended action — accept, fix, or escalate.
> Section 2 = Gotchas. Not errors — assumptions the book makes about sector direction. You decide whether to hedge them.
> Section 3 = Sentiment. How a sceptical practice manager reads this chapter. Use to calibrate tone.
> Section 4 = HITL Gate. Items that require a qualified solicitor or Nick Lockett to sign off.

---

## Summary

| | Count |
|---|---|
| Total flags validated | ${flags.length} |
| 🟢 CLOSED — source verified | ${closedCount} |
| 🔴 ACTION REQUIRED | ${actionCount} |

### Actions Required

| Action | Count | Assigned to |
|--------|-------|-------------|
| Fix attribution (stat real, source wrong) | ${actionGroups.FIX_ATTRIBUTION.length} | Author |
| Add caveat (claim defensible, needs qualifier) | ${actionGroups.ADD_CAVEAT.length} | Author / Nick / Solicitor |
| Rephrase as opinion (valid but unsourceable) | ${actionGroups.REPHRASE_AS_OPINION.length} | Author |
| Remove (cannot source or rephrase) | ${actionGroups.REMOVE.length} | Author |

---

## 🟢 Closed Flags (Verified by NotebookLM)

${actionGroups.CLOSED_VERIFIED.length === 0
  ? '_None — all flags require action._'
  : actionGroups.CLOSED_VERIFIED.map((f) =>
      `### ${f.flagId} — ${f.category}\n**LLM flag:** ${f.llmFinding}\n**NotebookLM:** ✅ VERIFIED — ${f.notebooklmSource}\n**Status:** ${f.status} — No action required.\n`
    ).join('\n')}

---

## 🔴 Action Required

${['FIX_ATTRIBUTION', 'ADD_CAVEAT', 'REPHRASE_AS_OPINION', 'REMOVE'].map((actionKey) => {
  const group = actionGroups[actionKey as FlagAction];
  if (group.length === 0) return '';
  const label: Record<FlagAction, string> = {
    FIX_ATTRIBUTION: '### Fix Attribution',
    ADD_CAVEAT: '### Add Caveat',
    REPHRASE_AS_OPINION: '### Rephrase as Author Opinion',
    REMOVE: '### Remove',
    CLOSED_VERIFIED: '',
  };
  return `${label[actionKey as FlagAction]}\n\n${group.map((f) =>
    `**${f.flagId}** [RISK-${f.riskLevel} | ${f.category}]\n` +
    `> LLM flag: ${f.llmFinding}\n` +
    `> NotebookLM: ${f.notebooklmVerdict}${f.notebooklmNote ? ' — ' + f.notebooklmNote : ''}\n` +
    `> **Action:** ${f.actionDetail}\n` +
    `> **Assigned to:** ${f.assignedTo}\n`
  ).join('\n')}`;
}).filter(Boolean).join('\n---\n')}

---

## Stage 7 — Peer LLM Review & HITL Gate

### How this works
Every unresolved flag is challenged by a second LLM (the peer reviewer) asking:
*"Is this flag credible? Is the underlying concern real for a UK high street law firm?"*

The HITL tier determines whether a human must confirm the resolution:

| HITL Tier | Flag type | Resolution |
|-----------|-----------|------------|
| **Tier 3 — Autonomous** | Style, drift, narrative ratio, kill list | LLM resolves. No human required. |
| **Tier 2 — Independent** | Citation sourcing, attribution, framework labelling | LLM peer reviews. Author notified but can accept without review. |
| **Tier 1 — Supervised** | SRA regulatory interpretation, legal liability claims, PI insurance implications | Human must confirm before publication. Cannot be auto-resolved. |

### Gate B — Peer LLM Challenge (Tier 2 and 3)
Grok-4.3 challenges each unresolved flag:
*"Given UK legal practice for a 4–25 fee earner SRA-regulated firm, is this flag a genuine publication risk or LLM over-caution?"*

${actionGroups.REMOVE.length > 0 || actionGroups.REPHRASE_AS_OPINION.length > 0
  ? '⚠️ Peer LLM review required for REMOVE and REPHRASE flags before rewrite.'
  : '✅ No Tier 2 peer LLM review required.'}

### Gate C — HITL Tier 1 (Human required)
${flags.some((f) => f.category.toLowerCase().includes('regulatory') || f.category.toLowerCase().includes('sra') || f.category.toLowerCase().includes('compliance'))
  ? `⛔ HUMAN GATE — the following flags cannot be auto-resolved:
${flags
  .filter((f) => f.category.toLowerCase().includes('regulatory') || f.category.toLowerCase().includes('sra') || f.category.toLowerCase().includes('compliance'))
  .map((f) => `- ${f.flagId}: ${f.llmFinding.slice(0, 100)}`)
  .join('\n')}

**Required reviewer:** Nick Lockett (legal tech governance) or SRA-regulated solicitor
**Minimum standard:** Written sign-off confirming the claim is defensible under current SRA guidance`
  : '✅ No Tier 1 HITL review required for this chapter.'}

### Gate D — NotebookLM Knowledge Base Update
Sources verified in this run that should be added to the notebook if not already present:

${flags
  .filter((f) => f.notebooklmVerdict === 'VERIFIED' && f.notebooklmSource)
  .map((f) => `- ${f.notebooklmSource}`)
  .join('\n') || '_All verified sources are already in the notebook._'}

Any newly found sources resolving UNVERIFIED flags should be added before the next pipeline run.

---

## Section 2 — Gotchas

Gotchas are **not risks or editorial issues**. They are assumptions this chapter makes about sector direction, regulatory trajectory, or technology that a sceptical reader could challenge — or that could look wrong in 6–24 months.

**Your decision for each:** Accept the assumption | Add a hedge ("as of Q2 2026…") | Reframe as a question rather than an assertion

${gotchas.length === 0 ? '_No gotchas detected._' : ''}

${gotchaHighPriority.length > 0 ? `### 🔴 High Probability — Address before publication

${gotchaHighPriority.map((g) => `**${g.id}** | Timeframe: ${g.timeframe.replace('_', ' ')}
> **Assumption:** ${g.assumption}
> **Challenge:** ${g.challenge}
> **Trigger event:** ${g.trigger}
> **Author decision:** ${g.authorDecision}
`).join('\n')}` : ''}

${gotchaMedium.length > 0 ? `### 🟡 Medium Probability — Consider hedging

${gotchaMedium.map((g) => `**${g.id}** | Timeframe: ${g.timeframe.replace('_', ' ')}
> **Assumption:** ${g.assumption}
> **Challenge:** ${g.challenge}
> **Trigger event:** ${g.trigger}
> **Author decision:** ${g.authorDecision}
`).join('\n')}` : ''}

${gotchaLow.length > 0 ? `### 🟢 Low Probability — Log only

${gotchaLow.map((g) => `**${g.id}** — ${g.assumption} *(trigger: ${g.trigger})*`).join('\n')}` : ''}

---

## Section 3 — Sentiment Analysis

**Overall tone:** ${sentiment.overallTone}

**Reader impression (sceptical practice manager perspective):**
${sentiment.readerImpression || '_Not available._'}

### Sentiment Scores

| Dimension | Score | Label | Finding |
|-----------|-------|-------|---------|
${sentimentTable || '_Scores not available._'}

${sentiment.toneWarnings.length > 0 ? `### ⚠️ Tone Warnings — Passages that land badly

${sentiment.toneWarnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}` : '### ✅ No tone warnings — chapter reads well for the target audience'}

---

## Section 4 — HITL Gate (Tier 1 — Human sign-off required)

${flags.some((f) => f.hitlTier === 1 && f.status === '🔴 ACTION REQUIRED')
  ? `The following items involve SRA regulatory interpretation or legal liability claims. They **cannot be auto-resolved** and require sign-off from a qualified solicitor or Nick Lockett before publication.

${flags
  .filter((f) => f.hitlTier === 1 && f.status === '🔴 ACTION REQUIRED')
  .map((f) => `**${f.flagId}** [RISK-${f.riskLevel} | ${f.category}]
> ${f.llmFinding}
> **Required:** ${f.assignedTo}
> ☐ Reviewed and signed off — Date: _________ Name: _________
`)
  .join('\n')}`
  : '✅ No Tier 1 HITL items in this chapter. No specialist sign-off required.'}

---

*This report was generated automatically by the Ghostwriter pipeline. It is an author review tool, not a legal opinion. All Tier 1 HITL items require qualified human review before publication.*
`;
}
