/**
 * Stage 6.5 — Quote Integrity
 * ============================
 * Deterministic checks for quote and statistic provenance. Catches:
 *   1. Orphan quotes — quoted spans with no attribution within ±N words
 *   2. Attributed quotes lacking a year — "Lord Atkin said …" without [1932]
 *   3. Statistics without a named source — "62%" without report+year nearby
 *   4. Regulatory paraphrase risk — SRA / EU AI Act / GDPR references
 *      using paraphrase verbs ("requires", "says", "states") instead of
 *      verbatim quotation. Per the Counter-AI rules, regulatory text MUST
 *      be quoted verbatim from sra.org.uk or EUR-Lex.
 *   5. Known misattributions — small dictionary of famous quotes that
 *      get attributed to the wrong author.
 *
 * Zero LLM cost. All regex / context windows. If you want a semantic
 * "does this quote actually appear in the cited source" check, build it
 * separately as an off-peak cron — Stage 6.5b — and gate behind a flag.
 */

export interface QuoteSpan {
  text: string;
  start: number;
  end: number;
}

export interface MisattributionHit {
  quote: string;
  author: string;        // the (wrong) author named in the prose
  actualAuthor: string;  // the actual source
}

export interface QuoteIntegrityResult {
  quotesFound: number;
  orphanQuotes: QuoteSpan[];
  quotesWithoutYear: QuoteSpan[];
  statisticsWithoutSource: string[];   // excerpts of unsourced stats
  regulatoryParaphrases: string[];     // excerpts of paraphrased regs
  misattributions: MisattributionHit[];
  blockers: string[];
  warnings: string[];
  overallGrade: 'PASS' | 'ADVISORY' | 'FAIL';
}

// ── Quote extraction ──────────────────────────────────────────────────────────

/**
 * Find quoted spans. Handles straight quotes ("…" / '…') and curly
 * quotes (“…” / ‘…’). Skips apostrophes in contractions by requiring
 * a paired closing quote within the same paragraph.
 */
function extractQuotes(text: string): QuoteSpan[] {
  const quotes: QuoteSpan[] = [];

  // Curly double quotes
  const curlyDouble = /“([^”]{8,})”/g;
  let m: RegExpExecArray | null;
  while ((m = curlyDouble.exec(text)) !== null) {
    quotes.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }

  // Straight double quotes — only when paired within the same paragraph.
  // Lower-bound of 8 chars filters single-word emphasis like "the".
  const straightDouble = /"([^"]{8,})"/g;
  while ((m = straightDouble.exec(text)) !== null) {
    quotes.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }

  // Curly singles — used in British prose for inner quotes; require ≥ 8 chars
  const curlySingle = /‘([^’]{8,})’/g;
  while ((m = curlySingle.exec(text)) !== null) {
    quotes.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }

  // Deduplicate by start index
  const seen = new Set<number>();
  return quotes
    .filter(q => {
      if (seen.has(q.start)) return false;
      seen.add(q.start);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

// ── Attribution detection ─────────────────────────────────────────────────────

const ATTRIBUTION_VERBS = [
  'said', 'says', 'wrote', 'writes', 'stated', 'states', 'noted', 'notes',
  'observed', 'observes', 'remarked', 'remarks', 'argued', 'argues',
  'concluded', 'concludes', 'found', 'finds', 'reported', 'reports',
  'told', 'tells', 'put it', 'in the words of',
];

const ATTRIBUTION_PREFIXES = [
  /\baccording to\b/i,
  /\bper\b/i,                            // "per Lord Atkin"
  /\bin the words of\b/i,
  /\bas\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(said|wrote|put it|noted|argued)\b/i,
  /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:said|says|wrote|writes|stated|states|noted|notes|observed|argued|concluded|reports?|found|told)\b/,
];

const ATTRIBUTION_WINDOW = 80; // characters either side of the quote

function contextWindow(text: string, span: QuoteSpan): string {
  const start = Math.max(0, span.start - ATTRIBUTION_WINDOW);
  const end = Math.min(text.length, span.end + ATTRIBUTION_WINDOW);
  return text.slice(start, end);
}

function hasAttribution(text: string, span: QuoteSpan): boolean {
  const ctx = contextWindow(text, span);
  for (const re of ATTRIBUTION_PREFIXES) {
    if (re.test(ctx)) return true;
  }
  const verbList = ATTRIBUTION_VERBS.map(v => v.replace(/ /g, '\\s+')).join('|');
  const verbRegex = new RegExp(`\\b(${verbList})\\b`, 'i');
  return verbRegex.test(ctx);
}

function hasYear(text: string, span: QuoteSpan): boolean {
  const ctx = contextWindow(text, span);
  return /\b(19|20)\d{2}\b/.test(ctx);
}

// ── Statistic detection ───────────────────────────────────────────────────────

const STATISTIC_REGEX = /\b\d+(\.\d+)?%/g;
const SOURCE_NEAR_STAT_WINDOW = 120;
const SOURCE_INDICATORS = [
  /\b(report|study|survey|index|review|paper|whitepaper|analysis)\b/i,
  /\b(LEAP|Thomson Reuters|Law Society|SRA|Bar Council|OECD|World Bank|McKinsey|Deloitte|PwC|KPMG|EY|Gartner|IDC|Statista|YouGov|Ipsos|Wolters Kluwer)\b/,
  /\baccording to\b/i,
  /\[UNVERIFIED/i,
  /\b(19|20)\d{2}\b/,                    // any year nearby
];

function detectUnsourcedStats(text: string): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = STATISTIC_REGEX.exec(text)) !== null) {
    const start = Math.max(0, m.index - SOURCE_NEAR_STAT_WINDOW);
    const end = Math.min(text.length, m.index + m[0].length + SOURCE_NEAR_STAT_WINDOW);
    const ctx = text.slice(start, end);

    // A stat needs BOTH a source indicator AND a year (or an UNVERIFIED marker).
    const hasUnverified = /\[UNVERIFIED/i.test(ctx);
    if (hasUnverified) continue;

    const hasYearNearby = /\b(19|20)\d{2}\b/.test(ctx);
    const hasReportName = SOURCE_INDICATORS.slice(0, 3).some(re => re.test(ctx));

    if (!hasYearNearby || !hasReportName) {
      const excerpt = text.slice(Math.max(0, m.index - 30), Math.min(text.length, m.index + m[0].length + 30));
      hits.push(excerpt.trim());
    }
  }
  return hits;
}

