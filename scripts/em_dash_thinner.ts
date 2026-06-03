#!/usr/bin/env npx tsx
/**
 * Em-dash thinner — DRY RUN preview generator.
 *
 * Counter-AI rule: max 1 em-dash per 200 words. Today's chapters average
 * 3-6 dashes per 200 words. This script generates a per-chapter preview
 * proposing which dashes to demote and to what — without writing back to
 * the locked canonical files.
 *
 * Rules of thumb (in priority order):
 *   1. KEEP dashes that bound a parenthetical clause     X — Y — Z  (paired)
 *   2. KEEP dashes after a complete clause introducing a list or quote
 *      ("Three things matter: X — speed, Y — accuracy, Z — cost." DEMOTE these to commas)
 *   3. DEMOTE rhetorical-pause dashes that join two complete sentences
 *      → replace with full stop + capitalise next word
 *   4. DEMOTE dashes joining a clause to its appositive
 *      → replace with comma
 *
 * Heuristic implementation — not perfect. The output is a proposal for the
 * author to APPROVE / EDIT. Never writes to the locked chapter.
 */
import * as fs from 'fs';
import * as path from 'path';

const CHAPTERS_DIR = '/Users/arajiv/code/The-Digital-Law-Firm/chapters/drafts';
const REPORTS_DIR = '/Users/arajiv/code/The-Digital-Law-Firm/chapters/reports/em_dash_preview';

interface DashHit {
  index: number;
  before: string;   // 40 chars before
  after: string;    // 40 chars after
  proposal: 'keep' | 'comma' | 'fullstop' | 'parens' | 'colon' | 'restructure';
  reason: string;
}

/**
 * Find the sentence boundaries that bracket a character index. Returns
 * [startIdx, endIdx] in the source text. Sentence boundaries are .!?
 * followed by whitespace + capital, plus paragraph breaks.
 */
function sentenceBoundsAround(text: string, idx: number): [number, number] {
  let start = idx;
  let end = idx;
  // Scan backwards for sentence start.
  for (let i = idx - 1; i >= 0; i--) {
    if (text[i] === '\n' && text[i + 1] === '\n') { start = i + 2; break; }
    if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1] || '')) {
      const after = text.slice(i + 1).match(/^\s+(\S)/);
      if (after && /[A-Z"“'‘]/.test(after[1])) { start = i + 1; break; }
    }
    start = i;
  }
  // Scan forwards for sentence end.
  for (let i = idx; i < text.length; i++) {
    if (text[i] === '\n' && text[i + 1] === '\n') { end = i; break; }
    if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1] || '')) { end = i + 1; break; }
    end = i + 1;
  }
  return [start, end];
}

/**
 * Detect whether text after a dash introduces a list — comma-separated
 * items, optionally ending in "and X" or "or X". Used to promote the dash
 * to a colon ("three benefits — X, Y, and Z" → "three benefits: X, Y, and Z").
 */
function isListIntro(textAfter: string): boolean {
  // Strip leading whitespace, take first 120 chars
  const slice = textAfter.trim().slice(0, 200);
  // Pattern: word(s), word(s), ... and/or word(s)
  const listRegex = /^[^.!?\n]{4,40},\s+[^.!?\n]{4,40},\s+(and|or)\s+[^.!?\n]{2,40}[.,!?\n]/i;
  if (listRegex.test(slice)) return true;
  // Lighter pattern: two-item list "X, and Y."
  const twoItem = /^[^.!?\n]{4,40},\s+and\s+[^.!?\n]{2,40}[.,!?\n]/i;
  return twoItem.test(slice);
}

/**
 * Detect "named-specific appositive" — a paired-dash clause that wraps
 * a number, date, currency, or proper noun. These are the cases your
 * "specifics replace punctuation" rule covers: the author should
 * restructure the sentence so the specific is the subject. Marked for
 * human review rather than demoted automatically.
 */
function isSpecificAppositive(insideText: string): boolean {
  const trimmed = insideText.trim();
  // Currency, percentage, year, time, named year-range, days-of-week
  if (/[£$€]\s?\d|\d+(\.\d+)?%|\b(19|20)\d{2}\b|\d{1,2}:\d{2}/.test(trimmed)) return true;
  // Short proper-noun appositive: "Sarah Mitchell" / "the Managing Partner"
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(trimmed) && trimmed.split(/\s+/).length <= 4) return true;
  return false;
}

/**
 * Classify a single em-dash in context. Implements the four rules from the
 * "authoritative voice" guideline:
 *   1. Full-stop audit — sentences with 2+ dashes split into separate sentences
 *   2. Swap for colons — dashes introducing a list become colons
 *   3. Specifics replace punctuation — appositives around numbers/dates flagged
 *      for author restructure (regex cannot rewrite the sentence)
 *   4. Final-sentence rule — dashes near the end of a paragraph become full stops
 *
 * Default for any remaining single dash: full stop, not comma. Commas weaken
 * the "trusted advisor" voice; full stops carry authority.
 */
