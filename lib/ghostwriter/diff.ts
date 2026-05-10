/**
 * Paragraph-level diff classifier for chapter suggestions.
 * Produces { paragraph_index, original_text, suggested_text, classification, rationale }
 * tuples ready to insert into the `chapter_suggestions` table.
 */

export type Classification =
  | 'term-change'
  | 'precision-loss'
  | 'readability-win'
  | 'padding'
  | 'restructure';

export interface Suggestion {
  paragraphIndex: number;
  originalText: string;
  suggestedText: string;
  classification: Classification;
  rationale: string;
}

/** Split markdown body into block paragraphs (separated by blank lines). */
export function splitParagraphs(md: string): string[] {
  return md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Normalise for comparison: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Extract precision-tokens worth preserving — numbers, capitalised proper nouns, units. */
function precisionTokens(s: string): Set<string> {
  const tokens = new Set<string>();
  const matches = s.match(/(£\d[\d,.]*|\d+%|\d{2,}|[A-Z]{2,}|[A-Z][a-z]+\s+[A-Z][a-z]+)/g) ?? [];
  for (const m of matches) tokens.add(m);
  return tokens;
}

/** Word-level Levenshtein on tokenised strings — rough estimate of change density. */
function wordEditDistance(a: string, b: string): number {
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  const m = wa.length;
  const n = wb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        wa[i - 1] === wb[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Classify a single paragraph-pair diff. The contract:
 *   - if identical → returns null
 *   - if pipeline added a paragraph not present in original → 'padding'
 *   - otherwise applies heuristics
 */
export function classifyPair(
  original: string | null,
  pipeline: string | null,
): { classification: Classification; rationale: string } | null {
  if (original === null && pipeline !== null) {
    return {
      classification: 'padding',
      rationale: 'Pipeline added a paragraph not present in the author seed.',
    };
  }
  if (original !== null && pipeline === null) {
    return {
      classification: 'precision-loss',
      rationale: 'Pipeline removed a paragraph from the author seed.',
    };
  }
  if (original === null || pipeline === null) return null;
  if (norm(original) === norm(pipeline)) return null;

  const origTokens = precisionTokens(original);
  const pipeTokens = precisionTokens(pipeline);
  const lostTokens = [...origTokens].filter((t) => !pipeTokens.has(t));

  const editDist = wordEditDistance(norm(original), norm(pipeline));
  const origWordCount = original.split(/\s+/).length;

  if (editDist <= 3) {
    return {
      classification: 'term-change',
      rationale: `Small word-level change (${editDist} word${editDist === 1 ? '' : 's'} different) — author should confirm the substituted wording carries the same professional weight.`,
    };
  }

  if (lostTokens.length > 0) {
    return {
      classification: 'precision-loss',
      rationale: `Pipeline removed specific terms from the original: ${lostTokens.slice(0, 4).join(', ')}.`,
    };
  }

  const pipeWordCount = pipeline.split(/\s+/).length;
  if (pipeWordCount < origWordCount * 0.7) {
    return {
      classification: 'readability-win',
      rationale: `Pipeline shortened the paragraph by ${Math.round((1 - pipeWordCount / origWordCount) * 100)}% while preserving precision terms — likely a genuine readability gain.`,
    };
  }

  if (Math.abs(pipeWordCount - origWordCount) / origWordCount < 0.2) {
    return {
      classification: 'restructure',
      rationale: 'Paragraph reworded with similar length and precision terms preserved — restructure rather than substantive change.',
    };
  }

  return {
    classification: 'restructure',
    rationale: 'Substantive rewrite — content roughly aligned but phrasing differs throughout.',
  };
}

/**
 * Run a paragraph-aligned diff between an author seed and a pipeline rewrite.
 * Returns the suggestion list. Caller decides whether to persist `padding` rows
 * (the seeder skips them).
 */
export function diffChapter(originalMd: string, pipelineMd: string): Suggestion[] {
  const origParas = splitParagraphs(originalMd);
  const pipeParas = splitParagraphs(pipelineMd);
  const maxLen = Math.max(origParas.length, pipeParas.length);
  const suggestions: Suggestion[] = [];

  for (let i = 0; i < maxLen; i++) {
    const o = origParas[i] ?? null;
    const p = pipeParas[i] ?? null;
    const classified = classifyPair(o, p);
    if (!classified) continue;
    suggestions.push({
      paragraphIndex: i,
      originalText: o ?? '',
      suggestedText: p ?? '',
      classification: classified.classification,
      rationale: classified.rationale,
    });
  }

  return suggestions;
}
