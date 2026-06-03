#!/usr/bin/env npx tsx
/**
 * Chapter Quality Agent
 * =====================
 * Reads each chapter docx, runs four readability standards,
 * generates a structured feedback comment, then posts it
 * to the corresponding Skool lesson comment section via the browser.
 *
 * The four standards — chosen for a persuasion text aimed at
 * time-poor UK practice managers:
 *
 *   1. Gunning Fog Index    ≤ 10   — the legal writing disease (polysyllabic overload)
 *   2. Flesch Reading Ease  ≥ 70   — universal benchmark; commuter-readable
 *   3. Dale-Chall Score     ≤ 6.5  — tests vocabulary against 3,000 familiar words
 *   4. Passive Voice %      < 8%   — passive voice kills urgency; this book must persuade
 *
 * Usage:
 *   npx tsx scripts/chapter_quality_agent.ts          # all chapters
 *   npx tsx scripts/chapter_quality_agent.ts 1        # chapter 1 only
 *   npx tsx scripts/chapter_quality_agent.ts --dry-run 1  # report, no Skool post
 *
 * Output:
 *   ~/Downloads/Digital_Law_Firm_Chapters/reports/QUALITY_REVIEW_YYYYMMDD.md
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── Config ────────────────────────────────────────────────────────────────────

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

// Skool lesson URLs — one per chapter (add as lessons are created)
const SKOOL_LESSON_URLS: Record<number, string> = {
  1: 'https://www.skool.com/ghostwriter-tandem-6940/classroom/9250253b?md=f5efea35efd245d5ac47541389f66ffb',
  // Ch02–Ch12 URLs added as lessons are created in Skool
};

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

// ── Text utilities ────────────────────────────────────────────────────────────

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.split(/\s+/).length > 3);
}

function extractWords(text: string): string[] {
  return text.match(/\b[a-zA-Z']{2,}\b/g) ?? [];
}

// ── Dale-Chall familiar word set (practitioner-calibrated) ───────────────────
const DALE_CHALL_FAMILIAR = new Set([
  'a','able','about','above','act','add','after','again','age','ago','agree',
  'air','all','allow','almost','alone','along','already','also','always','am',
  'among','an','and','answer','any','are','arm','around','as','ask','at','away',
  'back','bad','ball','be','beat','because','been','before','begin','being',
  'best','better','between','big','black','blue','body','book','both','box',
  'boy','bring','build','but','by','call','came','can','care','carry','cause',
  'certain','change','check','child','city','class','clean','clear','close',
  'come','cost','could','cover','cut','day','dead','deal','deep','did',
  'different','do','does','done','door','down','draw','drive','drop','dry',
  'during','each','early','earth','end','enough','even','ever','every',
  'example','face','fact','fall','far','fast','few','field','fight','fill',
  'find','fire','first','five','floor','fly','follow','food','for','force',
  'form','four','free','from','front','full','game','get','give','go','good',
  'government','great','green','group','grow','half','hand','hard','has','have',
  'he','head','hear','heart','heavy','help','her','here','high','him','his',
  'hold','home','hot','hour','how','human','idea','if','in','into','is','it',
  'its','just','keep','kind','know','large','last','late','lead','learn','left',
  'less','let','life','light','like','line','list','little','live','long',
  'look','low','main','make','man','many','matter','may','me','mean','men',
  'might','mind','more','most','move','much','must','my','name','near','never',
  'new','next','night','no','north','not','note','now','number','of','off',
  'often','old','on','once','one','only','open','or','order','other','our',
  'out','over','own','part','past','pay','people','place','plan','plant','play',
  'point','poor','power','press','public','put','question','read','ready','real',
  'reason','red','report','rest','right','road','room','round','run','said',
  'same','say','sea','seem','send','set','she','short','show','side','since',
  'six','small','so','some','soon','south','stand','start','state','stay',
  'step','still','stop','strong','such','sure','take','talk','ten','than',
  'that','the','their','them','then','there','these','they','thing','think',
  'this','those','three','through','time','to','today','together','too','town',
  'try','turn','two','under','until','up','use','very','walk','want','war',
  'was','water','way','we','well','went','were','what','when','where','while',
  'white','who','why','will','with','word','work','world','would','write',
  'year','yes','yet','you','young','your',
  // Legal/business terms a practice manager knows:
  'ai','firm','client','law','legal','court','case','evidence','contract',
  'partner','revenue','cost','profit','data','process','staff','team','risk',
  'review','system','plan','result','service','practice','advice','compliance',
  'report','matter','rule','standard','policy','code','fee','bill','claim',
  'issue','training','draft','version','section','chapter','note','record',
  'sra','gdpr','roi','pilot','audit','model','tool','error','output','input',
  'task','hour','week','month','year','firm','letter','file','draft','client',
  'budget','target','measure','track','test','check','sign','approve','run',
  'build','save','free','pay','earn','lose','win','find','fix','show','prove',
]);

// Passive voice patterns
const PASSIVE_RE = [
  /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi,
  /\b(has|have|had)\s+been\s+\w+ed\b/gi,
];

// Kill List — top-priority banned phrases for this book's voice
const KILL_LIST = [
  'it is worth noting', 'in order to', 'due to the fact that',
  'this demonstrates', 'this highlights', 'in conclusion',
  'seamless', 'seamlessly', 'leverage', 'synergy', 'paradigm',
  'holistic', 'cutting-edge', 'game-changer', 'transformative',
  'navigate', 'robust', 'disruptive', 'ecosystem', 'innovative',
  'perhaps consider', 'you could potentially', 'generally speaking',
  'it could be argued', 'studies show', 'research indicates',
];

// ── Core metrics ──────────────────────────────────────────────────────────────

interface Metrics {
  gunningFog: number;
  fleschReadingEase: number;
  daleChallScore: number;
  passiveVoicePct: number;
  avgSentenceWords: number;
  totalWords: number;
  totalSentences: number;
  killListHits: string[];
  hardestSentences: string[];
}

function analyse(text: string): Metrics {
  const sentences = splitSentences(text);
  const words = extractWords(text);
  const n = Math.max(1, sentences.length);
  const w = Math.max(1, words.length);

  // Syllable totals
  const syllableCount = words.reduce((t, wd) => t + countSyllables(wd), 0);
  const complexWords = words.filter(wd => countSyllables(wd) >= 3 && wd.length > 6).length;

  const asl = w / n;                          // avg sentence length
  const asw = syllableCount / w;              // avg syllables per word

  // 1. Gunning Fog: 0.4 × (ASL + % complex words)
  const gunningFog = 0.4 * (asl + 100 * (complexWords / w));

  // 2. Flesch Reading Ease: 206.835 − 1.015×ASL − 84.6×ASW
  const fleschReadingEase = Math.min(100, Math.max(0,
    206.835 - 1.015 * asl - 84.6 * asw
  ));

  // 3. Dale-Chall
  const unfamiliar = words.filter(wd => !DALE_CHALL_FAMILIAR.has(wd.toLowerCase()));
  const pctUnfamiliar = (unfamiliar.length / w) * 100;
  let daleChallScore = 0.1579 * pctUnfamiliar + 0.0496 * asl;
  if (pctUnfamiliar > 5) daleChallScore += 3.6365;

  // 4. Passive voice %
  const passiveSentences = sentences.filter(s =>
    PASSIVE_RE.some(re => { re.lastIndex = 0; return re.test(s); })
  ).length;
  const passiveVoicePct = (passiveSentences / n) * 100;

  // Kill List hits
  const lower = text.toLowerCase();
  const killListHits = KILL_LIST.filter(phrase => lower.includes(phrase));

  // Hardest sentences (Fog > 18)
  const hardestSentences = sentences
    .map(s => {
      const sw = extractWords(s);
      const sc = sw.reduce((t, wd) => t + countSyllables(wd), 0);
      const cx = sw.filter(wd => countSyllables(wd) >= 3).length;
      const fog = 0.4 * (sw.length + 100 * (cx / Math.max(1, sw.length)));
      return { s, fog };
    })
    .filter(({ fog }) => fog > 18)
    .sort((a, b) => b.fog - a.fog)
    .slice(0, 3)
    .map(({ s, fog }) => `Fog ${fog.toFixed(0)}: "${s.slice(0, 120)}…"`);

  return {
    gunningFog: Math.round(gunningFog * 10) / 10,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    daleChallScore: Math.round(daleChallScore * 100) / 100,
    passiveVoicePct: Math.round(passiveVoicePct * 10) / 10,
    avgSentenceWords: Math.round(asl * 10) / 10,
    totalWords: w,
    totalSentences: n,
    killListHits,
    hardestSentences,
  };
}

// ── Verdict and feedback comment ──────────────────────────────────────────────

type Verdict = 'READY TO CONVINCE' | 'NEEDS WORK' | 'REWRITE BEFORE RELEASE';

function buildComment(ch: number, title: string, author: string, m: Metrics): {
  verdict: Verdict;
  skoolComment: string;
  reportSection: string;
} {
  const issues: string[] = [];
  const wins: string[] = [];

  // Score each metric
  const fogOk      = m.gunningFog <= 10;
  const fleschOk   = m.fleschReadingEase >= 70;
  const dcOk       = m.daleChallScore <= 6.5;
  const passiveOk  = m.passiveVoicePct < 8;

  if (fogOk)    wins.push(`Gunning Fog ${m.gunningFog} ✅ — no polysyllabic overload`);
  else          issues.push(`Gunning Fog ${m.gunningFog} (target ≤ 10) — too many long words. A practice manager will skim, not decode.`);

  if (fleschOk) wins.push(`Flesch ${m.fleschReadingEase} ✅ — commuter-readable`);
  else          issues.push(`Flesch Reading Ease ${m.fleschReadingEase} (target ≥ 70) — currently reads like a legal briefing note, not a practitioner handbook.`);

  if (dcOk)     wins.push(`Dale-Chall ${m.daleChallScore} ✅ — vocabulary familiar to a non-specialist`);
  else          issues.push(`Dale-Chall ${m.daleChallScore} (target ≤ 6.5) — too many unfamiliar words. Replace with simpler equivalents.`);

  if (passiveOk) wins.push(`Passive voice ${m.passiveVoicePct}% ✅ — active and direct`);
  else           issues.push(`Passive voice ${m.passiveVoicePct}% (target < 8%) — passive construction reduces urgency. This chapter needs to move people to act.`);

  const failCount = [fogOk, fleschOk, dcOk, passiveOk].filter(v => !v).length;
  const verdict: Verdict = failCount === 0 ? 'READY TO CONVINCE'
    : failCount <= 2 ? 'NEEDS WORK'
    : 'REWRITE BEFORE RELEASE';

  const verdictEmoji = verdict === 'READY TO CONVINCE' ? '✅'
    : verdict === 'NEEDS WORK' ? '⚠️'
    : '❌';

  // Persuasion framing — always centred on the book's purpose
  const persuasionNote = buildPersuasionNote(ch, m, failCount);

  const skoolComment = `
[QUALITY REVIEW — ${new Date().toISOString().slice(0, 10)}]
**Chapter ${String(ch).padStart(2, '0')}: ${title}**
**Lead author: @${author}**

**Verdict: ${verdictEmoji} ${verdict}**

---

### Four-Standard Audit
| Standard | Score | Target | Status |
|----------|-------|--------|--------|
| Gunning Fog Index | ${m.gunningFog} | ≤ 10 | ${fogOk ? '✅' : '❌'} |
| Flesch Reading Ease | ${m.fleschReadingEase}/100 | ≥ 70 | ${fleschOk ? '✅' : '❌'} |
| Dale-Chall Score | ${m.daleChallScore} | ≤ 6.5 | ${dcOk ? '✅' : '❌'} |
| Passive Voice | ${m.passiveVoicePct}% | < 8% | ${passiveOk ? '✅' : '❌'} |

**Word count:** ${m.totalWords.toLocaleString()} | **Sentences:** ${m.totalSentences}

---

${wins.length > 0 ? `### What's working\n${wins.map(w => `- ${w}`).join('\n')}\n` : ''}
${issues.length > 0 ? `### What needs fixing\n${issues.map(i => `- ${i}`).join('\n')}\n` : ''}
${persuasionNote}
${m.killListHits.length > 0 ? `### Kill List violations (delete or rewrite immediately)\n${m.killListHits.map(h => `- "${h}"`).join('\n')}\n` : ''}
${m.hardestSentences.length > 0 ? `### Three hardest sentences (rewrite first)\n${m.hardestSentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
[APPROVED] once all blockers are resolved — tag @Rajiv Abeysinghe for sign-off.
`.trim();

  const reportSection = `
## Ch${String(ch).padStart(2, '0')} — ${title} (${author})
**Verdict:** ${verdictEmoji} ${verdict}
| Gunning Fog | Flesch | Dale-Chall | Passive Voice |
|-------------|--------|------------|---------------|
| ${m.gunningFog} ${fogOk ? '✅' : '❌'} | ${m.fleschReadingEase} ${fleschOk ? '✅' : '❌'} | ${m.daleChallScore} ${dcOk ? '✅' : '❌'} | ${m.passiveVoicePct}% ${passiveOk ? '✅' : '❌'} |
${issues.length > 0 ? `\n**Issues:** ${issues.join(' | ')}` : ''}
${m.killListHits.length > 0 ? `\n**Kill List:** ${m.killListHits.join(', ')}` : ''}
`.trim();

  return { verdict, skoolComment, reportSection };
}

function buildPersuasionNote(ch: number, m: Metrics, failCount: number): string {
  if (failCount === 0) {
    return `### Persuasion check ✅\nThis chapter reads like a practitioner wrote it for practitioners. The language is direct, the vocabulary is accessible, and the active voice creates momentum. A practice manager picking this up will feel the urgency — and that urgency is the point.\n`;
  }

  if (m.gunningFog > 14 || m.daleChallScore > 8) {
    return `### Persuasion check ⚠️\nThe core problem here is vocabulary, not argument. The case for AI adoption is strong — but if a practice manager has to re-read a sentence to understand it, the moment of conviction is lost. Strip out the three-syllable words wherever a one-syllable word exists. The argument survives; the density does not.\n`;
  }

  if (m.passiveVoicePct >= 8) {
    return `### Persuasion check ⚠️\nPassive voice is the enemy of urgency. "Decisions are made" tells the reader nothing. "You make 47 decisions a day that a trained system could handle" makes them count. Rewrite passive constructions as second-person imperatives wherever the chapter is making a case for action.\n`;
  }

  return `### Persuasion check ⚠️\nThe argument is there — the language needs to carry it more efficiently. The target reader is a practice manager with six minutes and a nagging sense that they are falling behind. Every sentence needs to earn its place. Cut anything that doesn't directly advance the case for acting now.\n`;
}

// ── Docx extraction ───────────────────────────────────────────────────────────

function extractText(docxPath: string): string {
  try {
    return execSync(`npx mammoth --output-format=markdown "${docxPath}" 2>/dev/null`, {
      maxBuffer: 10 * 1024 * 1024, encoding: 'utf8',
    });
  } catch {
    try {
      return execSync(`strings "${docxPath}"`, { encoding: 'utf8' });
    } catch {
      return '';
    }
  }
}

// ── Skool comment posting (via notebooklm CLI + browser) ────────────────────
// Posts via a headless script that the Chrome extension picks up.
// Falls back to saving comment text to a file for manual paste.

function postSkoolComment(ch: number, comment: string): void {
  const url = SKOOL_LESSON_URLS[ch];
  if (!url) {
    console.log(`   📋 No Skool URL for Ch${ch} yet — comment saved to file`);
    return;
  }
  const commentFile = `/tmp/skool_comment_ch${String(ch).padStart(2, '0')}.txt`;
  fs.writeFileSync(commentFile, comment, 'utf8');
  console.log(`   💬 Comment ready: ${commentFile}`);
  console.log(`   🔗 Post to: ${url}`);
  // Browser posting is handled by the calling shell when --post-skool flag is used.
  // The TypeScript agent generates the comment; browser automation pastes it.
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const chapters = args.length > 0
  ? args.map(Number).filter(n => CHAPTER_FILES[n])
  : Object.keys(CHAPTER_FILES).map(Number);

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const reportPath = path.join(REPORTS_DIR, `QUALITY_REVIEW_${date}.md`);

console.log('\n📖 Chapter Quality Agent — The Digital Law Firm');
console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
console.log(`   Chapters: ${chapters.join(', ')}\n`);

const summaryRows: string[] = [];
const reportSections: string[] = [];

for (const ch of chapters) {
  const filename = CHAPTER_FILES[ch];
  const docxPath = path.join(DRIVE_BASE, filename);
  const title = CHAPTER_TITLES[ch];
  const author = CHAPTER_AUTHORS[ch];

  process.stdout.write(`Ch${String(ch).padStart(2, '0')} ${title.padEnd(32)} `);

  if (!fs.existsSync(docxPath)) {
    console.log('❌ NOT FOUND');
    summaryRows.push(`| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ❌ NOT FOUND | — | — | — | — |`);
    continue;
  }

  const text = extractText(docxPath);
  if (!text || text.length < 500) {
    console.log('⚠️  PLACEHOLDER');
    summaryRows.push(`| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ⚠️ PLACEHOLDER | — | — | — | — |`);
    continue;
  }

  const metrics = analyse(text);
  const { verdict, skoolComment, reportSection } = buildComment(ch, title, author, metrics);

  const icon = verdict === 'READY TO CONVINCE' ? '✅' : verdict === 'NEEDS WORK' ? '⚠️' : '❌';
  console.log(`${icon} ${verdict}`);

  summaryRows.push(
    `| ${String(ch).padStart(2, '0')} | ${title} | ${author} | ${icon} ${verdict} | ` +
    `${metrics.gunningFog} | ${metrics.fleschReadingEase} | ${metrics.daleChallScore} | ${metrics.passiveVoicePct}% |`
  );

  reportSections.push(reportSection);

  // Save comment file regardless
  postSkoolComment(ch, skoolComment);
}

// Write report
const report = [
  '# Chapter Quality Review — The Digital Law Firm',
  `**Date:** ${new Date().toISOString().slice(0, 10)}`,
  `**Standards:** Gunning Fog (≤10), Flesch Reading Ease (≥70), Dale-Chall (≤6.5), Passive Voice (<8%)`,
  `**Purpose:** Does each chapter convince a time-poor practice manager they need to act on AI?`,
  '',
  '## Dashboard',
  '',
  '| Ch | Title | Author | Verdict | Fog | Flesch | Dale-Chall | Passive |',
  '|----|-------|--------|---------|-----|--------|------------|---------|',
  ...summaryRows,
  '',
  '---',
  '',
  ...reportSections,
].join('\n');

fs.writeFileSync(reportPath, report, 'utf8');
console.log(`\n📄 Report: ${reportPath}`);
if (DRY_RUN) console.log('   (DRY RUN — Skool comments saved to /tmp/skool_comment_ch*.txt)');
