/**
 * Stage 6 — Voice Authenticity
 * =============================
 * Deterministic counter-AI structural checks. Catches AI-flavoured prose
 * patterns that the readability pass misses. No LLM calls, no tokens.
 *
 * The seven checks:
 *   1. Repetitive paragraph starts — 3+ adjacent paras opening with same word
 *   2. Paragraph length uniformity — 3+ consecutive paras within ±20% length
 *   3. Em-dash density and storms — max 1 per 200 words; storm = 2+ in 50 words
 *   4. Named-specifics density — ≥5 specific references per 1,000 words
 *   5. HITL placeholders — count [INSERT…], [VERIFY…], [UNVERIFIED] markers
 *   6. Monday-morning close — final paragraph contains a concrete next action
 *   7. Opening boilerplate — generic "In this chapter we will explore…" leads
 *
 * Thresholds live in config/voice_authenticity.yaml so editors can tune
 * without code changes. The defaults below match the Counter-AI rules in
 * ~/.claude/CLAUDE.md.
 *
 * For a semantic voice-match pass against an author's known writing samples,
 * see auditVoiceAuthenticityWithLLM() — gated behind an explicit flag because
 * it spends tokens. Cron it for off-peak.
 */

export interface RepetitiveStart {
  word: string;
  paragraphIndices: number[];
}

export interface EmDashStorm {
  excerpt: string;        // 50-word window containing the storm
  dashCount: number;
}

export interface VoiceAuthenticityResult {
  // Per-check signals
  repetitiveStarts: RepetitiveStart[];
  uniformParagraphClusters: number;        // count of 3-para windows within ±20%
  emDashCount: number;
  emDashPer200Words: number;
  emDashStorms: EmDashStorm[];
  namedSpecificsCount: number;
  namedSpecificsPer1000Words: number;
  hitlPlaceholders: number;
  mondayClosePresent: boolean;
  boilerplateOpener: boolean;

  // Aggregate
  wordCount: number;
  paragraphCount: number;
  blockers: string[];                       // reasons for FAIL
  warnings: string[];                       // reasons for ADVISORY
  overallGrade: 'PASS' | 'ADVISORY' | 'FAIL';
}

interface VoiceAuthenticityConfig {
  repetitiveStartWindow: number;            // adjacent paragraphs to check (default 3)
  paragraphUniformityWindow: number;        // adjacent paragraphs to check (default 3)
  paragraphUniformityTolerance: number;     // ±fraction of mean word count (default 0.20)
  emDashStormWordWindow: number;            // word window for "storm" detection (default 50)
  emDashStormThreshold: number;             // dashes within window to count as storm (default 2)
  emDashPer200WordsMax: number;             // dashes per 200 words (default 1)
  namedSpecificsPer1000WordsMin: number;    // min density (default 5)
  mondayCloseRegex: RegExp;                 // pattern that counts as concrete action
  boilerplateOpenerRegex: RegExp;           // pattern that counts as AI-flavoured opener
}

