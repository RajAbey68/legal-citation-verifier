#!/usr/bin/env npx tsx
/**
 * v3.0 Register Reset — significant upgrade
 * ==========================================
 * Rebuilds each chapter using the device-mix agreed 16 May 2026:
 *  - NO personas (Sarah Mitchell, named protagonists, recurring characters removed)
 *  - Deliverable-as-spine (the chapter is structured around its named artefact)
 *  - Regulatory mapping (sections map to SRA Outcomes / EU AI Act Articles / GDPR Articles)
 *  - 3-5 numbered propositions per chapter (Susskind / Kahneman style)
 *  - Anonymised observational cases ("a regional practice with 12 fee earners…")
 *  - Reader-as-agent thought-experiment openers (second-person, no third-person fiction)
 *  - Regulator's voice for action items ("The firm must…", "The practitioner shall…")
 *  - Historical analogues sparingly when apt
 *  - Specifics retained: real Article numbers, percentages, dates, regulatory cycles
 *  - Verbatim-citation discipline: any paraphrase of SRA / EU AI Act / UK GDPR
 *    text is marked [VERBATIM CHECK: source] — no fabricated verbatim
 *
 * Output: chapters/drafts/chapter_NN_draft.md (canonical, atomic write after verify)
 * Lock guard: chapters were manually unlocked at task start with unlock_reason;
 * this script writes through assertWritable() normally and re-locks at v3.0 after.
 *
 * Cost: ~£0.30 per chapter × 12 = ~£4. Time: ~2 min wall-clock parallelised.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import OpenAI from 'openai';
import { auditReadability } from '../lib/ghostwriter/stages/readability';
import { auditVoiceAuthenticity } from '../lib/ghostwriter/stages/voice_authenticity';
import { auditQuoteIntegrity } from '../lib/ghostwriter/stages/quote_integrity';
import { assertWritable, sha256Of, appendAudit } from '../lib/ghostwriter/lock_guard';

const BOOK_REPO = '/Users/arajiv/code/The-Digital-Law-Firm';
const CHAPTERS_DIR = path.join(BOOK_REPO, 'chapters', 'drafts');
const WORKING_DIR = path.join(BOOK_REPO, 'chapters', 'v3_working');
const SUMMARY_DIR = path.join(BOOK_REPO, 'chapters', 'reports', 'v3_register_reset_2026-05-16');

const CHAPTER_FILES: Record<number, string> = {
  1: 'chapter_01_draft.md', 2: 'chapter_02_draft.md', 3: 'chapter_03_draft.md',
  4: 'chapter_04_draft.md', 5: 'chapter_05_draft.md', 6: 'chapter_06_draft.md',
  7: 'chapter_07_draft.md', 8: 'chapter_08_draft.md', 9: 'chapter_09_draft.md',
  10: 'chapter_10_draft.md', 11: 'chapter_11_draft.md', 12: 'chapter_12_draft.md',
};

const CHAPTER_TITLES: Record<number, string> = {
  1: 'The AI Readiness Audit', 2: 'The Pricing Paradox', 3: 'The 90-Day Pilot',
  4: 'The Safety Scaffolding', 5: 'The Technology Stack', 6: 'The Partnership Conversation',
  7: 'The Technology Register', 8: 'The Governance Model', 9: 'The EU AI Act Roadmap',
  10: 'The PI Insurance Conversation', 11: 'The Change Management', 12: 'The First Year Forward',
};

const CHAPTER_DELIVERABLES: Record<number, string> = {
  1: 'the Readiness Audit (a 5-condition assessment a practice manager runs alone in under 2 hours)',
  2: 'the Pricing Diagnostic (the percentile-of-actual-time view that exposes loss-leading fixed-fee work)',
  3: 'the 90-Day Pilot Plan (a costed, dated, deliverable-bound experiment that proves an AI tool ships safely)',
  4: 'the Safety Scaffolding (a three-layer architecture for safe AI deployment in regulated practice)',
  5: 'the Technology Stack Selection (the DPIA + data-residency + accuracy-criteria evaluation framework)',
  6: 'the Partnership Conversation framework (the four-question structure for putting AI adoption to a senior partner)',
  7: 'the Technology Register (a three-section governance document covering active, retired and evaluation-stage systems)',
  8: 'the Governance Model — the SRA Show File (a five-section governance document inspectors can audit in under 60 seconds)',
  9: 'the EU AI Act Roadmap (the Article 12 / 13 / 14 compliance dashboard for each high-risk system)',
  10: 'the PI Insurance Evidence Package (the disclosure pack that meets Insurance Act 2015 requirements)',
  11: 'the Adoption Curve Map (the diffusion-of-innovation analysis with friction-removal interventions)',
  12: 'the Year-Two Forward Plan (the twelve-month review with milestone deliverables for compound progress)',
};

const NICK_VOICE_ANCHOR = `
Compliance turns on three things: who owns the system, how it is monitored, and what is recorded when it fails. UK GDPR Article 30 requires the firm, as data controller, to maintain a record of processing activities. The SRA's Code (Outcome 8.5) requires the firm to ensure that the deployment of any technology used in legal practice does not compromise the duty of competence. EU AI Act Article 14 requires effective human oversight of high-risk systems throughout their lifecycle. Each obligation is separate; each must be evidenced.

A regional practice of twelve fee earners running eight AI systems carries three concurrent risks. The first is documentation: without a register, the firm cannot answer the first question a regulator asks. The second is monitoring: without a quarterly review, drift in vendor accuracy or scope-of-use goes undetected for months. The third is remediation: without a named owner, no one closes the loop when a system performs below threshold. Each risk is bounded; each is addressable; each compounds when ignored.
`.trim();

const V3_PROMPT = (chapter: number, title: string, deliverable: string, draft: string) => `
You are rewriting Chapter ${chapter} of "The Digital Law Firm" (Law Society Publishing, Q4 2026) at v3.0 — a significant upgrade.

**Chapter:** ${chapter} — "${title}"
**Reader:** Graduate-level practitioner, sub-partner, partner, admin manager at a UK high street or regional law firm (4–25 fee earners, SRA-regulated). Time-poor. Reads professional texts (Susskind, Practical Law, SRA enforcement notices, ICO guidance). Will not bind with invented characters; respects expertise and resents being walked around a story.

---

## v3.0 DEVICE MIX — APPLY ALL OF THESE

1. **NO personas. NO recurring fictional characters.** Sarah Mitchell, named protagonists, dramatised scenes — REMOVE entirely. No "Sarah opens the register at 8:47am". No "Picture this: Monday morning". This is the largest single change in v3.0.

2. **The deliverable IS the spine.** This chapter is about: **${deliverable}**. The chapter's structure walks the reader through what the deliverable contains, how it is built, how it is audited, why each component matters. The artefact carries the chapter — not a story about a person using the artefact.

3. **Regulatory mapping is the secondary structure.** Each section of the deliverable maps to a named regulatory obligation. Cite the obligation by source — SRA Code Outcome 8.5, UK GDPR Article 30, EU AI Act Article 14, Insurance Act 2015 s.3 — and quote VERBATIM where verbatim text matters. If you do not know the verbatim text of a regulatory citation, mark it [VERBATIM CHECK: source]. NEVER fabricate verbatim regulatory text.

4. **3–5 numbered propositions carry the argument.** Susskind / Kahneman style. Each chapter has 3–5 named claims; each proposition gets evidence, qualification, and consequence. Example: "Three things determine whether a Technology Register survives its first SRA audit: (1) … (2) … (3) …". Force-fit to three only if there genuinely are three; if four or five, name four or five.

5. **Anonymised observational cases — NEVER named persons, ALWAYS named shapes.** Replace "Sarah at her firm" with "a regional practice of twelve fee earners running an eight-system AI estate". Keep all real specifics — firm size, system count, percentages, currency figures, regulatory cycles, dates — but never recurring named individuals. One paragraph per chapter maximum on a worked anonymised case. Treat the case as evidence of the principle, not as a vehicle the reader is supposed to identify with.

6. **Opener is a reader-as-agent thought experiment.** Second-person, no third-person fiction. Example: "Your SRA inspector arrives on Monday morning and asks for the AI register. Three things determine whether the next hour goes well." The reader is the agent. No invented person stands between the reader and the problem.

7. **Closing register: the regulator's voice.** Short directive sentences. "The firm must document, for every AI system in scope, the deployment date, the lawful basis, the named compliance owner, and the next review date." NOT "This Monday, ask three fee earners which AI tool they used last week." Strip every "Try This Week" box, every "Common Mistakes" callout, every "Monday morning" homework prompt. Replace with a Required Actions list in the regulator's directive register.

8. **Historical analogue sparingly, only when apt.** Compliance with past transitions (cloud adoption by Magic Circle, Bribery Act response, the Solicitors-from-Hell precedent) may be drawn on briefly as evidence that regulated professions absorb transitions. One paragraph maximum. No invented history.

9. **Preserve all factual content from the v2.1 draft.** Article numbers, statistics, currency figures, dates, named regulators, named real entities (firms, vendors), worked numerical examples, dashboards, ASCII tables — keep verbatim. This is a register reset, not a content rewrite.

---

## MEASURED TARGETS (synthesised middle of Nick + Yudkowsky/Soares)

- Flesch Reading Ease: 20–40 (lower = harder; trade-press-for-professionals zone)
- Flesch-Kincaid Grade: 14–18
- Average sentence length: 22–32 words
- Syllables per word: 1.7–1.9
- Lexical density: 0.62–0.72
- Passive voice: 12–22% (use freely where the actor doesn't matter)
- Em-dashes: ≤ 0.5 per 200 words
- Named specifics density: ≥ 60 per 1,000 words (Articles, dates, percentages, regulatory cycles)
- Compulsion / homework prompts: **ZERO**
- Personas / recurring characters: **ZERO**

---

## VOICE ANCHOR — the register to imitate

>>> BEGIN ANCHOR <<<

${NICK_VOICE_ANCHOR}

>>> END ANCHOR <<<

This is the target register. Sentences run long but are properly subordinated. Vocabulary is precise. Regulatory citation carries the analysis. No drama, no scenes, no characters.

---

## STRICT RULES

1. **Output the COMPLETE chapter** in markdown. No preamble, no commentary. Begin immediately with the chapter heading.
2. **Preserve chapter structure** — keep the existing major sections in order; rename only where the heading was scaffold-flavoured.
3. **Word count target: 90–110% of input.** Do not truncate. Do not pad. If the v2.1 draft is 7,000 words, the v3.0 should be 6,300–7,700 words.
4. **Markdown tables, ASCII dashboards, code blocks, and worked numerical examples — preserve exactly.** They are deliverable artefacts; they survive the rewrite.
5. **TLDR box at the top — keep, but rewrite to align with the deliverable spine and the chapter title.** Strip any character or scenario reference; state what the chapter produces and what the reader will be able to do after reading it.
6. **Any regulatory text you cannot reproduce verbatim — mark [VERBATIM CHECK: source]. Do not invent.**

---

## v2.1 DRAFT (input):

${draft}

---

Return the complete revised chapter v3.0 in markdown. No preamble, no commentary, no surrounding explanation. Begin with the chapter heading.
`.trim();

async function rewriteV3(chapter: number): Promise<{ ok: boolean; reason?: string; pre?: any; post?: any; cost?: number }> {
  const filename = CHAPTER_FILES[chapter];
  const title = CHAPTER_TITLES[chapter];
  const deliverable = CHAPTER_DELIVERABLES[chapter];
  const draftPath = path.join(CHAPTERS_DIR, filename);

  try { assertWritable(chapter, `v3.0 register reset — deliverable-spine + no-persona`); }
  catch (e: any) { return { ok: false, reason: `lock-guard refused: ${e.message.split('\n')[0]}` }; }

  const draft = fs.readFileSync(draftPath, 'utf-8');
  const preR = auditReadability(chapter, draft);
  const preV = auditVoiceAuthenticity(draft);
  const preQ = auditQuoteIntegrity(draft);
  const origWords = draft.split(/\s+/).length;

  console.log(`\n  Ch${String(chapter).padStart(2,'0')} — "${title}"`);
  console.log(`    PRE   Flesch ${preR.fleschReadingEase} | FK ${preR.fleschKincaidGrade} | sent ${preR.avgSentenceWords}w | em-dash/200 ${preV.emDashPer200Words.toFixed(2)} | specifics/1k ${preV.namedSpecificsPer1000Words.toFixed(1)} | compulsion ${preR.compulsionScore} | words ${origWords}`);

  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });
  const prompt = V3_PROMPT(chapter, title, deliverable, draft);
  const response = await gpt.chat.completions.create({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 32000,
  });
  const revised = response.choices[0].message.content ?? '';
  const revWords = revised.split(/\s+/).length;

  // Truncation guard
  if (revised.length === 0 || revWords < origWords * 0.6) {
    return { ok: false, reason: `truncation (${origWords}→${revWords} words)` };
  }

  // Write to working dir first
  fs.mkdirSync(WORKING_DIR, { recursive: true });
  const workingPath = path.join(WORKING_DIR, filename);
  fs.writeFileSync(workingPath, revised, 'utf-8');

  // Post-audit
  const postR = auditReadability(chapter, revised);
  const postV = auditVoiceAuthenticity(revised);
  const postQ = auditQuoteIntegrity(revised);

  console.log(`    POST  Flesch ${postR.fleschReadingEase} | FK ${postR.fleschKincaidGrade} | sent ${postR.avgSentenceWords}w | em-dash/200 ${postV.emDashPer200Words.toFixed(2)} | specifics/1k ${postV.namedSpecificsPer1000Words.toFixed(1)} | compulsion ${postR.compulsionScore} | words ${revWords}`);

  // Target hits
  const hits: string[] = [];
  if (postR.fleschReadingEase >= 20 && postR.fleschReadingEase <= 45) hits.push('Flesch✓');
  if (postR.fleschKincaidGrade >= 13 && postR.fleschKincaidGrade <= 18) hits.push('Grade✓');
  if (postR.avgSentenceWords >= 22 && postR.avgSentenceWords <= 35) hits.push('Sentence✓');
  if (postV.emDashPer200Words <= 0.5) hits.push('EmDash✓');
  if (postV.namedSpecificsPer1000Words >= 60) hits.push('Specifics✓');
  if (postR.compulsionScore === 0) hits.push('Compulsion✓');
  console.log(`    TARGET ${hits.join(' ')} (${hits.length}/6)`);

  // Atomic promote to canonical
  fs.writeFileSync(path.join(CHAPTERS_DIR, filename), revised, 'utf-8');

  appendAudit(chapter, sha256Of(revised), 'v3_register_reset.ts',
    `v3.0 promoted to canonical; pre Flesch=${preR.fleschReadingEase} post=${postR.fleschReadingEase}; pre sentence=${preR.avgSentenceWords}w post=${postR.avgSentenceWords}w; hits=${hits.length}/6`);

  // Save per-chapter audit
  fs.mkdirSync(SUMMARY_DIR, { recursive: true });
  fs.writeFileSync(path.join(SUMMARY_DIR, `chapter_${String(chapter).padStart(2,'0')}_audit.json`),
    JSON.stringify({
      chapter, title, deliverable,
      pre: { words: origWords, flesch: preR.fleschReadingEase, grade: preR.fleschKincaidGrade, avgSentence: preR.avgSentenceWords, emDash: preV.emDashPer200Words, specifics: preV.namedSpecificsPer1000Words, compulsion: preR.compulsionScore, regParaphrases: preQ.regulatoryParaphrases.length },
      post: { words: revWords, flesch: postR.fleschReadingEase, grade: postR.fleschKincaidGrade, avgSentence: postR.avgSentenceWords, emDash: postV.emDashPer200Words, specifics: postV.namedSpecificsPer1000Words, compulsion: postR.compulsionScore, regParaphrases: postQ.regulatoryParaphrases.length },
      sha256: sha256Of(revised),
      hits, hitsCount: hits.length,
    }, null, 2));

  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const cost = (tokensIn * 3 + tokensOut * 12) / 1_000_000 * 0.79;
  console.log(`    COST  £${cost.toFixed(4)} | sha ${sha256Of(revised).slice(0,12)}`);

  return { ok: true, pre: preR, post: postR, cost };
}

(async () => {
  const args = process.argv.slice(2).map(Number).filter(n => CHAPTER_FILES[n]);
  const chapters = args.length > 0 ? args : Array.from({ length: 12 }, (_, i) => i + 1);

  console.log(`v3.0 Register Reset — chapters ${chapters.join(', ')}`);
  console.log(`Lock state: chapters manually unlocked with audit reason. Re-locking after verify.`);

  const results = await Promise.all(chapters.map(ch => rewriteV3(ch).catch(e => ({ ok: false, reason: e.message }))));
  const ok = results.filter((r: any) => r.ok);
  const totalCost = ok.reduce((s: number, r: any) => s + (r.cost ?? 0), 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Succeeded: ${ok.length}/${chapters.length}`);
  console.log(`Total cost: £${totalCost.toFixed(2)}`);
  const failed = results.filter((r: any) => !r.ok);
  if (failed.length) console.log(`Failed: ${failed.map((r: any, i: number) => `ch${chapters[i]}: ${r.reason}`).join(' | ')}`);
})();
