#!/usr/bin/env npx tsx
/**
 * Apply author decisions to a chapter draft.
 *
 * Reads chapter_decisions joined with chapter_suggestions for the chapter,
 * then applies each decision to the canonical author-seed draft:
 *   - KEEP    → leave original paragraph untouched
 *   - SWAP    → replace with the pipeline's suggested_text
 *   - REWRITE → replace with the author's edited_text
 *
 * Writes the resulting markdown to:
 *   chapters/drafts/_authorised/chapter_NN_authorised.md
 *
 * Appends an audit-log line to:
 *   state/skool-sync.log
 *
 * Does NOT push to Skool. Skool sync is a downstream step blocked on the
 * chapter write-lock guardrails.
 *
 * Usage:
 *   npx tsx scripts/apply_chapter_decisions.ts --chapter 8
 *   npx tsx scripts/apply_chapter_decisions.ts --chapter 8 --dry-run
 *   npx tsx scripts/apply_chapter_decisions.ts --chapter 8 --output /tmp/test.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { splitParagraphs } from '../lib/ghostwriter/diff';
import { assertWritable, appendAudit, sha256Of } from '../lib/ghostwriter/lock_guard';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const REPO = '/Users/arajiv/code/The-Digital-Law-Firm';

interface Args {
  chapter: number;
  dryRun: boolean;
  output?: string;
}

export function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes('--dry-run');
  const chapterIdx = argv.indexOf('--chapter');
  if (chapterIdx === -1 || !argv[chapterIdx + 1]) {
    throw new Error('--chapter NN required');
  }
  const chapter = parseInt(argv[chapterIdx + 1], 10);
  const outputIdx = argv.indexOf('--output');
  const output = outputIdx !== -1 ? argv[outputIdx + 1] : undefined;
  return { chapter, dryRun, output };
}

interface SuggestionWithDecision {
  paragraph_index: number;
  original_text: string;
  suggested_text: string;
  decision: 'KEEP' | 'SWAP' | 'REWRITE';
  edited_text: string | null;
  decided_by: string;
}

/**
 * Apply decisions to paragraphs. Pure function — testable.
 * Returns the rebuilt list of paragraphs.
 */
export function applyDecisions(
  originalParagraphs: string[],
  decisions: SuggestionWithDecision[],
): string[] {
  const out = [...originalParagraphs];
  for (const d of decisions) {
    if (d.paragraph_index < 0 || d.paragraph_index >= out.length) continue;
    if (d.decision === 'KEEP') continue;
    if (d.decision === 'SWAP') {
      out[d.paragraph_index] = d.suggested_text;
    } else if (d.decision === 'REWRITE') {
      out[d.paragraph_index] = (d.edited_text ?? '').trim() || out[d.paragraph_index];
    }
  }
  return out;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // GUARD: refuse to apply decisions to a locked chapter unless the user has
  // unlocked it deliberately in chapters/.locks.yaml (or set LOCK_GUARD_OVERRIDE).
  // --dry-run is allowed through — the script writes to --output only, not the draft.
  if (!args.dryRun) {
    assertWritable(args.chapter, 'apply author decisions');
  }

  const nn = String(args.chapter).padStart(2, '0');
  const originalPath = path.join(REPO, 'chapters/drafts', `chapter_${nn}_draft.md`);
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Original draft not found: ${originalPath}`);
  }
  const originalMd = fs.readFileSync(originalPath, 'utf-8');
  const originalParas = splitParagraphs(originalMd);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  const supabase = createClient(url, key);

  // Fetch suggestions for this chapter
  const { data: sugs, error: sErr } = await supabase
    .from('chapter_suggestions')
    .select('id, paragraph_index, original_text, suggested_text')
    .eq('chapter_number', args.chapter);
  if (sErr) throw new Error(sErr.message);
  if (!sugs || sugs.length === 0) {
    console.log(`Ch${args.chapter}: no suggestions → output equals original`);
  }

  const sugById = new Map<string, { paragraph_index: number; original_text: string; suggested_text: string }>();
  for (const s of sugs ?? []) {
    sugById.set(s.id, {
      paragraph_index: s.paragraph_index,
      original_text: s.original_text,
      suggested_text: s.suggested_text,
    });
  }

  const { data: decs, error: dErr } = await supabase
    .from('chapter_decisions')
    .select('suggestion_id, decision, edited_text, decided_by')
    .in('suggestion_id', [...sugById.keys()].length > 0 ? [...sugById.keys()] : ['00000000-0000-0000-0000-000000000000']);
  if (dErr) throw new Error(dErr.message);

  const decisions: SuggestionWithDecision[] = [];
  const deciders = new Set<string>();
  for (const d of decs ?? []) {
    const s = sugById.get(d.suggestion_id);
    if (!s) continue;
    decisions.push({
      paragraph_index: s.paragraph_index,
      original_text: s.original_text,
      suggested_text: s.suggested_text,
      decision: d.decision as SuggestionWithDecision['decision'],
      edited_text: d.edited_text,
      decided_by: d.decided_by,
    });
    deciders.add(d.decided_by);
  }

  const decisionCounts = decisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.decision] = (acc[d.decision] ?? 0) + 1;
    return acc;
  }, {});

  const finalParas = applyDecisions(originalParas, decisions);
  const finalMd = finalParas.join('\n\n') + '\n';
  const outputPath =
    args.output ??
    path.join(REPO, 'chapters/drafts/_authorised', `chapter_${nn}_authorised.md`);

  console.log(
    `Ch${args.chapter}: ${decisions.length} decision(s) ${JSON.stringify(decisionCounts)} from ${[...deciders].join(', ') || '(none)'}`,
  );
  console.log(`Ch${args.chapter}: output → ${outputPath} (${finalMd.length} chars, sha=${sha256(finalMd).slice(0, 12)})`);

  if (args.dryRun) {
    console.log(`Ch${args.chapter} [dry-run] — file not written, audit log not updated`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, finalMd);

  // Append to audit log (book repo's state/skool-sync.log — single audit trail)
  appendAudit(
    args.chapter,
    sha256Of(finalMd),
    'apply_chapter_decisions.ts',
    `decisions=${decisions.length} ${JSON.stringify(decisionCounts)} by=${[...deciders].join(',')}`,
  );
  console.log(`Ch${args.chapter}: audit logged to book repo state/skool-sync.log`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
