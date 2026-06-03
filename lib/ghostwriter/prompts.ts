// ─────────────────────────────────────────────────────────────────────────────
// The Digital Law Firm — Ghostwriter constants
// Source of truth: Notion "🧠 Claude Code PRD Hub" (synced 2026-05-08)
// ─────────────────────────────────────────────────────────────────────────────

// ── Author chapter assignments ────────────────────────────────────────────────
/** Rajiv: 1,3,4,5,10 | Darren: 2,6,11,12 | Nick: 7,8,9 | Sushila: security sections throughout */
export const CHAPTER_AUTHOR_NAMES: Record<number, string> = {
  1: 'Rajiv Abeysinghe',
  2: 'Darren',
  3: 'Rajiv Abeysinghe',
  4: 'Rajiv Abeysinghe',
  5: 'Rajiv Abeysinghe',
  6: 'Darren',
  7: 'Nick Lockett',
  8: 'Nick Lockett',
  9: 'Nick Lockett',
  10: 'Rajiv Abeysinghe',
  11: 'Darren',
  12: 'Darren',
};

// ── Author voice profiles ─────────────────────────────────────────────────────

export const AUTHOR_VOICES: Record<number, string> = {
  1: `Rajiv Abeysinghe — structured-conversational, concept-led, contrarian framing.
PATTERN: Context → reframe → angle → next step.
OPENING: Specific timestamp (8:47am not "early morning"). Concrete location. Physical detail. Problem immediately visible.
CONCEPT INTRODUCTION: [Term]. [One-sentence definition]. [Why it matters]. [Example].
SENTENCES: 12–15 words average, max 20. Active voice throughout.
BANNED: Passive voice where active works | "It is worth noting" | "In order to" | "This demonstrates" | Starting with context when reframe is stronger.
DIALOGUE: Direct speech, attribution after, minimal tags, actions between speech.`,

  2: `Darren Sylvester — "you" voice ALWAYS, evidence-first, scenario-led.
PATTERN: Problem → data → solution → action.
OPENING: Direct address ("You've identified..."). Present current state. Pose problem as reader's. NO third-person observation.
ACTION PATTERN: Imperative voice ("Start with...", "Track...", "Measure..."). Specific not generic ("Ten probate letters" not "some matters"). Time-bound ("Week one", never "eventually").
SENTENCES: 10–12 words average. Short paragraphs (2–4 sentences).
BANNED: Third-person ("The firm discovered...") | Passive voice | Academic distance ("One might conclude...") | Hedging ("Perhaps consider...") | Future conditional ("You could potentially...").
DIALOGUE: Often reported rather than quoted, embedded in "you" narration.`,

  3: 'Rajiv Abeysinghe — see Ch1.',
  4: 'Rajiv Abeysinghe — see Ch1.',
  5: 'Rajiv Abeysinghe — see Ch1.',
  6: 'Darren Sylvester — see Ch2.',

  7: `Nick Lockett — triadic structure, parenthetical precision, direct attribution.
PATTERN: Framework → three variants → implications. ALWAYS IN THREES (examples, steps, consequences, options, principles, components).
OPENING: Specific date + time. Short declarative facts. No scene-setting warmup.
PARENTHETICAL PATTERN: [Main statement] ([qualification]) [continuation].
DIRECT ATTRIBUTION: [Authority] requires/prohibits/mandates [specific requirement].
SENTENCES: 14–16 words average.
BANNED: Hedging ("might suggest", "could indicate") | Unnecessary qualification ("generally speaking") | Emotional language ("unfortunately", "surprisingly").
DRY WIT: Understated observation of absurdity. Factual never sarcastic.`,

  8: 'Nick Lockett — see Ch7.',
  9: 'Nick Lockett — see Ch7.',
  10: 'Rajiv Abeysinghe — see Ch1.',
  11: 'Darren Sylvester — see Ch2.',
  12: 'Darren Sylvester — see Ch2.',
};

// ── Kill list ─────────────────────────────────────────────────────────────────

