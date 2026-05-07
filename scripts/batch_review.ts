#!/usr/bin/env npx tsx
/**
 * Batch Four-Eyes Review Runner
 * ==============================
 * Reads all 12 chapter .md files, runs each through the full Ghostwriter
 * pipeline (GPT-4o → Perplexity → Grok → ChatGPT → Four-Eyes), then
 * iterates rewrites until all risks are RISK-0/1/2 (no RISK-3 findings).
 *
 * Usage:
 *   cd /Users/arajiv/legal-citation-verifier/frontend
 *   npx tsx scripts/batch_review.ts
 *
 * Optional — process specific chapters only:
 *   npx tsx scripts/batch_review.ts 1 3 7
 *
 * Outputs:
 *   ~/Downloads/Digital_Law_Firm_Chapters/reports/chapter_XX_review_v[n].md
 *   ~/Downloads/Digital_Law_Firm_Chapters/chapter_XX_*.md (rewritten in place)
 *   ~/Downloads/Digital_Law_Firm_Chapters/reports/BATCH_SUMMARY.md
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.local from the project root
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { runGemini } from '../lib/ghostwriter/stages/gemini';
import { runPerplexity } from '../lib/ghostwriter/stages/perplexity';
import { runGrok } from '../lib/ghostwriter/stages/grok';
import { runChatGPT } from '../lib/ghostwriter/stages/chatgpt';
import { runFourEyes } from '../lib/ghostwriter/stages/foureyes';
import { rewriteChapter } from '../lib/ghostwriter/rewriter';
import { AUTHOR_VOICES } from '../lib/ghostwriter/prompts';

const CHAPTERS_DIR = path.join(process.env.HOME!, 'Downloads', 'Digital_Law_Firm_Chapters');
const REPORTS_DIR = path.join(CHAPTERS_DIR, 'reports');
const MAX_ITERATIONS = 3;

/** Map chapter number to filename */
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

