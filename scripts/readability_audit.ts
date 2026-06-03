#!/usr/bin/env npx tsx
/**
 * Standalone Readability Audit
 * ==============================
 * Runs in seconds. Zero API cost. No LLM required.
 * Tests every chapter for plain English, compellingness, and accessibility
 * to a law firm leader who is not a technologist.
 *
 * Usage:
 *   npx tsx scripts/readability_audit.ts          # all chapters
 *   npx tsx scripts/readability_audit.ts 1 3 11   # specific chapters
 *
 * Output:
 *   ~/Downloads/Digital_Law_Firm_Chapters/reports/READABILITY_REPORT.md
 */

import fs from 'fs';
import path from 'path';
import { auditReadability } from '../lib/ghostwriter/stages/readability';

const CHAPTERS_DIR = path.join(process.env.HOME!, 'Downloads', 'Digital_Law_Firm_Chapters');
const REPORTS_DIR = path.join(CHAPTERS_DIR, 'reports');

const CHAPTER_FILES: Record<number, string> = {
  1: 'chapter_01_the_ai_readiness_audit.md',
  2: 'chapter_02_the_pricing_paradox.md',
  3: 'chapter_03_the_90_day_pilot.md',
  4: 'chapter_04_the_safety_scaffolding.md',
  5: 'chapter_05_the_technology_stack.md',
  6: 'chapter_06_the_partnership_conversation.md',
  7: 'chapter_07_the_technology_register.md',
  8: 'chapter_08_the_governance_model.md',
  9: 'chapter_09_the_eu_ai_act_roadmap.md',
  10: 'chapter_10_the_pi_insurance_conversation.md',
  11: 'chapter_11_the_change_management.md',
  12: 'chapter_12_the_first_year_forward.md',
};

const CHAPTER_AUTHORS: Record<number, string> = {
  1: 'Rajiv Abeysinghe', 2: 'Darren', 3: 'Rajiv Abeysinghe',
  4: 'Rajiv Abeysinghe', 5: 'Rajiv Abeysinghe / Sushila',
  6: 'Darren', 7: 'Nick Lockett', 8: 'Nick Lockett',
  9: 'Nick Lockett', 10: 'Rajiv Abeysinghe',
  11: 'Darren', 12: 'Darren',
};

const args = process.argv.slice(2);
const chapters = args.length > 0
  ? args.map(Number).filter(n => CHAPTER_FILES[n])
  : Object.keys(CHAPTER_FILES).map(Number);

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

console.log(`\n📖 Readability Audit — The Digital Law Firm`);
console.log(`   Chapters: ${chapters.join(', ')}\n`);

const results = [];

for (const ch of chapters) {
  const filePath = path.join(CHAPTERS_DIR, CHAPTER_FILES[ch]);
  if (!fs.existsSync(filePath)) {
    console.log(`  Ch${ch} — file not found, skipping`);
    continue;
  }
  const draft = fs.readFileSync(filePath, 'utf-8');
  const result = auditReadability(ch, draft);
  results.push({ ch, author: CHAPTER_AUTHORS[ch], result });

  const icon = result.overallGrade === 'PASS' ? '✅'
    : result.overallGrade === 'ADVISORY' ? '⚠️ '
    : '❌';
  console.log(`  Ch${String(ch).padStart(2, '0')} ${icon} ${result.overallGrade.padEnd(10)} | Flesch ${result.fleschReadingEase} | Grade ${result.fleschKincaidGrade} | Fog ${result.gunningFog} | Compulsion ${result.compulsionScore} | ${CHAPTER_AUTHORS[ch]}`);
}

// ── Summary report ────────────────────────────────────────────────────────────
const pass = results.filter(r => r.result.overallGrade === 'PASS').length;
const advisory = results.filter(r => r.result.overallGrade === 'ADVISORY').length;
const fail = results.filter(r => r.result.overallGrade === 'FAIL').length;

const report = [
  `# Readability Audit — The Digital Law Firm`,
  `### Law Society Publishing | Q4 2026`,
  `Generated: ${new Date().toISOString().slice(0, 16)} UTC`,
  '',
  '> **Purpose of this audit:** The book\'s mission is to encourage, guide, and compel',
  '> law firm leaders to adopt AI in a compliant manner. Chapters that fail readability',
  '> undermine that mission — a sceptical practice manager who struggles to read a',
  '> chapter will not act on it. Fix readability before fixing regulatory flags.',
  '',
  '## Summary',
  '',
  `| Grade | Count |`,
  `|-------|-------|`,
  `| ✅ PASS | ${pass} |`,
  `| ⚠️ ADVISORY | ${advisory} |`,
  `| ❌ FAIL | ${fail} |`,
  '',
  '## Chapter Scorecard',
  '',
  `| Ch | Author | Grade | Flesch Ease | FK Grade | Fog | Passive | Jargon | Compulsion |`,
  `|----|--------|-------|-------------|----------|-----|---------|--------|------------|`,
  ...results.map(({ ch, author, result: r }) => {
    const g = r.overallGrade === 'PASS' ? '✅ PASS'
      : r.overallGrade === 'ADVISORY' ? '⚠️ ADVISORY'
      : '❌ FAIL';
    return `| ${ch} | ${author} | ${g} | ${r.fleschReadingEase} | ${r.fleschKincaidGrade} | ${r.gunningFog} | ${(r.passiveVoiceRatio * 100).toFixed(0)}% | ${r.jargonDensity} | ${r.compulsionScore} |`;
  }),
  '',
  '## Target Benchmarks',
  '',
  '| Metric | Target | Why |',
  '|--------|--------|-----|',
  '| Flesch Reading Ease | ≥ 60 | Law Society plain English standard |',
  '| Flesch-Kincaid Grade | ≤ 10 | Readable by a non-specialist professional |',
  '| Gunning Fog | ≤ 12 | Clear professional prose |',
  '| Avg sentence length | ≤ 20 words | Scannable by a time-poor reader |',
  '| Passive voice | < 10% | Active prose is more direct and compelling |',
  '| Jargon density | < 5/1k words | Every jargon term creates distance |',
  '| Compulsion score | ≥ 3 | Reader must leave with a clear Monday action |',
  '',
  '---',
  '',
  ...results.map(({ result }) => [result.summary, '', '---', '']).flat(),
].join('\n');

const reportPath = path.join(REPORTS_DIR, 'READABILITY_REPORT.md');
fs.writeFileSync(reportPath, report, 'utf-8');

// Copy to Google Drive
const driveDir = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review'
);
if (fs.existsSync(driveDir)) {
  fs.writeFileSync(path.join(driveDir, 'READABILITY_REPORT.md'), report, 'utf-8');
  console.log(`\n  ✅ Copied to Google Drive`);
}

console.log(`\n  Report: ${reportPath}`);
console.log(`  ${pass} PASS | ${advisory} ADVISORY | ${fail} FAIL\n`);