// ── Regulatory paraphrase detection ───────────────────────────────────────────

const REGULATORY_BODIES = /\b(SRA(?:\s+Code)?|EU\s+AI\s+Act|UK\s+GDPR|GDPR|Data\s+Protection\s+Act|Solicitors\s+Regulation\s+Authority|ICO|FCA|EUR-Lex)\b/i;
const REGULATORY_REF_REGEX = /\b(SRA(?:\s+Code)?|EU\s+AI\s+Act|UK\s+GDPR|GDPR)\s+(Article|Section|Outcome|Rule|Paragraph|Clause|Principle)?\s*\d+(\.\d+)*\b/gi;
const PARAPHRASE_VERBS = /\b(requires?|says?|states?|mandates?|stipulates?|provides?|specifies?|sets\s+out|prescribes?|demands?|expects?|obliges?|forbids?|prohibits?)\b/i;

function detectRegulatoryParaphrases(text: string, quotes: QuoteSpan[]): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  REGULATORY_REF_REGEX.lastIndex = 0;
  while ((m = REGULATORY_REF_REGEX.exec(text)) !== null) {
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;

    // Is this reference inside a quoted span? If yes, treat as verbatim.
    const insideQuote = quotes.some(q => matchStart >= q.start && matchEnd <= q.end);
    if (insideQuote) continue;

    // Look forward up to 60 chars for a paraphrase verb.
    const forward = text.slice(matchEnd, Math.min(text.length, matchEnd + 60));
    if (PARAPHRASE_VERBS.test(forward)) {
      // If the paraphrase verb is immediately followed by a colon and a
      // quoted span, it's introducing verbatim citation — not paraphrase.
      const verbMatch = forward.match(PARAPHRASE_VERBS);
      const verbEnd = verbMatch ? matchEnd + (verbMatch.index ?? 0) + verbMatch[0].length : matchEnd;
      const trailer = text.slice(verbEnd, Math.min(text.length, verbEnd + 20));
      if (/^[\s:,]*["“'‘]/.test(trailer)) continue;
      const excerpt = text.slice(matchStart, Math.min(text.length, matchEnd + 80));
      hits.push(excerpt.trim());
    }
  }
  // Also catch bare body + paraphrase pattern: "SRA requires…" without an Article number
  if (REGULATORY_BODIES.test(text)) {
    const baresRegex = /\b(SRA|EU\s+AI\s+Act|UK\s+GDPR|GDPR|ICO|FCA)\s+(requires?|says?|states?|mandates?|stipulates?|specifies?|sets\s+out|prescribes?|demands?)\b[^"”'’]{0,200}/gi;
    let m2: RegExpExecArray | null;
    while ((m2 = baresRegex.exec(text)) !== null) {
      const start = m2.index;
      const end = m2.index + m2[0].length;
      const insideQuote = quotes.some(q => start >= q.start && end <= q.end);
      if (insideQuote) continue;
      hits.push(m2[0].slice(0, 200).trim());
    }
  }
  return Array.from(new Set(hits));
}

// ── Known misattributions ─────────────────────────────────────────────────────
//
// Small curated dictionary. Each entry: a quote-fragment pattern (lowercased),
// the wrong author it commonly gets pinned on, and the actual source.
// Extend with care — false positives are worse than false negatives here.

interface MisattributionRule {
  fragment: RegExp;     // matched against the quoted text
  wrongAuthors: RegExp; // matched against the surrounding context
  actualAuthor: string;
}

const MISATTRIBUTION_RULES: MisattributionRule[] = [
  {
    fragment: /\binsanity is doing the same thing\b/i,
    wrongAuthors: /\b(einstein|albert einstein|benjamin franklin|mark twain)\b/i,
    actualAuthor: 'Rita Mae Brown (Sudden Death, 1983)',
  },
  {
    fragment: /\bdefinition of insanity\b/i,
    wrongAuthors: /\b(einstein|albert einstein)\b/i,
    actualAuthor: 'Rita Mae Brown (Sudden Death, 1983)',
  },
  {
    fragment: /\bbe the change you (wish|want) to see\b/i,
    wrongAuthors: /\b(gandhi|mahatma gandhi)\b/i,
    actualAuthor: 'paraphrase — Gandhi never said this verbatim',
  },
  {
    fragment: /\bnot everything that counts can be counted\b/i,
    wrongAuthors: /\b(einstein|albert einstein)\b/i,
    actualAuthor: 'William Bruce Cameron (1963)',
  },
  {
    fragment: /\bgo to the moon in this decade\b/i,
    wrongAuthors: /\b(churchill|winston churchill)\b/i,
    actualAuthor: 'John F. Kennedy (1962)',
  },
  {
    fragment: /\bblood, sweat and tears\b/i,
    wrongAuthors: /\b(churchill|winston churchill)\b/i,
    actualAuthor: 'Churchill said "blood, toil, tears, and sweat" — the popular form is a paraphrase',
  },
];

function detectMisattributions(text: string, quotes: QuoteSpan[]): MisattributionHit[] {
  const hits: MisattributionHit[] = [];
  for (const q of quotes) {
    for (const rule of MISATTRIBUTION_RULES) {
      if (!rule.fragment.test(q.text)) continue;
      const ctx = contextWindow(text, q);
      const m = ctx.match(rule.wrongAuthors);
      if (m) {
        hits.push({
          quote: q.text,
          author: m[0],
          actualAuthor: rule.actualAuthor,
        });
      }
    }
  }
  return hits;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function auditQuoteIntegrity(text: string): QuoteIntegrityResult {
  const quotes = extractQuotes(text);

  const orphanQuotes: QuoteSpan[] = [];
  const quotesWithoutYear: QuoteSpan[] = [];

  for (const q of quotes) {
    const attributed = hasAttribution(text, q);
    if (!attributed) {
      orphanQuotes.push(q);
      continue;
    }
    if (!hasYear(text, q)) {
      quotesWithoutYear.push(q);
    }
  }

  const statisticsWithoutSource = detectUnsourcedStats(text);
  const regulatoryParaphrases = detectRegulatoryParaphrases(text, quotes);
  const misattributions = detectMisattributions(text, quotes);

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (misattributions.length > 0) {
    blockers.push(
      `${misattributions.length} likely misattribution(s) — e.g. "${misattributions[0].quote.slice(0, 60)}…" attributed to ${misattributions[0].author}; actually ${misattributions[0].actualAuthor}`,
    );
  }
  if (regulatoryParaphrases.length > 0) {
    blockers.push(
      `${regulatoryParaphrases.length} regulatory reference(s) using paraphrase verbs instead of verbatim quotation. SRA / EU AI Act / GDPR text MUST be verbatim from sra.org.uk or EUR-Lex.`,
    );
  }
  if (orphanQuotes.length > 0) {
    blockers.push(`${orphanQuotes.length} orphan quote(s) — no attribution within ±${ATTRIBUTION_WINDOW} characters`);
  }
  if (quotesWithoutYear.length > 0) {
    warnings.push(`${quotesWithoutYear.length} attributed quote(s) missing a year`);
  }
  if (statisticsWithoutSource.length > 0) {
    warnings.push(`${statisticsWithoutSource.length} statistic(s) without a named source and year`);
  }

  let overallGrade: 'PASS' | 'ADVISORY' | 'FAIL';
  if (blockers.length >= 2 || misattributions.length > 0) overallGrade = 'FAIL';
  else if (blockers.length === 1 || warnings.length >= 2) overallGrade = 'ADVISORY';
  else overallGrade = 'PASS';

  return {
    quotesFound: quotes.length,
    orphanQuotes,
    quotesWithoutYear,
    statisticsWithoutSource,
    regulatoryParaphrases,
    misattributions,
    blockers,
    warnings,
    overallGrade,
  };
}