interface ChapterResult {
  chapter: number;
  filename: string;
  finalStatus: 'PASS' | 'HUMAN_GATE' | 'MAX_ITERATIONS_REACHED';
  iterations: number;
  finalMaxRisk: number;
  risk3Count: number;
  risk2Count: number;
  narrativePct: number;
  totalCostGbp: number;
  reportPaths: string[];
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function processChapter(chapterNum: number): Promise<ChapterResult> {
  const filename = CHAPTER_FILES[chapterNum];
  if (!filename) throw new Error(`No file mapping for chapter ${chapterNum}`);

  const filePath = path.join(CHAPTERS_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const authorVoice = AUTHOR_VOICES[chapterNum] ?? AUTHOR_VOICES[1];
  const reportPaths: string[] = [];
  let totalCostGbp = 0;
  let currentDraft = fs.readFileSync(filePath, 'utf-8');
  let finalMaxRisk = 3;
  let finalNarrativePct = 0;
  let finalRisk3Count = 0;
  let finalRisk2Count = 0;
  let iteration = 0;
  let finalStatus: ChapterResult['finalStatus'] = 'MAX_ITERATIONS_REACHED';

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    log(`Ch${chapterNum} — iteration ${iteration}/${MAX_ITERATIONS}: running pipeline…`);

    // Stage 1: Evidence hierarchy (GPT-4o, formerly Gemini)
    log(`  Ch${chapterNum} → Stage 1: Evidence Hierarchy`);
    const geminiResult = await runGemini(chapterNum, currentDraft);
    totalCostGbp += geminiResult.costGbp;

    // Stage 2: Currency check (Perplexity)
    log(`  Ch${chapterNum} → Stage 2: Currency Check`);
    const perplexityResult = await runPerplexity(chapterNum, currentDraft, geminiResult.output);
    totalCostGbp += perplexityResult.costGbp;

    // Stage 3: Critical challenge (Grok)
    log(`  Ch${chapterNum} → Stage 3: Critical Challenge`);
    const grokResult = await runGrok(
      chapterNum,
      currentDraft,
      geminiResult.output,
      perplexityResult.output,
    );
    totalCostGbp += grokResult.costGbp;

    // Stage 4: Editorial consistency (ChatGPT)
    log(`  Ch${chapterNum} → Stage 4: Editorial Consistency`);
    const chatgptResult = await runChatGPT(chapterNum, currentDraft, authorVoice);
    totalCostGbp += chatgptResult.costGbp;

    // Stage 5: Four-Eyes synthesis + risk scoring
    log(`  Ch${chapterNum} → Stage 5: Four-Eyes Risk Scoring`);
    const { stageResult: fourEyesStage, fourEyes } = await runFourEyes(
      chapterNum,
      currentDraft,
      geminiResult.output,
      perplexityResult.output,
      grokResult.output,
      chatgptResult.output,
    );
    totalCostGbp += fourEyesStage.costGbp;

    finalMaxRisk = fourEyes.maxRisk;
    finalNarrativePct = fourEyes.narrativePct;
    finalRisk3Count = fourEyes.risks.filter((r) => r.level === 3).length;
    finalRisk2Count = fourEyes.risks.filter((r) => r.level === 2).length;

    // Save this iteration's report
    const reportFilename = `chapter_${String(chapterNum).padStart(2, '0')}_review_v${iteration}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFilename);
    fs.writeFileSync(reportPath, fourEyes.report, 'utf-8');
    reportPaths.push(reportPath);
    log(`  Ch${chapterNum} → Report saved: ${reportFilename}`);
    log(`  Ch${chapterNum} → Max risk: RISK-${finalMaxRisk} | RISK-3: ${finalRisk3Count} | RISK-2: ${finalRisk2Count} | Narrative: ${finalNarrativePct}%`);

    // Decide: pass, human gate, or rewrite
    if (!fourEyes.isBlocked) {
      // No RISK-3 findings — acceptable
      finalStatus = finalRisk2Count > 0 ? 'HUMAN_GATE' : 'PASS';
      log(`  Ch${chapterNum} → ✅ ${finalStatus} — no further iterations needed`);
      break;
    }

    if (iteration >= MAX_ITERATIONS) {
      finalStatus = 'MAX_ITERATIONS_REACHED';
      log(`  Ch${chapterNum} → ⚠️  Max iterations reached with RISK-3 findings still present`);
      break;
    }

    // Rewrite to fix RISK-3 items (and attempt RISK-2 where possible)
    const risk3Items = fourEyes.risks.filter((r) => r.level === 3);
    const risk2Items = fourEyes.risks.filter((r) => r.level === 2);

    log(`  Ch${chapterNum} → Rewriting to fix ${risk3Items.length} RISK-3 and ${risk2Items.length} RISK-2 items…`);
    const rewriteResult = await rewriteChapter(
      chapterNum,
      currentDraft,
      risk3Items,
      risk2Items,
      iteration,
    );
    totalCostGbp += rewriteResult.costGbp;

    // Save rewritten chapter in place (preserving original with .v[n].bak)
    const bakPath = filePath.replace('.md', `.v${iteration}.bak.md`);
    fs.copyFileSync(filePath, bakPath);
    fs.writeFileSync(filePath, rewriteResult.revisedDraft, 'utf-8');
    currentDraft = rewriteResult.revisedDraft;
    log(`  Ch${chapterNum} → Rewrite saved. Backup: ${path.basename(bakPath)}`);
  }

  return {
    chapter: chapterNum,
    filename,
    finalStatus,
    iterations: iteration,
    finalMaxRisk,
    risk3Count: finalRisk3Count,
    risk2Count: finalRisk2Count,
    narrativePct: finalNarrativePct,
    totalCostGbp,
    reportPaths,
  };
}

function buildSummaryReport(results: ChapterResult[], totalMs: number): string {
  const totalCost = results.reduce((s, r) => s + r.totalCostGbp, 0);
  const passed = results.filter((r) => r.finalStatus === 'PASS').length;
  const gated = results.filter((r) => r.finalStatus === 'HUMAN_GATE').length;
  const maxed = results.filter((r) => r.finalStatus === 'MAX_ITERATIONS_REACHED').length;

  const rows = results
    .map((r) => {
      const statusIcon = r.finalStatus === 'PASS' ? '✅' : r.finalStatus === 'HUMAN_GATE' ? '🟡' : '🔴';
      return `| ${r.chapter} | ${statusIcon} ${r.finalStatus} | ${r.iterations} | RISK-${r.finalMaxRisk} | ${r.risk3Count} | ${r.risk2Count} | ${r.narrativePct}% | £${r.totalCostGbp.toFixed(4)} |`;
    })
    .join('\n');

  return `# Batch Four-Eyes Review — Summary Report
Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC
Total run time: ${Math.round(totalMs / 1000 / 60)} minutes
Total API cost: £${totalCost.toFixed(4)}

## Results

| Ch | Status | Iters | Max Risk | RISK-3 | RISK-2 | Narrative% | Cost |
|----|--------|-------|----------|--------|--------|------------|------|
${rows}

## Summary

- ✅ PASS (no author action): ${passed} chapters
- 🟡 HUMAN GATE (author review of RISK-2 items): ${gated} chapters
- 🔴 MAX ITERATIONS (RISK-3 items remain — manual fix needed): ${maxed} chapters

${maxed > 0 ? `## ⚠️ Chapters Requiring Manual Fix\n\nThe following chapters hit the ${MAX_ITERATIONS}-iteration limit with RISK-3 findings still present. Review the latest report for each and fix manually:\n\n${results.filter((r) => r.finalStatus === 'MAX_ITERATIONS_REACHED').map((r) => `- Chapter ${r.chapter}: ${r.filename}`).join('\n')}` : ''}

${gated > 0 ? `## 🟡 Chapters for Author Review\n\nThe following chapters have no blocking issues but contain RISK-2 advisory items requiring author decision:\n\n${results.filter((r) => r.finalStatus === 'HUMAN_GATE').map((r) => `- Chapter ${r.chapter}: ${r.risk2Count} RISK-2 item(s) — see reports/chapter_${String(r.chapter).padStart(2, '0')}_review_v${r.iterations}.md`).join('\n')}` : ''}

## Narrative Ratio Check

| Ch | Narrative % | Status |
|----|-------------|--------|
${results.map((r) => `| ${r.chapter} | ${r.narrativePct}% | ${r.narrativePct <= 12 ? '✅ OK' : r.narrativePct <= 15 ? '🟡 High' : '🔴 Exceeds limit'} |`).join('\n')}

Target: ≤12% narrative content per chapter. Flag at >15%.

## Report File Locations

${results.map((r) => `**Chapter ${r.chapter}:** ${r.reportPaths.map((p) => path.basename(p)).join(', ')}`).join('\n')}
`;
}

async function main() {
  ensureDir(REPORTS_DIR);

  // Determine which chapters to process
  const args = process.argv.slice(2).map(Number).filter((n) => n >= 1 && n <= 12);
  const chaptersToProcess = args.length > 0 ? args : Object.keys(CHAPTER_FILES).map(Number);

  log(`Starting batch review for ${chaptersToProcess.length} chapter(s): ${chaptersToProcess.join(', ')}`);
  log(`Max iterations per chapter: ${MAX_ITERATIONS}`);
  log(`Output directory: ${REPORTS_DIR}`);
  log('');

  const startMs = Date.now();
  const results: ChapterResult[] = [];

  // Process chapters sequentially (API rate limits + cost control)
  for (const chapterNum of chaptersToProcess) {
    try {
      log(`━━━ Chapter ${chapterNum} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      const result = await processChapter(chapterNum);
      results.push(result);
      log(`━━━ Chapter ${chapterNum} complete — ${result.finalStatus} in ${result.iterations} iteration(s) ━━━`);
      log('');
    } catch (err) {
      log(`ERROR processing Chapter ${chapterNum}: ${err}`);
      results.push({
        chapter: chapterNum,
        filename: CHAPTER_FILES[chapterNum] ?? 'unknown',
        finalStatus: 'MAX_ITERATIONS_REACHED',
        iterations: 0,
        finalMaxRisk: 3,
        risk3Count: 99,
        risk2Count: 0,
        narrativePct: 0,
        totalCostGbp: 0,
        reportPaths: [],
      });
    }
  }

  const totalMs = Date.now() - startMs;
  const summaryReport = buildSummaryReport(results, totalMs);
  const summaryPath = path.join(REPORTS_DIR, 'BATCH_SUMMARY.md');
  fs.writeFileSync(summaryPath, summaryReport, 'utf-8');

  console.log('\n' + '═'.repeat(60));
  console.log(summaryReport);
  console.log('═'.repeat(60));
  log(`Summary saved: ${summaryPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