function classifyDash(text: string, idx: number, allDashIndices: number[]): DashHit {
  const before = text.slice(Math.max(0, idx - 60), idx).trim();
  const after = text.slice(idx + 1, Math.min(text.length, idx + 200));

  // Find the sentence this dash sits in and count dashes within it.
  const [sentStart, sentEnd] = sentenceBoundsAround(text, idx);
  const dashesInSentence = allDashIndices.filter(i => i >= sentStart && i < sentEnd).length;

  // Find nearest dashes on either side (used both for rule 1 and rule 3).
  const pos = allDashIndices.indexOf(idx);
  const prevDash = pos > 0 ? allDashIndices[pos - 1] : -1;
  const nextDash = pos < allDashIndices.length - 1 ? allDashIndices[pos + 1] : -1;

  // Is this dash part of a paired-parenthetical clause? (Within 80 chars of
  // a sibling dash, no sentence-ending punctuation between them.)
  const sentenceEnd = /[.!?]\s+[A-Z]/;
  let isPaired = false;
  let pairedInside = '';
  if (nextDash !== -1 && nextDash - idx < 160) {
    const between = text.slice(idx + 1, nextDash);
    if (!sentenceEnd.test(between)) { isPaired = true; pairedInside = between; }
  }
  if (!isPaired && prevDash !== -1 && idx - prevDash < 160) {
    const between = text.slice(prevDash + 1, idx);
    if (!sentenceEnd.test(between)) { isPaired = true; pairedInside = between; }
  }

  // Rule 1 — full-stop audit. Sentence with 2+ dashes splits into separate
  // sentences, BUT only if the dashes are sequential (not paired). Paired
  // dashes need a sentence restructure that regex cannot perform safely.
  if (dashesInSentence >= 2 && !isPaired) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'fullstop',
      reason: 'sentence contains 2+ sequential em-dashes — split into separate sentences',
    };
  }
  if (dashesInSentence >= 2 && isPaired) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'restructure',
      reason: `paired-parenthetical "${pairedInside.slice(0, 40)}…" — author should restate as a separate sentence (regex cannot rewrite safely)`,
    };
  }

  // Rule 3 — paired-dash clause around a named specific (number, date, name).
  // Author should restructure so the specific is the subject. (Handled here
  // for single-dash-per-sentence paired cases — multi-dash paired cases are
  // already routed to 'restructure' above in Rule 1.)
  if (isPaired && isSpecificAppositive(pairedInside)) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'restructure',
      reason: `named-specific appositive "${pairedInside.trim().slice(0, 40)}" — restructure so the specific is the subject`,
    };
  }
  // Generic paired-parenthetical (not a specific) — still restructure;
  // splitting both dashes makes sentence fragments.
  if (isPaired) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'restructure',
      reason: 'paired-parenthetical clause — author should restate as a separate sentence',
    };
  }

  // Rule 2 — list intro. Dash followed by a comma-separated list becomes a colon.
  if (isListIntro(after)) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'colon',
      reason: 'introduces a list — colon is the professional form ("here is the evidence")',
    };
  }

  // Rule 4 — final-sentence rule. Dash near the end of a paragraph or section.
  const distanceToParaBreak = text.slice(idx + 1, Math.min(text.length, idx + 400))
    .search(/\n\s*\n|\n#+\s/);
  if (distanceToParaBreak >= 0 && distanceToParaBreak < 200) {
    return {
      index: idx,
      before: before.slice(-40),
      after: after.slice(0, 40).trim(),
      proposal: 'fullstop',
      reason: 'near paragraph or section end — never trail off into the next idea',
    };
  }

  // Default — single mid-sentence dash. Full stop, not comma.
  // Capitalise the next word in applyProposal().
  return {
    index: idx,
    before: before.slice(-40),
    after: after.slice(0, 40).trim(),
    proposal: 'fullstop',
    reason: 'single mid-sentence dash — full stop carries authority; comma weakens voice',
  };
}

function applyProposal(text: string, hits: DashHit[]): string {
  // Apply from end to start so earlier indices remain valid.
  const sorted = [...hits].sort((a, b) => b.index - a.index);
  let out = text;
  for (const h of sorted) {
    const dashChar = out[h.index]; // — or – or - (might be two chars for --)
    const dashLen = out.slice(h.index, h.index + 2) === '--' ? 2 : 1;
    const left = out.slice(0, h.index);
    let middle = '';
    const tail = out.slice(h.index + dashLen);
    switch (h.proposal) {
      case 'keep':
      case 'restructure':
        // Leave the dash in place. Restructure decisions are author-only.
        middle = dashChar === '-' ? '--' : dashChar;
        break;
      case 'comma':
        // Collapse adjacent spaces. " — " → ", "
        out = (left.replace(/\s+$/, '') + ',' + tail.replace(/^\s+/, ' ')).trimEnd();
        continue;
      case 'colon':
        // " — " → ": "
        out = left.replace(/\s+$/, '') + ': ' + tail.replace(/^\s+/, '');
        continue;
      case 'fullstop': {
        // ". " + capitalise next visible letter
        const tailTrimmed = tail.replace(/^\s+/, '');
        const cap = tailTrimmed.replace(/^([a-z])/, (_, c) => c.toUpperCase());
        out = left.replace(/\s+$/, '') + '. ' + cap;
        continue;
      }
      case 'parens':
        middle = ' (';
        break;
    }
    out = left + middle + tail;
  }
  return out;
}

