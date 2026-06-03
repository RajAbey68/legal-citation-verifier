#!/usr/bin/env npx tsx
/**
 * Chapter Review Agent
 * ====================
 * Reads chapter v2.0 docx files directly from Google Drive,
 * runs the full readability + Kill List + RISK5 audit,
 * then posts the structured report as a NOTE to the HyperAutomation
 * NotebookLM notebook — so it's visible alongside the chapter source
 * when audio is generated.
 *
 * Usage:
 *   npx tsx scripts/chapter_review_agent.ts          # all chapters
 *   npx tsx scripts/chapter_review_agent.ts 1 3 9    # specific chapters
 *   npx tsx scripts/chapter_review_agent.ts --dry-run # report only, no NLM post
 *
 * Standards checked:
 *   Flesch Reading Ease    ≥ 60 (target 75–85 per prompts.ts)
 *   Flesch-Kincaid Grade   ≤ 10
 *   Gunning Fog Index      ≤ 12 (the legal prose killer)
 *   SMOG Grade             ≤ 12
 *   Dale-Chall Score       ≤ 7.0
 *   Coleman-Liau Index     ≤ 12
 *   Avg Sentence Length    ≤ 20 words
 *   Sentence Rhythm (SD)   ≥ 5
 *   Passive Voice          < 10%
 *   Lexical Density        45–55%
 *   Type-Token Ratio       0.4–0.6
 *   Kill List violations   0
 *   RISK5 violations       0 (fabricated citations)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { auditReadability } from '../lib/ghostwriter/stages/readability';

// ── Config ───────────────────────────────────────────────────────────────────

const NOTEBOOK_ID = '4af61e2f-a5c4-49c3-84d6-9926ac39e270';
const DRY_RUN = process.argv.includes('--dry-run');

const DRIVE_BASE = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive',
  'Digital Law firms/Book Method/v2 Complete 12 after CT scuritiny ',
  'The_Digital_Law_Firm_Complete_Manuscript_v2.0'
);

const REPORTS_DIR = path.join(
  process.env.HOME!,
  'Downloads/Digital_Law_Firm_Chapters/reports'
);

const CHAPTER_FILES: Record<number, string> = {
  1:  'Chapter_01_The_AI_Readiness_Audit_v2.0.docx',
  2:  'Chapter_02_The_Pricing_Paradox_v2.0.docx',
  3:  'Chapter_03_The_90_Day_Pilot_v2.0.docx',
  4:  'Chapter_04_The_Safety_Scaffolding_v2.0.docx',
  5:  'Chapter_05_The_Technology_Stack_v2.0.docx',
  6:  'Chapter_06_THE_PARTNERSHIP_CONVERSATION_v2.0.docx',
  7:  'Chapter_07_THE_LEGAL_FRAMEWORK_v2.0.docx',
  8:  'Chapter_08_THE_GOVERNANCE_MODEL_v2.0.docx',
  9:  'Chapter_09_THE_EU_AI_ACT_ROADMAP_v2.0.docx',
  10: 'Chapter_10_THE_DELIVERY_ENGINE_v2.0.docx',
  11: 'Chapter_11_THE_CHANGE_MANAGEMENT_v2.0.docx',
  12: 'Chapter_12_THE_FIRST_YEAR_FORWARD_v2.0.docx',
};

const CHAPTER_TITLES: Record<number, string> = {
  1: 'The AI Readiness Audit',    2: 'The Pricing Paradox',
  3: 'The 90-Day Pilot',          4: 'The Safety Scaffolding',
  5: 'The Technology Stack',      6: 'The Partnership Conversation',
  7: 'The Legal Framework',       8: 'The Governance Model',
  9: 'The EU AI Act Roadmap',     10: 'The Delivery Engine',
  11: 'The Change Management',    12: 'The First Year Forward',
};

const CHAPTER_AUTHORS: Record<number, string> = {
  1: 'Rajiv',  2: 'Darren', 3: 'Rajiv',  4: 'Rajiv',
  5: 'Rajiv',  6: 'Darren', 7: 'Nick',   8: 'Nick',
  9: 'Nick',   10: 'Rajiv', 11: 'Darren', 12: 'Darren',
};

// ── RISK5 patterns (hard-coded fabricated citations) ─────────────────────────
const RISK5_PATTERNS = [
  { pattern: /SRA\s+Technology\s+Guidance\s+2024/i, fix: 'Use "SRA Standards & Regulations (current as of 2025)" or specific Code Outcome numbers' },
  { pattern: /Law\s+Society\s+PI\s+Insurance\s+Practice\s+Note\s+2025/i, fix: 'Use "Insurance Act 2015 Section 3 and Section 8"' },
  { pattern: /GDPR\s+Article\s+9.*SRA\s+Outcome\s+6\.3.*require\s+UK\s+data\s+residency/i, fix: 'UK data residency is PREFERRED but not legally mandatory under UK GDPR Chapter V' },
  { pattern: /£121[,.]?000/i, fix: 'Shadow inefficiency figure is £121,500 (1,620 hrs × £75/hr) — not £121,000' },
];

// ── Docx → text extraction (requires mammoth) ────────────────────────────────
function extractTextFromDocx(docxPath: string): string {
  try {
    // Use mammoth CLI if available
    const result = execSync(
      `npx mammoth --output-format=markdown "${docxPath}" 2>/dev/null`,
      { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }
    );
    return result;
  } catch {
    // Fallback: try antiword or strings
    try {
      return execSync(`strings "${docxPath}" | grep -v "^[[:space:]]*$"`, { encoding: 'utf8' });
    } catch {
      return '';
    }
  }
}

// ── RISK5 check ───────────────────────────────────────────────────────────────
function checkRisk5(text: string): Array<{ violation: string; fix: string }> {
  return RISK5_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ pattern, fix }) => ({ violation: pattern.toString(), fix }));
}

// ── Post note to NotebookLM ───────────────────────────────────────────────────
function postNoteToNotebookLM(chapterNum: number, noteContent: string): void {
  const title = `📊 Ch${String(chapterNum).padStart(2, '0')} Quality Review — ${new Date().toISOString().slice(0, 10)}`;
  const noteFile = `/tmp/nlm_note_ch${chapterNum}.txt`;
  fs.writeFileSync(noteFile, noteContent, 'utf8');

  try {
    execSync(
      `source ~/.notebooklm-venv/bin/activate && ` +
      `notebooklm use ${NOTEBOOK_ID} && ` +
      `notebooklm note create --title "${title}" --file "${noteFile}"`,
      { encoding: 'utf8', shell: '/bin/bash' }
    );
    console.log(`   📝 Note posted to NotebookLM: "${title}"`);
  } catch (err) {
    console.warn(`   ⚠️  Could not post note to NotebookLM: ${(err as Error).message?.slice(0, 100)}`);
    console.log(`   📄 Note saved locally: ${noteFile}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const chapters = args.length > 0
  ? args.map(Number).filter(n => CHAPTER_FILES[n])
  : Object.keys(CHAPTER_FILES).map(Number);

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const reportPath = path.join(REPORTS_DIR, `CHAPTER_REVIEW_${date}.md`);

console.log('\n📖 Chapter Review Agent — The Digital Law Firm');
console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no NLM post)' : 'LIVE (posting to NotebookLM)'}`);
console.log(`   Chapters: ${chapters.join(', ')}\n`);

const lines: string[] = [
  '# Chapter Quality Review — The Digital Law Firm',
  `**Date:** ${new Date().toISOString().slice(0, 10)}`,
  `**Standards:** Flesch, Gunning Fog, SMOG, Dale-Chall, Coleman-Liau, Rhythm SD, Passive Voice, Lexical Density, TTR, Kill List, RISK5`,
  '',
  '## Summary Dashboard',
  '',
  '| Ch | Title | Author | Grade | Flesch | Fog | SMOG | Passive | Rhythm | Kill List | RISK5 |',
  '|----|-------|--------|-------|--------|-----|------|---------|--------|-----------|-------|',
];

const fullReports: string[] = [];

for (const ch of chapters) {
  const filename = CHAPTER_FILES[ch];
  const docxPath = path.join(DRIVE_BASE, filename);
  const title = CHAPTER_TITLES[ch];
  const author = CHAPTER_AUTHORS[ch];

  process.stdout.write(`Ch${String(ch).padStart(2, '0')} ${title}... `);

  if (!fs.existsSync(docxPath)) {
    console.log('❌ FILE NOT FOUND');
    lines.push(`| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ❌ NOT FOUND | — | — | — | — | — | — | — |`);
    continue;
  }

  const text = extractTextFromDocx(docxPath);
  if (!text || text.length < 500) {
    console.log('⚠️  Too short / placeholder');
    lines.push(`| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ⚠️ PLACEHOLDER | — | — | — | — | — | — | — |`);
    continue;
  }

  const result = auditReadability(ch, text);
  const risk5 = checkRisk5(text);

  const gradeEmoji = result.overallGrade === 'PASS' ? '✅' : result.overallGrade === 'ADVISORY' ? '⚠️' : '❌';
  const rhythmIcon = result.sentenceLengthVariation >= 5 ? '✅' : '⚠️';
  const passiveIcon = result.passiveVoiceRatio < 0.1 ? '✅' : '⚠️';
  const killIcon = result.killListHits.length === 0 ? '✅' : `❌ ${result.killListHits.length}`;
  const risk5Icon = risk5.length === 0 ? '✅' : `🔴 ${risk5.length}`;

  lines.push(
    `| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ${gradeEmoji} ${result.overallGrade} | ` +
    `${result.fleschReadingEase} | ${result.gunningFog} | ${result.smogGrade} | ` +
    `${(result.passiveVoiceRatio * 100).toFixed(0)}% ${passiveIcon} | ` +
    `SD${result.sentenceLengthVariation} ${rhythmIcon} | ` +
    `${killIcon} | ${risk5Icon} |`
  );

  // Full report section
  const chReport = [
    '',
    '---',
    result.summary,
    '',
    `**Dale-Chall Score:** ${result.daleChallScore} ${result.daleChallScore <= 7 ? '✅' : '⚠️'} (target ≤ 7.0)`,
    `**Coleman-Liau Index:** ${result.colemanLiauIndex} ${result.colemanLiauIndex <= 12 ? '✅' : '⚠️'} (target ≤ 12)`,
    `**Sentence Rhythm SD:** ${result.sentenceLengthVariation} ${rhythmIcon} (target ≥ 5 — low = monotone)`,
    `**Lexical Density:** ${(result.lexicalDensity * 100).toFixed(0)}% ${result.lexicalDensity >= 0.45 && result.lexicalDensity <= 0.55 ? '✅' : '⚠️'} (target 45–55%)`,
    `**Type-Token Ratio:** ${result.typeTokenRatio.toFixed(2)} ${result.typeTokenRatio >= 0.4 && result.typeTokenRatio <= 0.6 ? '✅' : '⚠️'} (target 0.4–0.6)`,
    '',
  ];

  if (result.killListHits.length > 0) {
    chReport.push('### ❌ Kill List Violations (delete or rewrite)');
    result.killListHits.forEach(hit => chReport.push(`- "${hit}"`));
    chReport.push('');
  }

  if (risk5.length > 0) {
    chReport.push('### 🔴 RISK5 Violations (fabricated citations — fix immediately)');
    risk5.forEach(r => chReport.push(`- **Found:** ${r.violation}\n  **Fix:** ${r.fix}`));
    chReport.push('');
  }

  fullReports.push(chReport.join('\n'));

  const noteText = chReport.join('\n');
  if (!DRY_RUN) {
    postNoteToNotebookLM(ch, noteText);
  }

  const status = result.overallGrade === 'PASS' ? '✅ PASS'
    : result.overallGrade === 'ADVISORY' ? `⚠️  ADVISORY (${result.warnings.length} warnings)`
    : `❌ FAIL (${result.blockers.length} blockers)`;

  console.log(status);
}

// Write full report
const report = [...lines, ...fullReports].join('\n');
fs.writeFileSync(reportPath, report, 'utf8');
console.log(`\n📄 Full report: ${reportPath}`);

if (DRY_RUN) {
  console.log('   (DRY RUN — no notes posted to NotebookLM)');
}
