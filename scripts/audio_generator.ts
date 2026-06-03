#!/usr/bin/env npx tsx
/**
 * ElevenLabs Audio Generator — The Digital Law Firm
 * ===================================================
 * Generates audiobook and discussion MP3s for one or more chapters
 * using the ElevenLabs text-to-speech API.
 *
 * PRE-FLIGHT (one-time):
 *   1. Sign up at elevenlabs.io → Profile → API Key
 *   2. Add to .env.local:  ELEVENLABS_API_KEY=your_key_here
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *
 *   # Single chapter (both audiobook + discussion)
 *   npx tsx scripts/audio_generator.ts 9
 *
 *   # Multiple chapters
 *   npx tsx scripts/audio_generator.ts 9 10 11 12
 *
 *   # All chapters
 *   npx tsx scripts/audio_generator.ts --all
 *
 *   # Audiobook only
 *   npx tsx scripts/audio_generator.ts 9 --type audiobook
 *
 *   # Discussion only
 *   npx tsx scripts/audio_generator.ts 9 --type discussion
 *
 *   # Dry run (validates env + finds chapter files, no API calls)
 *   npx tsx scripts/audio_generator.ts 9 --dry-run
 *
 * Output:
 *   Google Drive: .../The_Digital_Law_Firm_Complete_Manuscript_v2.0/
 *     Ch{NN}_Audiobook_DRAFT_v1.0_{YYYYMMDD}.mp3
 *     Ch{NN}_Discussion_DRAFT_v1.0_{YYYYMMDD}.mp3
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { generateAudiobook, generateDiscussion, buildOutputPath } from '../lib/audio-generator';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const API_KEY = process.env.ELEVENLABS_API_KEY;

const CHAPTERS_DIR = path.join(
  process.env.HOME!,
  'Downloads',
  'Digital_Law_Firm_Chapters',
);

const GDRIVE_DIR = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com',
  'My Drive/Digital Law firms/Book Method',
  'v2 Complete 12 after CT scuritiny',
  'The_Digital_Law_Firm_Complete_Manuscript_v2.0',
);

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');

const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1]
  ?? (args.includes('--type') ? args[args.indexOf('--type') + 1] : null);

const types: Array<'audiobook' | 'discussion'> =
  typeArg === 'audiobook' ? ['audiobook']
  : typeArg === 'discussion' ? ['discussion']
  : ['audiobook', 'discussion'];

const chapterNums: number[] = ALL
  ? Array.from({ length: 12 }, (_, i) => i + 1)
  : args.filter(a => /^\d+$/.test(a)).map(Number);

// ─────────────────────────────────────────────────────────────────────────────
// Chapter text loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds and reads the chapter text file.
 * Looks in Downloads/Digital_Law_Firm_Chapters/ for:
 *   Ch{NN}_*.txt  or  Chapter_{NN}_*.txt  or  ch{NN}*.txt
 */
function loadChapterText(chapter: number): string {
  const nn = String(chapter).padStart(2, '0');
  const patterns = [
    new RegExp(`^[Cc]h(?:apter[_\\s])?${nn}[_\\s].*\\.txt$`),
    new RegExp(`^[Cc]h${chapter}[_\\s].*\\.txt$`),
    new RegExp(`^Chapter[_\\s]?${chapter}[_\\s].*\\.txt$`, 'i'),
  ];

  // Also check Google Drive folder for .txt exports
  const searchDirs = [CHAPTERS_DIR, GDRIVE_DIR].filter(d => fs.existsSync(d));

  for (const dir of searchDirs) {
    const files = fs.readdirSync(dir).filter(f =>
      patterns.some(p => p.test(f))
    );
    if (files.length > 0) {
      return fs.readFileSync(path.join(dir, files[0]), 'utf-8');
    }
  }

  throw new Error(
    `Chapter ${chapter} text not found.\n` +
    `Expected a .txt file matching Ch${nn}_*.txt in:\n` +
    `  ${CHAPTERS_DIR}\n  ${GDRIVE_DIR}\n\n` +
    `Export the chapter DOCX as plain text (.txt) and place it there.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight checks
// ─────────────────────────────────────────────────────────────────────────────

function preflight(): boolean {
  let ok = true;

  if (!API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not set in .env.local');
    console.error('   Get your key at: https://elevenlabs.io/profile → API Key');
    ok = false;
  } else {
    console.log(`✅ ELEVENLABS_API_KEY: ${API_KEY.slice(0, 8)}***`);
  }

  if (chapterNums.length === 0) {
    console.error('❌ No chapters specified. Usage: npx tsx scripts/audio_generator.ts 9 10 11 12');
    ok = false;
  } else {
    console.log(`✅ Chapters: ${chapterNums.join(', ')}`);
    console.log(`✅ Types: ${types.join(', ')}`);
  }

  return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎙️  The Digital Law Firm — ElevenLabs Audio Generator');
  console.log('═'.repeat(55));

  if (!preflight()) process.exit(1);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Checking chapter files...');
    for (const ch of chapterNums) {
      try {
        const text = loadChapterText(ch);
        const nn = String(ch).padStart(2, '0');
        console.log(`  ✅ Ch${nn}: ${text.length.toLocaleString()} chars`);
      } catch (e: unknown) {
        console.error(`  ❌ ${(e as Error).message.split('\n')[0]}`);
      }
    }
    console.log('\n[DRY RUN] Output paths:');
    for (const ch of chapterNums) {
      for (const type of types) {
        console.log(`  ${buildOutputPath(ch, type)}`);
      }
    }
    console.log('\nDry run complete. Re-run without --dry-run to generate audio.');
    return;
  }

  let generated = 0;
  let failed = 0;

  for (const ch of chapterNums) {
    const nn = String(ch).padStart(2, '0');
    console.log(`\n📖 Chapter ${nn}`);

    let text: string;
    try {
      text = loadChapterText(ch);
      console.log(`  Loaded: ${text.length.toLocaleString()} chars`);
    } catch (e: unknown) {
      console.error(`  ❌ ${(e as Error).message.split('\n')[0]}`);
      failed++;
      continue;
    }

    for (const type of types) {
      const outputPath = buildOutputPath(ch, type);
      try {
        if (type === 'audiobook') {
          await generateAudiobook(API_KEY!, text, outputPath);
        } else {
          await generateDiscussion(API_KEY!, text, outputPath);
        }
        generated++;
      } catch (e: unknown) {
        console.error(`  ❌ ${type} failed: ${(e as Error).message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '═'.repeat(55));
  console.log(`✅ Generated: ${generated} file(s)`);
  if (failed > 0) console.log(`❌ Failed:    ${failed} file(s)`);
  console.log('Output directory:', GDRIVE_DIR);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