function thinChapter(filePath: string): {
  before: string;
  after: string;
  hits: DashHit[];
  beforeCount: number;
  afterCount: number;
} {
  const text = fs.readFileSync(filePath, 'utf-8');
  // Compute the set of character indices that fall inside a markdown
  // horizontal rule (a line of 3+ hyphens with optional whitespace only).
  // Those `-` characters must NOT be treated as em-dashes.
  const horizontalRuleRanges: Array<[number, number]> = [];
  const hrRegex = /(^|\n)\s*-{3,}\s*(?=\n|$)/g;
  let hr: RegExpExecArray | null;
  while ((hr = hrRegex.exec(text)) !== null) {
    horizontalRuleRanges.push([hr.index, hr.index + hr[0].length]);
  }
  const inHR = (i: number) =>
    horizontalRuleRanges.some(([s, e]) => i >= s && i < e);

  // Also skip table-row separators in pipe tables: |---|---|---|
  const tableRowRegex = /\|[\s\-:|]+\|/g;
  let tr: RegExpExecArray | null;
  while ((tr = tableRowRegex.exec(text)) !== null) {
    horizontalRuleRanges.push([tr.index, tr.index + tr[0].length]);
  }

  // Find every em/en-dash or double-hyphen position.
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (inHR(i)) continue;
    const c = text[i];
    if (c === '—' || c === '–') indices.push(i);
    else if (c === '-' && text[i + 1] === '-') {
      indices.push(i);
      i++; // skip the second hyphen
    }
  }
  const hits = indices.map(idx => classifyDash(text, idx, indices));
  const after = applyProposal(text, hits);

  const countDashes = (s: string) =>
    (s.match(/—|–|--/g) || []).length;

  return {
    before: text,
    after,
    hits,
    beforeCount: countDashes(text),
    afterCount: countDashes(after),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const files = fs.readdirSync(CHAPTERS_DIR)
  .filter(f => /^chapter_\d{2}_draft\.md$/.test(f))
  .sort();

console.log('Em-dash thinning — DRY RUN preview (no canonical writes)');
console.log('=========================================================\n');
console.log('Ch | Before | After | Δ    | Keep | →Fullstop | →Colon | →Restructure');
console.log('---|--------|-------|------|------|-----------|--------|-------------');

const summary: any[] = [];

for (const f of files) {
  const ch = f.match(/\d{2}/)![0];
  const result = thinChapter(path.join(CHAPTERS_DIR, f));
  const proposalCounts = result.hits.reduce((acc, h) => {
    acc[h.proposal] = (acc[h.proposal] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(
    `${ch} | ${String(result.beforeCount).padStart(6)} | ${String(result.afterCount).padStart(5)} | ${String(result.beforeCount - result.afterCount).padStart(4)} | ${String(proposalCounts.keep || 0).padStart(4)} | ${String(proposalCounts.fullstop || 0).padStart(9)} | ${String(proposalCounts.colon || 0).padStart(6)} | ${String(proposalCounts.restructure || 0).padStart(11)}`,
  );

  // Save proposed text and a sample of the changes.
  fs.writeFileSync(
    path.join(REPORTS_DIR, `chapter_${ch}_em_dash_thinned_preview.md`),
    result.after,
    'utf-8',
  );

  // Save the per-dash decision log (first 30 hits as sample for author review).
  const sample = result.hits
    .filter(h => h.proposal !== 'keep')
    .slice(0, 30)
    .map((h, i) =>
      `${i + 1}. [${h.proposal.toUpperCase()}] ${h.reason}\n   …${h.before} — ${h.after}…\n`,
    )
    .join('\n');

  fs.writeFileSync(
    path.join(REPORTS_DIR, `chapter_${ch}_em_dash_decisions.md`),
    `# Chapter ${ch} — Em-dash thinning proposal\n\n` +
      `**Before:** ${result.beforeCount} em-dashes  \n` +
      `**After:** ${result.afterCount} em-dashes  \n` +
      `**Demoted:** ${result.beforeCount - result.afterCount}  \n\n` +
      `Counter-AI target: max 1 em-dash per 200 words.\n\n` +
      `## Sample decisions (first 30 demotions)\n\n${sample}\n`,
    'utf-8',
  );

  summary.push({
    chapter: parseInt(ch),
    beforeCount: result.beforeCount,
    afterCount: result.afterCount,
    demoted: result.beforeCount - result.afterCount,
  });
}

console.log('\nFull previews written to:');
console.log(`  ${REPORTS_DIR}/chapter_NN_em_dash_thinned_preview.md  (full proposed text)`);
console.log(`  ${REPORTS_DIR}/chapter_NN_em_dash_decisions.md         (per-dash decision sample)`);
console.log('\nNo canonical chapter files were touched. Lock guard not invoked.');

fs.writeFileSync(
  path.join(REPORTS_DIR, '_summary.json'),
  JSON.stringify(summary, null, 2),
  'utf-8',
);