/** Complete banned words and phrases. Zero tolerance — delete or rewrite. */
export const KILL_LIST =
  // AI smell words
  'Transformative | Delve | Delving | Landscape (business context) | Game-changer | Game-changing | ' +
  'Seamless | Seamlessly | Leverage (as verb — use "use") | Navigate (business context) | ' +
  'Robust (be specific) | Synergy | Paradigm | Holistic | Cutting-edge | Revolutionary | ' +
  'Innovative (show don\'t tell) | Disruptive | Ecosystem | Low-hanging fruit | ' +
  // Opening/transition phrases
  '"It is worth noting that..." | "In order to..." (→ use "To...") | ' +
  '"Due to the fact that..." (→ use "Because...") | "In today\'s rapidly evolving world..." | ' +
  '"As a matter of fact..." (just state the fact) | ' +
  // Closing/summary phrases
  '"In conclusion..." | "This highlights the importance of..." | "X is not just Y but also Z..." | ' +
  '"This demonstrates..." | ' +
  // Hedging
  '"It could be argued that..." | "Studies show..." (without naming) | ' +
  '"Research indicates..." (without citation) | "Perhaps consider..." | ' +
  '"You could potentially..." | "Generally speaking" | ' +
  // Passive voice where active works
  'passive voice where active works | ' +
  // Generic over specific
  'generic description where specific detail available | "Straightforward"';

// ── Tier rules ────────────────────────────────────────────────────────────────

export const TIER_RULES = `Evidence hierarchy:
- TIER 1 (cite directly): SRA, Law Society, EUR-Lex, legislation.gov.uk, Thomson Reuters (named reports + dates), Legal Futures (named journalist + date), Law Gazette (named journalist + date), Clio UK reports.
- TIER 2 (label as practitioner-developed): Task Classification Matrix, Shadow Efficiency Calculator, HITL Register, Story Files, Median Costing Method, Margin Liberation Model, Technology Register, Governance Ownership Matrix, SRA Show File, EU AI Act Compliance Dashboard, PI Insurance Evidence Package, Exit Interview Protocol.
- TIER 3 (label as illustrative): All fictional characters (Sarah, Emily, David, Jordan, Sophie, Marcus, Robert, James, Claire).
- DELETE if none apply: "approximately X%", "around X%", "industry average", "studies show" without named Tier 1 source.

COPYRIGHT LIMITS (CRITICAL):
- Maximum 15 words per direct quote.
- Maximum ONE quote per source per chapter. After quoting once, source is CLOSED — paraphrase everything else.
- Never reproduce song lyrics, poems, or haikus.`;

// ── RISK 5 fixes (mandatory — three known regulatory errors to never repeat) ──

export const RISK5_FIXES = `
THREE MANDATORY REGULATORY FIXES — apply in every relevant chapter:

FIX 1 (Chapter 5 — Data Residency):
❌ NEVER: "GDPR Article 9 + SRA Outcome 6.3 require UK data residency"
✅ CORRECT: "UK GDPR Chapter V permits international transfers via adequacy decisions, SCCs, or BCRs. UK data residency is PREFERRED for simplicity but not legally mandatory."

FIX 2 (Chapter 9 — SRA Guidance):
❌ NEVER: "SRA Technology Guidance 2024" (does not exist)
✅ CORRECT: "SRA Standards & Regulations (current as of 2025)" or specific Code Outcome numbers (e.g. Code Outcome 8.5)

FIX 3 (Chapter 10 — PI Insurance):
❌ NEVER: "Law Society PI Insurance Practice Note 2025" (does not exist)
✅ CORRECT: "Insurance Act 2015 Section 3 (duty of fair presentation) and Section 8 (warranties)"
`.trim();

// ── Character profiles (canonical data — do not alter in rewrites) ────────────