export const DEFAULT_CONFIG: VoiceAuthenticityConfig = {
  repetitiveStartWindow: 3,
  paragraphUniformityWindow: 3,
  paragraphUniformityTolerance: 0.20,
  emDashStormWordWindow: 50,
  emDashStormThreshold: 2,
  emDashPer200WordsMax: 1,
  namedSpecificsPer1000WordsMin: 5,
  mondayCloseRegex: /\b(this (monday|tuesday|wednesday|thursday|friday|week)|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|before your next|ask\b|check\b|book\b|write\b|email\b|call\b|start there|start with)/i,
  boilerplateOpenerRegex: /^\s*(in this chapter|this chapter (will|explores|examines|covers|discusses)|we will (explore|examine|cover|discuss)|in the (modern|today's|current|rapidly evolving)|in an era|in today's (world|landscape|environment))/i,
};

// ── Tokenisation helpers ──────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function firstSignificantWord(paragraph: string): string {
  // Strip leading markdown markers, list bullets, etc.
  const stripped = paragraph
    .replace(/^[#>*\-+]+\s*/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
  const m = stripped.match(/^([A-Za-z][A-Za-z'’]*)/);
  return m ? m[1] : '';
}

// ── Check 1: Repetitive paragraph starts ──────────────────────────────────────

function findRepetitiveStarts(
  paragraphs: string[],
  windowSize: number,
): RepetitiveStart[] {
  const firsts = paragraphs.map(firstSignificantWord);
  const hits: RepetitiveStart[] = [];
  for (let i = 0; i + windowSize <= firsts.length; i++) {
    const window = firsts.slice(i, i + windowSize);
    const first = window[0].toLowerCase();
    if (!first) continue;
    if (window.every(w => w.toLowerCase() === first)) {
      hits.push({
        word: window[0],
        paragraphIndices: Array.from({ length: windowSize }, (_, k) => i + k),
      });
    }
  }
  return hits;
}

// ── Check 2: Paragraph length uniformity ──────────────────────────────────────

function countUniformParagraphClusters(
  paragraphs: string[],
  windowSize: number,
  tolerance: number,
): number {
  const lengths = paragraphs.map(countWords);
  let clusters = 0;
  for (let i = 0; i + windowSize <= lengths.length; i++) {
    const window = lengths.slice(i, i + windowSize);
    const mean = window.reduce((a, b) => a + b, 0) / windowSize;
    if (mean < 5) continue; // skip trivially-short paragraphs
    const withinTol = window.every(
      len => Math.abs(len - mean) / mean <= tolerance,
    );
    if (withinTol) clusters++;
  }
  return clusters;
}

// ── Check 3: Em-dash density and storms ───────────────────────────────────────

function analyseEmDashes(
  text: string,
  config: VoiceAuthenticityConfig,
): { count: number; per200: number; storms: EmDashStorm[] } {
  // Accept en-dash (–), em-dash (—), and double-hyphen (--) as the same signal.
  const dashRegex = /—|–|--/g;
  const dashes: number[] = []; // character indices
  let m: RegExpExecArray | null;
  while ((m = dashRegex.exec(text)) !== null) {
    dashes.push(m.index);
  }
  const count = dashes.length;
  const words = countWords(text);
  const per200 = words > 0 ? (count / words) * 200 : 0;

  // Storm detection — slide a window of `emDashStormWordWindow` words across
  // the text and flag any window containing >= threshold dashes.
  const storms: EmDashStorm[] = [];
  const tokens = text.split(/\s+/);
  const windowWords = config.emDashStormWordWindow;
  for (let i = 0; i + windowWords <= tokens.length; i += Math.max(1, Math.floor(windowWords / 2))) {
    const slice = tokens.slice(i, i + windowWords).join(' ');
    const sliceDashes = (slice.match(dashRegex) || []).length;
    if (sliceDashes >= config.emDashStormThreshold) {
      storms.push({ excerpt: slice.slice(0, 200), dashCount: sliceDashes });
    }
  }
  // Also catch storms in short documents that don't fill a full window.
  if (storms.length === 0 && count >= config.emDashStormThreshold && tokens.length < windowWords) {
    storms.push({ excerpt: text.slice(0, 200), dashCount: count });
  }
  return { count, per200, storms };
}

// ── Check 4: Named-specifics density ──────────────────────────────────────────

function countNamedSpecifics(text: string): number {
  let hits = 0;
  // Specific times — 8:47am, 14:30
  hits += (text.match(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi) || []).length;
  // Specific dates — 14 March 2026, March 14 2026, 2026-03-14
  hits += (text.match(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi) || []).length;
  hits += (text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi) || []).length;
  hits += (text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).length;
  // Currency amounts — £4,200, $1.5m, €500
  hits += (text.match(/[£$€]\s?\d[\d,]*(\.\d+)?(m|bn|k)?/gi) || []).length;
  // Percentages — 62%, 27.2%
  hits += (text.match(/\b\d+(\.\d+)?%/g) || []).length;
  // Capitalised proper nouns (2+ caps in a row, like "Sarah Lockett", "SRA Code", "Law Society")
  // Single-word proper nouns are too noisy; require a sequence.
  hits += (text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g) || []).length;
  hits += (text.match(/\b[A-Z]{2,}\b/g) || []).length; // acronyms: SRA, EU, GDPR
  // Article / Section / Clause refs — "Article 12", "Section 3.3", "Clause 8.5"
  hits += (text.match(/\b(Article|Section|Clause|Outcome|Rule|Paragraph)\s+\d+(\.\d+)*\b/gi) || []).length;
  // Day-of-week with context — "By Monday", "This Friday"
  hits += (text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g) || []).length;
  // Specific numbers in legal/business context (three fee earners, four checks)
  hits += (text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(fee earners|firms|partners|solicitors|clients|checks|things|reasons|steps|stages)\b/gi) || []).length;
  return hits;
}

// ── Check 5: HITL placeholders ────────────────────────────────────────────────

function countHITLPlaceholders(text: string): number {
  return (text.match(/\[(INSERT|VERIFY|UNVERIFIED|AUTHOR VOICE PASS REQUIRED|TODO|CITATION NEEDED)[^\]]*\]/gi) || []).length;
}

// ── Check 6: Monday-morning close ─────────────────────────────────────────────

function hasMondayClose(
  paragraphs: string[],
  config: VoiceAuthenticityConfig,
): boolean {
  if (paragraphs.length === 0) return false;
  // Look at the final 1-2 paragraphs.
  const tail = paragraphs.slice(-2).join(' ');
  // Explicit anti-pattern: "In conclusion" / "To summarise" without an action.
  if (/^(in conclusion|to summarise|to sum up|in summary|overall)/i.test(paragraphs[paragraphs.length - 1])) {
    // Only counts as Monday-close if it ALSO has a concrete action verb after it.
    const concreteActions = /\b(ask|check|book|write|email|call|run|start|do|build|set up|review|measure)\b/i;
    if (!concreteActions.test(paragraphs[paragraphs.length - 1])) return false;
  }
  return config.mondayCloseRegex.test(tail);
}

