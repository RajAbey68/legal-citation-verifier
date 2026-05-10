#!/usr/bin/env npx tsx
/**
 * Seed chapter_suggestions from author-seed vs pipeline-rewrite diffs.
 *
 * Reads:
 *   /Users/arajiv/code/The-Digital-Law-Firm/chapters/drafts/chapter_NN_draft.md
 *   /Users/arajiv/code/The-Digital-Law-Firm/chapters/drafts/_pipeline_v1_2026-05-08/chapter_NN_pipeline.md
 *
 * Writes to public.chapter_suggestions via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 *
 * Usage:
 *   npx tsx scripts/seed_chapter_suggestions.ts --chapter 8
 *   npx tsx scripts/seed_chapter_suggestions.ts --all
 *   npx tsx scripts/seed_chapter_suggestions.ts --chapter 8 --dry-run
 *
 * Skips 'padding' classifications by default — they're pipeline-added content
 * that we already reverted; they're not author choices to review.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { diffChapter, type Suggestion } from '../lib/ghostwriter/diff';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const REPO = '/Users/arajiv/code/The-Digital-Law-Firm';
const SOURCE_PIPELINE_ID = 'v1_2026-05-08';

interface Args {
  chapters: number[];
  dryRun: boolean;
  includePadding: boolean;
}

export function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes('--dry-run');
  const includePadding = argv.includes('--include-padding');
  const all = argv.includes('--all');
  let chapters: number[] = [];
  const chapterFlagIdx = argv.indexOf('--chapter');
  if (chapterFlagIdx !== -1 && argv[chapterFlagIdx + 1]) {
    chapters = [parseInt(argv[chapterFlagIdx + 1], 10)];
  } else if (all) {
    chapters = Array.from({ length: 12 }, (_, i) => i + 1);
  }
  return { chapters, dryRun, includePadding };
}

function chapterPaths(n: number): { original: string; pipeline: string } {
  const nn = String(n).padStart(2, '0');
  return {
    original: path.join(REPO, 'chapters/drafts', `chapter_${nn}_draft.md`),
    pipeline: path.join(REPO, 'chapters/drafts/_pipeline_v1_2026-05-08', `chapter_${nn}_pipeline.md`),
  };
}

export function buildRows(chapter: number, suggestions: Suggestion[], includePadding: boolean) {
  return suggestions
    .filter((s) => includePadding || s.classification !== 'padding')
    .map((s) => ({
      chapter_number: chapter,
      paragraph_index: s.paragraphIndex,
      original_text: s.originalText,
      suggested_text: s.suggestedText,
      classification: s.classification,
      rationale: s.rationale,
      source_pipeline: SOURCE_PIPELINE_ID,
    }));
}

async function seedChapter(chapter: number, dryRun: boolean, includePadding: boolean) {
  const paths = chapterPaths(chapter);
  if (!fs.existsSync(paths.original)) {
    console.log(`  Ch${chapter}: ❌ original not found at ${paths.original}`);
    return;
  }
  if (!fs.existsSync(paths.pipeline)) {
    console.log(`  Ch${chapter}: ❌ pipeline rewrite not found at ${paths.pipeline}`);
    return;
  }
  const originalMd = fs.readFileSync(paths.original, 'utf-8');
  const pipelineMd = fs.readFileSync(paths.pipeline, 'utf-8');
  const suggestions = diffChapter(originalMd, pipelineMd);
  const rows = buildRows(chapter, suggestions, includePadding);

  const breakdown = suggestions.reduce<Record<string, number>>((acc, s) => {
    acc[s.classification] = (acc[s.classification] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `  Ch${chapter}: ${suggestions.length} diff(s), persisting ${rows.length} — ${JSON.stringify(breakdown)}`,
  );

  if (dryRun) {
    console.log(`  Ch${chapter} [dry-run] sample row 0:`);
    if (rows.length > 0) console.log('   ', JSON.stringify(rows[0]).slice(0, 300));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const supabase = createClient(url, key);

  // Clear existing rows for this chapter+source so re-seeding is idempotent
  const { error: delErr } = await supabase
    .from('chapter_suggestions')
    .delete()
    .eq('chapter_number', chapter)
    .eq('source_pipeline', SOURCE_PIPELINE_ID);
  if (delErr) {
    console.log(`  Ch${chapter}: ⚠️  delete failed: ${delErr.message}`);
  }

  if (rows.length === 0) return;
  const { error } = await supabase.from('chapter_suggestions').insert(rows);
  if (error) {
    console.log(`  Ch${chapter}: ❌ insert failed: ${error.message}`);
  } else {
    console.log(`  Ch${chapter}: ✅ ${rows.length} suggestion(s) inserted`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.chapters.length === 0) {
    console.error('Usage: seed_chapter_suggestions.ts --chapter NN | --all  [--dry-run] [--include-padding]');
    process.exit(1);
  }
  console.log(`🚀 Seeding suggestions ${args.dryRun ? '(DRY-RUN) ' : ''}for chapters: ${args.chapters.join(', ')}\n`);
  for (const ch of args.chapters) {
    await seedChapter(ch, args.dryRun, args.includePadding);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