export const CHARACTER_PROFILES = `
PRIMARY CHARACTERS — canonical facts, never alter in any rewrite:

SARAH MITCHELL (Practice Manager)
- 12-person high street firm, East Anglia. 10 fee earners (3 partners, 7 solicitors/paralegals).
- Annual budget: £420K. CILEX background. Arrives 8:47am daily.
- Key data: 5,400 trapped hours firm-wide | 90-day pilot ROI 628% | Year 1 ROI 1,346% (not 2,016%)
- Shadow inefficiency: 1,620 hrs × £75/hr = £121,500 decision-making overhead (Ch1) [AUTHOR-REVIEWABLE — tag @Rajiv Abeysinghe to confirm or challenge]
- Arc: Ch1 discovers trapped hours → Ch3 90-day pilot → Ch8 SRA inspection (72hr notice, zero findings) → Ch12 ROI

DAVID HARRISON (Senior Partner)
- Late 50s. Qualified 1996, equity partner 1998. PI: £8,500 (2023) → £12,000 (2026).
- Signature line: "If we save 40 hours, where does the revenue come from?"
- Approves cautiously, never reverses decisions.

EMILY PATTERSON (Probate Specialist)
- 8 years qualified, late 30s. Retires December 2026.
- Baseline: 60 min/probate letter → 26 min with Story Files (20 draft + 6 review).
- 57 probate letters/year. Story File: 17 decision points documented.

JORDAN HAYES (Junior Solicitor)
- Mid-20s, 2 years qualified. Innovator (Rogers 2.5%).
- Error rate: 6.5% (Tier 1, June 2026) → 4.2% (Tier 2, Oct 2026) → <2% (Tier 3, Oct 2027).

JAMES STEWART (Comparison — different firm)
- 50-partner Midlands firm. 800 completions/year. Fixed fee: £1,575/completion.
- Margin: 18% → 31%. Revenue: -7% Year 1 (hourly) → +28% Year 2 (fixed fee).

SOPHIE WILLIAMS — Early Majority. Adoption: 23% (March 2027) → 81% (Oct 2027).
MARCUS THOMPSON — Late Majority. 10-letter trial → "Expected 100% errors. Got 10%. Fine, I'll use it."
ROBERT ASHFORD — Partner, mid-40s. Leads by example. 90-day AI-first commitment (Ch11).
CLAIRE — Junior, 3yr qualified. Week 3 Story File tester. 9/10 match Emily standard.

VERIFIED DATA POINTS (never alter):
- 5,400 trapped hours (firm-wide, Ch1)
- Sarah's shadow inefficiency: 1,620 hours × £75/hr = £121,500 decision-making overhead (Ch1) [AUTHOR-REVIEWABLE] ← use £121,500 not £121,000
- 90-day pilot: 72 letters, 34 min savings, 6.5% error, 0 client errors, ROI 628%
- Year 1: 3,247 tasks, 1,840 hours freed, £138K value, £9,655 investment, ROI 1,346%
- SRA inspection: March 2027, zero findings
- James's firm: 800 completions, 18%→31% margin, £1,575 fixed fee
- Emily: 60 min → 26 min (17 decision points), retires December 2026
`.trim();

// ── Mandatory chapter structure ───────────────────────────────────────────────

export const CHAPTER_STRUCTURE = `
Every chapter MUST contain these sections in order:
1. RELEVANCE FILTER (TLDR) — who should read, who can skip
2. THE SCENARIO — opening scene (400–600 words)
3. THE LOGIC — 3 points explaining why
4. THE BLUEPRINT — 7–10 step implementation
5. THE ROI — time investment + outcomes
6. DELIVERABLES — 5–7 concrete tools
7. CITATIONS — Tier 1 sources only
8. RISKS — 4–6 risks with mitigations
9. PRACTITIONER DISCLAIMER — framework limitations (see PRACTITIONER_DISCLAIMER)
`.trim();

export const PRACTITIONER_DISCLAIMER = `
**NOTE:** The following frameworks are practitioner-developed tools based on one UK firm's implementation experience: [List frameworks used in chapter]

These are NOT SRA-recognised standards or Law Society recommended practices. Results will vary based on firm size, practice areas, jurisdiction, and implementation quality.
`.trim();

// ── High-Flesch writing standards ─────────────────────────────────────────────

/**
 * HIGH-FLESCH WRITING STANDARDS — target Flesch 75–85
 *
 * Benchmark: SRA enforcement notices (Flesch 80–85). Good to Great, Which? magazine.
 * Reader: UK practice manager, 4–25 fee earners, SRA-regulated, time-poor.
 *
 * FIVE PRINCIPLES:
 * 1. PUNCH OPENER — every section starts in 6–10 words. State the consequence immediately.
 * 2. RHYTHM RULE — medium (12–16 w) → medium → SHORT (≤6 w). Repeat.
 * 3. COMPLEXITY INTO STRUCTURE — comparisons, processes, condition lists → bullets/tables.
 * 4. EARNED CONVICTION — reader arrives at urgency through evidence, not advocacy.
 * 5. CONSEQUENCE OF NOT ACTING — every major section names what happens if they do nothing.
 *
 * SENTENCE TARGETS: ASL ≤ 16 words | ASW ≤ 1.45 | Polysyllabic density < 25%
 *
 * SAXON VOCABULARY:
 * governance→rules/controls | transparency→openness | documentation→records |
 * implementation→roll-out | assessment→check | classification→type/label |
 * organisation→firm | monitoring→tracking | responsibility→duty |
 * compliance→meeting the rules | regulation→SRA's rules | framework→plan |
 * significant→big/major/key | effectively→well/cleanly
 *
 * NICK LOCKETT-SPECIFIC (Ch07–09):
 * - Invert "The X" openers → direct address ("Your Register needs...")
 * - Break semicolon chains → numbered bullets
 * - Lead with firm consequence; regulatory detail in indented box after
 * - Ch09 hard ceiling: EU AI Act conditionals require compound sentences; accept Flesch 65+
 */