// ── Check 7: Opening boilerplate ──────────────────────────────────────────────

function hasBoilerplateOpener(
  paragraphs: string[],
  config: VoiceAuthenticityConfig,
): boolean {
  if (paragraphs.length === 0) return false;
  // Skip headings.
  const firstBody = paragraphs.find(p => !p.startsWith('#'));
  if (!firstBody) return false;
  return config.boilerplateOpenerRegex.test(firstBody);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all 7 Stage 6 checks against the chapter text. Pure function, no IO.
 * Tunable via the optional config (falls back to DEFAULT_CONFIG).
 */
export function auditVoiceAuthenticity(
  text: string,
  config: Partial<VoiceAuthenticityConfig> = {},
): VoiceAuthenticityResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const paragraphs = splitParagraphs(text);
  const wordCount = countWords(text);

  const repetitiveStarts = findRepetitiveStarts(paragraphs, cfg.repetitiveStartWindow);
  const uniformParagraphClusters = countUniformParagraphClusters(
    paragraphs,
    cfg.paragraphUniformityWindow,
    cfg.paragraphUniformityTolerance,
  );
  const { count: emDashCount, per200: emDashPer200Words, storms: emDashStorms } =
    analyseEmDashes(text, cfg);
  const namedSpecificsCount = countNamedSpecifics(text);
  const namedSpecificsPer1000Words =
    wordCount > 0 ? (namedSpecificsCount / wordCount) * 1000 : 0;
  const hitlPlaceholders = countHITLPlaceholders(text);
  const mondayClosePresent = hasMondayClose(paragraphs, cfg);
  const boilerplateOpener = hasBoilerplateOpener(paragraphs, cfg);

  // Grade aggregation.
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (repetitiveStarts.length > 0) {
    blockers.push(
      `${repetitiveStarts.length} window(s) of ${cfg.repetitiveStartWindow} paragraphs starting with the same word (e.g. "${repetitiveStarts[0].word}")`,
    );
  }
  if (uniformParagraphClusters > 0) {
    blockers.push(
      `${uniformParagraphClusters} cluster(s) of ${cfg.paragraphUniformityWindow} consecutive paragraphs within ±${(cfg.paragraphUniformityTolerance * 100).toFixed(0)}% length`,
    );
  }
  if (emDashStorms.length > 0) {
    blockers.push(`${emDashStorms.length} em-dash storm(s) detected (${cfg.emDashStormThreshold}+ dashes in ${cfg.emDashStormWordWindow}-word window)`);
  }
  if (emDashPer200Words > cfg.emDashPer200WordsMax) {
    warnings.push(`em-dash density ${emDashPer200Words.toFixed(2)} per 200 words exceeds max ${cfg.emDashPer200WordsMax}`);
  }
  if (namedSpecificsPer1000Words < cfg.namedSpecificsPer1000WordsMin) {
    warnings.push(
      `named-specifics density ${namedSpecificsPer1000Words.toFixed(1)} per 1,000 words is below the minimum ${cfg.namedSpecificsPer1000WordsMin}`,
    );
  }
  if (boilerplateOpener) {
    blockers.push('opening paragraph matches AI-boilerplate pattern (e.g. "In this chapter we will explore…")');
  }
  if (!mondayClosePresent && paragraphs.length >= 2) {
    warnings.push('final paragraph lacks a concrete Monday-morning action');
  }
  if (hitlPlaceholders > 0) {
    warnings.push(`${hitlPlaceholders} HITL placeholder(s) still present — resolve before publishing`);
  }

  let overallGrade: 'PASS' | 'ADVISORY' | 'FAIL';
  if (blockers.length >= 2) overallGrade = 'FAIL';
  else if (blockers.length === 1 || warnings.length >= 2) overallGrade = 'ADVISORY';
  else overallGrade = 'PASS';

  return {
    repetitiveStarts,
    uniformParagraphClusters,
    emDashCount,
    emDashPer200Words,
    emDashStorms,
    namedSpecificsCount,
    namedSpecificsPer1000Words,
    hitlPlaceholders,
    mondayClosePresent,
    boilerplateOpener,
    wordCount,
    paragraphCount: paragraphs.length,
    blockers,
    warnings,
    overallGrade,
  };
}

/**
 * Optional LLM-backed voice-match pass. Compares the chapter against an
 * author's known writing samples and returns a similarity-style verdict.
 *
 * NOT WIRED YET — scaffolded so a future cron job can run it off-peak when
 * tokens are cheap. Today's deterministic checks above are zero-cost and
 * cover the structural failure modes.
 *
 * @internal
 */
export async function auditVoiceAuthenticityWithLLM(
  _text: string,
  _author: string,
  _samples: string[],
): Promise<{ similarity: number; rationale: string }> {
  throw new Error(
    'auditVoiceAuthenticityWithLLM is scaffolded but not yet wired. ' +
      'Build the OpenAI/Anthropic call and gate behind a --llm flag on the CLI before enabling.',
  );
}
