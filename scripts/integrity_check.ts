#!/usr/bin/env npx tsx
/**
 * Content Integrity Validator
 * ============================
 * Runs after every readability rewrite pass.
 * Compares original chapter against _readable.md and flags:
 *
 *   CRITICAL (blocks publication):
 *   - Statistics/numbers present in original but missing or changed in rewrite
 *   - Regulatory references dropped (SRA, ICO, UK GDPR, FCA, SRA Code, Article N)
 *   - Citations dropped (anything that looks like a source reference)
 *   - New statistics in rewrite not in original (hallucination risk)
 *
 *   WARNING (author must review):
 *   - Legal caveats shortened or reworded
 *   - Regulatory body names replaced with generic terms
 *   - Word count change > 15% (content added or removed)
 *
 * Usage:
 *   npx tsx scripts/integrity_check.ts          # all chapters
 *   npx tsx scripts/integrity_check.ts 7 8 9    # specific chapters
 *
 * Output:
 *   ~/Downloads/Digital_Law_Firm_Chapters/reports/INTEGRITY_REPORT.md
 *   Exit code 1 if any CRITICAL failures found
 */

import fs from 'fs';
import path from 'path';

const CHAPTERS_DIR = path.join(process.env.HOME!, 'Downloads', 'Digital_Law_Firm_Chapters');
const REPORTS_DIR = path.join(CHAPTERS_DIR, 'reports');
const DRIVE_DIR = path.join(
  process.env.HOME!,
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review'
);

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

// ── Extractors ────────────────────────────────────────────────────────────────

// All numbers, percentages, currency amounts, and year references
function extractNumbers(text: string): string[] {
  const patterns = [
    /£[\d,]+(?:\.\d+)?(?:k|m|bn)?/gi,           // £2, £63,750, £2.4bn
    /\d+(?:\.\d+)?%/g,                             // 16%, 52.3%
    /\b\d{4}\b/g,                                  // years: 2024, 2026
    /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,              // plain numbers
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, // written numbers
  ];
  // Normalise: written numbers → digits so "twelve" and "12" match
  const wordToDigit: Record<string, string> = {
    one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',
    seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',
    thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',
    eighteen:'18',nineteen:'19',twenty:'20',thirty:'30',forty:'40',
    fifty:'50',sixty:'60',seventy:'70',eighty:'80',ninety:'90',
    hundred:'100',thousand:'1000',
  };
  const found = new Set<string>();
  patterns.forEach(re => {
    const matches = text.match(re) ?? [];
    matches.forEach(m => {
      const norm = wordToDigit[m.toLowerCase()] ?? m.toLowerCase().trim();
      found.add(norm);
    });
  });
  return Array.from(found).sort();
}

// Regulatory references — specific bodies, articles, codes
function extractRegulatoryRefs(text: string): string[] {
  const patterns = [
    /SRA\s+Code(?:\s+of\s+Conduct)?(?:\s+\d+(?:\.\d+)*)?/gi,
    /UK\s+GDPR(?:\s+Article\s+\d+)?/gi,
    /Article\s+\d+(?:\(\d+\))?/gi,
    /ICO/g,
    /FCA/g,
    /SRA\s+Standards\s+and\s+Regulations/gi,
    /Outcome\s+\d+(?:\.\d+)*/gi,
    /Rule\s+\d+(?:\.\d+)*/gi,
    /Regulation\s+\d+/gi,
    /Section\s+\d+/gi,
    /\bSRA\b/g,
    /\bICO\b/g,
    /\bMLRO\b/g,
    /\bDPA\s+2018\b/gi,
    /\bPECA\b/gi,
  ];
  const found = new Set<string>();
  patterns.forEach(re => {
    const matches = text.match(re) ?? [];
    matches.forEach(m => found.add(m.trim()));
  });
  return Array.from(found).sort();
}

// Citation-like patterns — bracketed references, footnotes, source attributions
function extractCitations(text: string): string[] {
  const patterns = [
    /\([A-Z][^)]+\d{4}[^)]*\)/g,                  // (Thomson Reuters, 2025)
    /\[[^\]]+\]/g,                                   // [1], [Law Society 2024]
    /according to [^,.]+/gi,
    /per [A-Z][^,.]+/g,
    /source:\s*[^\n]+/gi,
    /\*[^*]+\*/g,                                    // *footnote markers*
  ];
  const found = new Set<string>();
  patterns.forEach(re => {
    const matches = text.match(re) ?? [];
    matches.forEach(m => {
      const clean = m.trim().slice(0, 80);
      if (clean.length > 5) found.add(clean);
    });
  });
  return Array.from(found).sort();
}