export const HIGH_FLESCH_STANDARDS = `Target Flesch ≥ 75.
Punch openers (6–10 words). Rhythm: medium → medium → SHORT. Complexity → bullets.
Earned conviction (evidence, not advocacy). Consequence of not acting in every section.
Saxon over Latinate vocabulary. ASL ≤ 16. ASW ≤ 1.45.`;

// ── Audio generation defaults (NotebookLM — all voiceovers, narrations, discussions) ──

/**
 * AUDIO DEFAULTS — apply as custom_prompt to every NotebookLM audio generation.
 *
 * These are non-negotiable standards for all Chapter audio across the project.
 * Do not generate audio without including these instructions.
 */
export const AUDIO_DEFAULTS = `
ACCENTS — TWO-STAGE PRODUCTION:
- DRAFT (NotebookLM): American accents accepted for internal review only. Focus on content, structure, pause prompts, and quotes. Do not distribute to external readers.
- FINAL (ElevenLabs): All audio re-voiced in British English before publication to Skool or readers.
  - Audiobook / narration: single female narrator, educated upper-middle-class English, 30s–40s (Home Counties / BBC Radio 4 style). Suggested voice: Alice or Charlotte.
  - Discussion / debate: two hosts, contrasting British Isles accents (e.g. Scottish + Southern English, or Welsh + London). Suggested voices: Harry + Alice.
  - Budget: ElevenLabs Creator plan (~$22/month) covers all 12 chapters at final production stage.

BRANDING (CRITICAL): Never say "Rajiv Abeysinghe's work", "the authors' method", "the authors' approach", or "the authors' framework".
Always say "The Scale Foundry method", "The Scale Foundry approach", or refer to the book "The Digital Law Firm" by name.
The Scale Foundry is the primary brand. Individual author names are not the brand.

ACRONYMS: On first use, always say the full term followed by the abbreviation.
Examples:
- COTS → "Commercial Off-The-Shelf software — such as the legal technology platforms increasingly adopted by UK firms"
- HITL → "Human In The Loop — HITL"
- ROI → "Return On Investment — ROI"
- SRA → "Solicitors Regulation Authority — SRA" (if audience may not know it)
After first use, abbreviation alone is fine.

TONE: Evidence-first, no hype. Practitioner audience — UK practice managers and senior partners.

DISCUSSION FORMAT — mandatory for all debate/discussion audio:

1. LISTENER INTERACTIONS: At natural chapter breaks, one host must directly address the listener with a question or task. Examples:
   - "Before we go on — pause here. How many hours a week do you think your firm spends on decisions that a well-trained system could handle? Write that number down."
   - "Here's your action from this section: pull your last three months of time-recording data and look for the pattern The Scale Foundry calls trapped hours. It takes twenty minutes. Do it before you listen to the next chapter."
   - "Pause and think: if your firm has ten fee earners, and each loses just two hours a week to avoidable decisions, what does that cost you annually at your average charge-out rate?"

2. PAUSE PROMPTS: Use explicit "Pause and think" or "Pause and review" cues — at least two per discussion, placed at the moments of highest practical relevance.

3. DIRECT QUOTES: Where the chapter contains a striking line, one host must quote it directly and briefly — introducing it as: "The book puts it well here..." or "There's a line in this chapter that I think every managing partner should hear..." Keep quotes under 15 words. Do not paraphrase when the original is sharp.

4. TASKS/ACTIONS: Each discussion must end with a clear 3-point action list for the listener — concrete, time-bound, firm-specific. Example: "Before next week: one — calculate your trapped hours using the Shadow Efficiency formula. Two — identify your highest-volume repeatable task. Three — book thirty minutes with your practice manager to review the result."
`.trim();
