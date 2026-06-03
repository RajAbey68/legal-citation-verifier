#!/usr/bin/env npx tsx
/**
 * Nick Persona Rewrite
 * =====================
 * One-shot rewriter that re-renders a chapter in Nick Lockett's measured
 * voice. The target metrics are derived from his actual writing samples
 * (calibration/nick_voice_samples/), not from frequency analysis of prior
 * chapter drafts. Voice anchors (~900 words of his real prose) ride in
 * the prompt so the model has concrete texture to imitate.
 *
 * Output: chapters/reviews/nick_persona_2026-05-14/chapter_NN_nick_persona.md
 * (a clearly-marked LLM review draft — NOT a canonical chapter file).
 *
 * Lock-guard: invoked. Requires LOCK_GUARD_OVERRIDE because target chapters
 * are at v2.1 locked. Audit log entry per chapter.
 *
 * Cost: ~£0.30 per chapter on gpt-5.1. Run as:
 *   LOCK_GUARD_OVERRIDE=I-have-read-the-lock-protocol npx tsx scripts/nick_persona_rewrite.ts 7 8 9
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import OpenAI from 'openai';
import { auditReadability } from '../lib/ghostwriter/stages/readability';
import { auditVoiceAuthenticity } from '../lib/ghostwriter/stages/voice_authenticity';
import { assertWritable, LockError, sha256Of, appendAudit } from '../lib/ghostwriter/lock_guard';

const BOOK_REPO = '/Users/arajiv/code/The-Digital-Law-Firm';
const CHAPTERS_DIR = path.join(BOOK_REPO, 'chapters', 'drafts');
const OUTPUT_DIR = path.join(BOOK_REPO, 'chapters', 'reviews', 'nick_persona_2026-05-14');
const VOICE_ANCHORS_PATH = '/tmp/nick_voice_anchors.txt';

const CHAPTER_FILES: Record<number, string> = {
  7: 'chapter_07_draft.md',
  8: 'chapter_08_draft.md',
  9: 'chapter_09_draft.md',
};

const CHAPTER_TITLES: Record<number, string> = {
  7: 'The Technology Register',
  8: 'The Governance Model',
  9: 'The EU AI Act Roadmap',
};

const NICK_PERSONA_PROMPT = (chapter: number, title: string, anchors: string, draft: string) => `
You are rewriting Chapter ${chapter} of "The Digital Law Firm" (Law Society Publishing, Q4 2026) in the measured voice of one of its co-authors, Nick Lockett. Nick is the named author of Chapters 7, 8 and 9. The current draft was produced by a pipeline that flattened his voice toward consumer self-help. Your job is to restore the register.

**Chapter:** ${chapter} — "${title}"

---

## NICK'S MEASURED VOICE — TARGETS

These targets are derived from two of his own published documents (Insight into AI Safeguards and Guardrails; Insight into EU AI Codes). Aim for them; do not exceed them in either direction.

- Flesch Reading Ease: 0–10
- Flesch-Kincaid Grade: 20–28
- Average sentence length: 30–45 words
- Syllables per word: ~1.9–2.0
- Lexical density: 0.65–0.72
- Passive voice: 15–25% of sentences (use freely where the actor does not matter)
- Em-dashes: ≤ 0.25 per 200 words (almost never; semicolons and colons do the rhetorical work)
- Named specifics density: ≥ 75 per 1,000 words (Articles, cases, percentages, dates, named regulators)
- Compulsion / "Monday morning" homework prompts: ZERO. Strip every "Try this week", "Ask three fee earners", "This Monday".

## NICK'S VOICE — STRUCTURAL FEATURES

1. **Long, properly subordinated sentences.** Hypothesis → qualification → consequence. The reader is trusted to hold a 35-word sentence and follow its logic.
2. **Latinate, polysyllabic vocabulary used precisely.** Not decoratively. "Compliance" not "following the rules". "Obligation" not "duty". "Practitioner" not "lawyer" where the legal register matters.
3. **Passive voice where the actor does not matter.** "The register must be reviewed quarterly." "Records shall be kept." This is the legal-regulatory register, not a flaw.
4. **Semicolons and colons carry the rhetorical work; em-dashes almost never.** Where the current draft uses " — ", convert most to full stops, some to colons, some to semicolons, almost none preserved.
5. **No narrative spine.** No "Sarah Mitchell at 8:47am". No scenes. If a worked example is needed, present it as: "Consider a firm of 12 fee earners that has deployed ChatGPT Team. The firm's obligations include..." — observational, not dramatised.
6. **No reader-coaching.** Strip "Try This Week" boxes, "Common Mistakes" boxes, "Monday-morning closes". Replace with declarative analysis: "The implementation involves three obligations…" not "This Monday, ask three fee earners…".
7. **No glossing of well-known tools.** Do not define ChatGPT, Copilot, Claude, SRA, EU AI Act, GDPR, PI insurance. Nick's reader knows these.
8. **Named specifics are the evidence.** Article 12. Section 3.3. £4,200. November 2026. Bermuda. Nick does not generalise; he cites and qualifies.
9. **Claim-first paragraphs.** Open with the proposition; the rest of the paragraph supports or qualifies it. Do not lead with a scene.

## VOICE ANCHORS — NICK'S OWN PROSE

Study these passages. The cadence, vocabulary, sentence shape, and passive use are the target. Do not quote them; imitate them.

>>> BEGIN NICK ANCHORS <<<

${anchors}

>>> END NICK ANCHORS <<<

---

## STRICT RULES — DO NOT VIOLATE

1. **Do NOT change any factual claim, statistic, citation, or named entity.** Article numbers, percentages, currency figures, dates, case references, firm names — preserve verbatim.
2. **Do NOT change SRA, EU AI Act, UK GDPR, or any regulatory reference.** Where the current draft paraphrases a regulation, leave the paraphrase but flag it inline as "[VERBATIM CHECK: SRA Code Outcome 8.5]" so a verbatim pass can replace it.
3. **Do NOT remove a TLDR box, Try This Week box, Common Mistakes box, or Forward Bridge.** Replace each with a "Decision Frame" paragraph in Nick's register. Example: where a "Try This Week" box says "This Monday, ask three fee earners which AI tool they used last week," replace with "The audit must establish, for each fee earner, the AI tools used and the corresponding compliance position."
4. **Preserve all tables, ASCII art, and code/dashboard blocks exactly.**
5. **Preserve chapter structure, headings, and section order.** Do not renumber.
6. **Do NOT add new content not in the draft.** This is a register reset, not a rewrite for facts.
7. **Output the complete revised chapter.** No preamble. No commentary. Markdown only.

---

## CHAPTER ${chapter} DRAFT (current v2.1 — register needs reset):

${draft}

---

Return the complete revised chapter in markdown. No preamble. No commentary. Begin immediately with the chapter title heading.
`.trim();

async function rewriteAsNick(chapter: number): Promise<void> {
  const filename = CHAPTER_FILES[chapter];
  const title = CHAPTER_TITLES[chapter];
  const draftPath = path.join(CHAPTERS_DIR, filename);

  // Lock-guard — explicit override required (book repo chapters are at v2.1 locked).
  try {
    assertWritable(chapter, `Nick Persona rewrite (review-draft to chapters/reviews/, not canonical)`);
  } catch (err) {
    if (err instanceof LockError) {
      console.log(`  Ch${chapter} → 🔒 ${err.message.split('\n')[0]}`);
      return;
    }
    throw err;
  }

  const draft = fs.readFileSync(draftPath, 'utf-8');
  const anchors = fs.readFileSync(VOICE_ANCHORS_PATH, 'utf-8');

  // Pre-audit for the report
  const preR = auditReadability(chapter, draft);
  const preV = auditVoiceAuthenticity(draft);

  console.log(`\n  Ch${String(chapter).padStart(2, '0')} — "${title}"`);
  console.log(`    Pre:  Flesch ${preR.fleschReadingEase} | FK ${preR.fleschKincaidGrade} | avg ${preR.avgSentenceWords}w | EmDash/200 ${preV.emDashPer200Words.toFixed(2)} | specifics/1k ${preV.namedSpecificsPer1000Words.toFixed(1)} | compulsion ${preR.compulsionScore}`);

  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });
  const prompt = NICK_PERSONA_PROMPT(chapter, title, anchors, draft);

  const response = await gpt.chat.completions.create({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 32000,
  });

  const revised = response.choices[0].message.content ?? '';
  const origWords = draft.split(/\s+/).length;
  const revWords = revised.split(/\s+/).length;
  if (revised.length === 0 || revWords < origWords * 0.6) {
    console.log(`    ⚠️  Truncation detected (${origWords}→${revWords} words). Skipping write.`);
    return;
  }

  // Post-audit
  const postR = auditReadability(chapter, revised);
  const postV = auditVoiceAuthenticity(revised);
  console.log(`    Post: Flesch ${postR.fleschReadingEase} | FK ${postR.fleschKincaidGrade} | avg ${postR.avgSentenceWords}w | EmDash/200 ${postV.emDashPer200Words.toFixed(2)} | specifics/1k ${postV.namedSpecificsPer1000Words.toFixed(1)} | compulsion ${postR.compulsionScore}`);

  // Hit-the-target diagnostic
  const onTarget: string[] = [];
  if (postR.fleschReadingEase <= 15) onTarget.push('Flesch✓');
  if (postR.fleschKincaidGrade >= 18) onTarget.push('Grade✓');
  if (postR.avgSentenceWords >= 25) onTarget.push('Sentence✓');
  if (postV.emDashPer200Words <= 0.5) onTarget.push('EmDash✓');
  if (postV.namedSpecificsPer1000Words >= 60) onTarget.push('Specifics✓');
  if (postR.compulsionScore === 0) onTarget.push('Compulsion✓');
  console.log(`    Target hits: ${onTarget.join(' ')} (${onTarget.length}/6)`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `chapter_${String(chapter).padStart(2,'0')}_nick_persona.md`);
  fs.writeFileSync(outPath, revised, 'utf-8');

  appendAudit(chapter, sha256Of(revised), 'nick_persona_rewrite.ts',
    `Nick Persona LLM rewrite to ${outPath} (override=yes, review-only, not canonical)`);

  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const cost = (tokensIn * 3 + tokensOut * 12) / 1_000_000 * 0.79;
  console.log(`    Cost: £${cost.toFixed(4)} | Wrote ${outPath}`);

  // Save audit numbers for the package step
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `chapter_${String(chapter).padStart(2,'0')}_audit.json`),
    JSON.stringify({ chapter, title, pre: { flesch: preR.fleschReadingEase, grade: preR.fleschKincaidGrade, avgSentence: preR.avgSentenceWords, emDash: preV.emDashPer200Words, specifics: preV.namedSpecificsPer1000Words, compulsion: preR.compulsionScore, passive: preR.passiveVoiceRatio, words: origWords }, post: { flesch: postR.fleschReadingEase, grade: postR.fleschKincaidGrade, avgSentence: postR.avgSentenceWords, emDash: postV.emDashPer200Words, specifics: postV.namedSpecificsPer1000Words, compulsion: postR.compulsionScore, passive: postR.passiveVoiceRatio, words: revWords }, onTarget }, null, 2)
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).map(Number).filter(n => CHAPTER_FILES[n]);
const chapters = args.length > 0 ? args : [7, 8, 9];

console.log('Nick Persona Rewrite — chapters', chapters.join(', '));
console.log(`Override active: ${process.env.LOCK_GUARD_OVERRIDE ? 'YES' : 'NO'}`);
console.log(`Output: ${OUTPUT_DIR}`);

(async () => {
  await Promise.all(chapters.map(ch => rewriteAsNick(ch)));
  console.log('\nDone.');
})();