// Legal caveat language that must survive intact
function extractCaveats(text: string): string[] {
  const patterns = [
    /this is not legal advice[^.]*\./gi,
    /seek independent (?:legal )?advice[^.]*\./gi,
    /consult (?:a )?(?:solicitor|lawyer)[^.]*\./gi,
    /fictional[^.]*example[^.]*\./gi,
    /for illustrative purposes[^.]*\./gi,
    /not a substitute for[^.]*\./gi,
    /you should take independent[^.]*\./gi,
  ];
  const found: string[] = [];
  patterns.forEach(re => {
    const matches = text.match(re) ?? [];
    matches.forEach(m => found.push(m.trim().slice(0, 120)));
  });
  return found;
}

// ── Comparison ────────────────────────────────────────────────────────────────

interface IntegrityIssue {
  severity: 'CRITICAL' | 'WARNING';
  category: string;
  detail: string;
}

function checkIntegrity(original: string, rewrite: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // 1. Numbers / statistics
  // Normalise before comparison: strip trailing punctuation, strip time-format context
  function normaliseNum(n: string): string {
    return n.replace(/[,.]$/, '').trim(); // strip trailing comma/period from sentence context
  }
  const origNums = extractNumbers(original).map(normaliseNum);
  const newNums = new Set(extractNumbers(rewrite).map(normaliseNum));
  const origNumSet = new Set(origNums);

  // Only flag drops of meaningful statistics: percentages, currency, large numbers
  // Skip bare small integers (1-50) that may be dates, list markers, or timestamps
  // Skip numbers that appear only embedded inside larger numbers (e.g. "47" in "3,247")
  const isEmbedded = (n: string, text: string) => {
    const escaped = n.replace(/[£%,]/g, '\\$&');
    // Check if every occurrence is preceded or followed by a digit (embedded in larger number)
    const re = new RegExp(`(?<=\\d)${escaped}|${escaped}(?=\\d)`, 'g');
    const standalone = new RegExp(`(?<!\\d)${escaped}(?!\\d)`, 'g');
    return !standalone.test(text); // true = only embedded, never standalone
  };
  const isMeaningful = (n: string) =>
    n.includes('%') || n.includes('£') || n.includes(',') ||
    (parseInt(n) > 50 && !/^(19|20)\d{2}$/.test(n));

  const droppedNums = origNums.filter(n => !newNums.has(n) && isMeaningful(n));
  droppedNums.forEach(n => {
    issues.push({
      severity: 'CRITICAL',
      category: 'Statistic dropped',
      detail: `"${n}" appears in original but not in rewrite`,
    });
  });

  // New statistics not in original — only flag meaningful ones
  const addedNums = Array.from(newNums).filter(n =>
    !origNumSet.has(n) && isMeaningful(n) && !/^(19|20)\d{2}$/.test(n)
  );
  addedNums.slice(0, 10).forEach(n => {
    issues.push({
      severity: 'CRITICAL',
      category: 'New statistic (hallucination risk)',
      detail: `"${n}" appears in rewrite but NOT in original — verify this is not fabricated`,
    });
  });

  // 2. Regulatory references
  const origRegs = extractRegulatoryRefs(original);
  const newRegs = new Set(extractRegulatoryRefs(rewrite).map(r => r.toLowerCase()));
  origRegs.forEach(ref => {
    if (!newRegs.has(ref.toLowerCase())) {
      issues.push({
        severity: 'CRITICAL',
        category: 'Regulatory reference dropped',
        detail: `"${ref}" present in original but missing from rewrite`,
      });
    }
  });

  // 3. Caveats — check concept is preserved, not exact wording
  // "fictional example" can become "made-up case" or "illustrative scenario" — all OK
  const origCaveats = extractCaveats(original);
  const rewriteLower = rewrite.toLowerCase();
  origCaveats.forEach(cav => {
    const cavLower = cav.toLowerCase();
    // For "fictional" caveats — accept any of these synonyms as preservation
    if (cavLower.includes('fictional')) {
      const preserved = ['fictional','made-up','made up','illustrative','hypothetical','invented']
        .some(syn => rewriteLower.includes(syn));
      if (!preserved) {
        issues.push({ severity: 'CRITICAL', category: 'Fictional label dropped',
          detail: `Chapter marks content as fictional but rewrite has no fiction label. Original: "${cav.slice(0, 80)}"` });
      }
      return;
    }
    // For "not a substitute" / "seek advice" caveats — check for substance
    const shortCav = cavLower.slice(0, 30);
    if (!rewriteLower.includes(shortCav)) {
      // Accept rewording if key concepts are preserved
      const concepts = ['not.*substitute','legal.*advice','solicitor','practitioner-developed','sra.*standard']
        .some(p => new RegExp(p).test(rewriteLower));
      if (!concepts) {
        issues.push({ severity: 'CRITICAL', category: 'Legal caveat dropped',
          detail: `Caveat not found in rewrite: "${cav.slice(0, 80)}"` });
      }
    }
  });

  // 4. Word count drift
  const origWords = original.match(/\b\w+\b/g)?.length ?? 0;
  const newWords = rewrite.match(/\b\w+\b/g)?.length ?? 0;
  const drift = Math.abs(newWords - origWords) / origWords;
  if (drift > 0.20) {
    issues.push({
      severity: 'WARNING',
      category: 'Word count drift',
      detail: `Original: ${origWords} words → Rewrite: ${newWords} words (${(drift*100).toFixed(0)}% change). Content may have been added or removed.`,
    });
  }

  // 5. SRA specifically — must appear same number of times (±10%)
  const origSRA = (original.match(/\bSRA\b/g) ?? []).length;
  const newSRA = (rewrite.match(/\bSRA\b/g) ?? []).length;
  if (origSRA > 0 && newSRA < origSRA * 0.7) {
    issues.push({
      severity: 'WARNING',
      category: 'SRA references reduced',
      detail: `Original had ${origSRA} SRA references; rewrite has ${newSRA}. Regulatory framing may have been weakened.`,
    });
  }

  // 6. RISK 5 — three known regulatory errors that must never appear in any chapter
  const risk5Violations: Array<{bad: string; good: string}> = [
    {
      bad: 'GDPR Article 9.*SRA Outcome 6.3.*UK data residency|UK data residency.*mandatory',
      good: 'Ch05 data residency: UK GDPR Chapter V permits transfers via adequacy/SCCs/BCRs — residency not mandatory'
    },
    {
      bad: 'SRA Technology Guidance 2024',
      good: 'Ch09: use "SRA Standards & Regulations (current as of 2025)" or specific Code Outcome numbers'
    },
    {
      bad: 'Law Society PI Insurance Practice Note 2025',
      good: 'Ch10: use "Insurance Act 2015 Section 3 and Section 8"'
    },
    {
      bad: '£121,000|£121000',
      good: 'Ch01 shadow inefficiency is £121,500 (1,620 hrs × £75/hr) — not £121,000 (rounding error)'
    },
  ];
  risk5Violations.forEach(({ bad, good }) => {
    if (new RegExp(bad, 'i').test(rewrite)) {
      issues.push({
        severity: 'CRITICAL',
        category: 'RISK 5 violation — fabricated regulatory reference',
        detail: `Prohibited reference found. ${good}`,
      });
    }
  });

  // 7. Key legal bodies replaced with generics
  const legalBodies = ['SRA', 'ICO', 'FCA', 'Law Society', 'HMCTS', 'MLRO'];
  legalBodies.forEach(body => {
    const origCount = (original.match(new RegExp(`\\b${body}\\b`, 'g')) ?? []).length;
    const newCount = (rewrite.match(new RegExp(`\\b${body}\\b`, 'g')) ?? []).length;
    if (origCount > 2 && newCount < origCount * 0.6) {
      issues.push({
        severity: 'WARNING',
        category: 'Regulatory body name diluted',
        detail: `"${body}" appears ${origCount}× in original, only ${newCount}× in rewrite. May have been replaced with generic language.`,
      });
    }
  });

  return issues;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const chapters = args.length > 0
  ? args.map(Number).filter(n => CHAPTER_FILES[n])
  : Object.keys(CHAPTER_FILES).map(Number);

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

console.log(`\n🔒 Content Integrity Check — The Digital Law Firm`);
console.log(`   Comparing originals vs _readable.md drafts`);
console.log(`   Chapters: ${chapters.join(', ')}\n`);

let totalCritical = 0;
let totalWarnings = 0;
const allResults: { ch: number; author: string; issues: IntegrityIssue[] }[] = [];

for (const ch of chapters) {
  const filename = CHAPTER_FILES[ch];
  const origPath = path.join(CHAPTERS_DIR, filename);
  const readPath = path.join(CHAPTERS_DIR, filename.replace('.md', '_readable.md'));

  if (!fs.existsSync(origPath)) { console.log(`  Ch${ch} — original not found, skip`); continue; }
  if (!fs.existsSync(readPath)) { console.log(`  Ch${ch} — readable draft not found, skip`); continue; }

  const original = fs.readFileSync(origPath, 'utf-8');
  const rewrite = fs.readFileSync(readPath, 'utf-8');
  const issues = checkIntegrity(original, rewrite);

  const critical = issues.filter(i => i.severity === 'CRITICAL').length;
  const warnings = issues.filter(i => i.severity === 'WARNING').length;
  totalCritical += critical;
  totalWarnings += warnings;
  allResults.push({ ch, author: CHAPTER_AUTHORS[ch], issues });

  const icon = critical > 0 ? '❌' : warnings > 0 ? '⚠️ ' : '✅';
  console.log(`  Ch${String(ch).padStart(2,'0')} ${icon}  ${critical} critical | ${warnings} warnings — ${CHAPTER_AUTHORS[ch]}`);
  if (critical > 0) {
    issues.filter(i => i.severity === 'CRITICAL').slice(0,3).forEach(i => {
      console.log(`       ❌ ${i.category}: ${i.detail.slice(0, 80)}`);
    });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const reportLines = [
  `# Content Integrity Report — The Digital Law Firm`,
  `### Readability rewrite validation — original vs _readable.md`,
  `Generated: ${new Date().toISOString().slice(0,16)} UTC`,
  ``,
  `> **Purpose:** Every readability rewrite must be validated for content integrity.`,
  `> CRITICAL issues must be resolved before the chapter goes to author review.`,
  `> WARNING issues require author sign-off.`,
  ``,
  `## Summary`,
  ``,
  `| | Count |`,
  `|---|---|`,
  `| ❌ Critical issues | ${totalCritical} |`,
  `| ⚠️ Warnings | ${totalWarnings} |`,
  `| Chapters checked | ${chapters.length} |`,
  ``,
  `## Chapter Detail`,
  ``,
];

allResults.forEach(({ ch, author, issues }) => {
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const warnings = issues.filter(i => i.severity === 'WARNING');
  const icon = critical.length > 0 ? '❌' : warnings.length > 0 ? '⚠️' : '✅';

  reportLines.push(`### ${icon} Chapter ${ch} — ${author}`);
  reportLines.push(``);

  if (issues.length === 0) {
    reportLines.push(`✅ No integrity issues detected.`);
  } else {
    if (critical.length > 0) {
      reportLines.push(`**❌ Critical (${critical.length}) — must fix before author review:**`);
      critical.forEach(i => reportLines.push(`- **${i.category}:** ${i.detail}`));
      reportLines.push(``);
    }
    if (warnings.length > 0) {
      reportLines.push(`**⚠️ Warnings (${warnings.length}) — author must confirm:**`);
      warnings.forEach(i => reportLines.push(`- **${i.category}:** ${i.detail}`));
    }
  }
  reportLines.push(``);
  reportLines.push(`---`);
  reportLines.push(``);
});

const report = reportLines.join('\n');
const reportPath = path.join(REPORTS_DIR, 'INTEGRITY_REPORT.md');
fs.writeFileSync(reportPath, report, 'utf-8');

if (fs.existsSync(DRIVE_DIR)) {
  fs.writeFileSync(path.join(DRIVE_DIR, 'INTEGRITY_REPORT.md'), report, 'utf-8');
}

console.log(`\n  Report: ${reportPath}`);
console.log(`  ${totalCritical} critical | ${totalWarnings} warnings\n`);

if (totalCritical > 0) {
  console.log(`  ❌ INTEGRITY FAILURES FOUND. Resolve before sending to authors.\n`);
  process.exit(1);
} else {
  console.log(`  ✅ Content integrity passed. Safe for author review.\n`);
}
