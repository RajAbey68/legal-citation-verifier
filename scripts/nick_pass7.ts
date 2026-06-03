/**
 * Pass 7 — Nick Lockett surgical fixes
 * Ch09: ASL=23 (sentence splitting) | Ch07: ASW=1.57 (deep syllable reduction)
 * Reads _readable.md, writes back in place.
 */
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { auditReadability } from '../lib/ghostwriter/stages/readability';

dotenv.config({ path: '.env.local' });

const CHAPTERS_DIR = '/Users/arajiv/Downloads/Digital_Law_Firm_Chapters';
const DRIVE_DIR = `${process.env.HOME}/Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review`;

const FILES: Record<number, string> = {
  7: 'chapter_07_the_technology_register_readable.md',
  8: 'chapter_08_the_governance_model_readable.md',
  9: 'chapter_09_the_eu_ai_act_roadmap_readable.md',
};

// Ch09 problem: ASL=23. Every sentence over 20 words must be split.
const SPLIT_PROMPT = (draft: string) => `
You are a sentence-splitting editor. The text below has an average sentence length of 23 words. The target is ≤ 15 words average.

## YOUR ONLY JOB
Split long sentences. Do not change meaning. Do not change words unless splitting requires it.

## HOW TO SPLIT
When a sentence is over 18 words, split it at the FIRST available break point:
- At a conjunction: "and", "but", "so", "yet", "because", "which", "that", "when", "where", "if", "although"
- At a relative clause: ", which...", ", that...", ", where..."
- At a participial phrase: ", making...", ", providing...", ", requiring..."

## EXAMPLES

BEFORE (28 words):
"AI systems that produce a document for a client must be assessed for accuracy and jurisdiction before any fee earner sends it, even in draft form."

AFTER:
"AI systems that produce a client document must be assessed first. Check accuracy and jurisdiction before any fee earner sends it — even in draft form."

BEFORE (22 words):
"The register should record the name of the AI tool, the tasks it performs, and the risk classification assigned to each."

AFTER:
"The register records three things for each AI tool. First: the name of the tool. Second: the tasks it performs. Third: its risk classification."

## RULES
- Every sentence over 20 words must be split.
- Never use semicolons to join halves — use a full stop.
- Short sentences (under 12 words) are perfect. Do not touch them.
- Keep all regulatory references verbatim: "SRA Code 3.3", "UK GDPR Article 28", "EU AI Act Article 14".
- Do not add facts. Do not remove facts. Splitting only.
- Rhythm: after every 3 sentences, write one under 6 words. ("That is the rule." / "Start there." / "No exceptions.")

## TEXT TO SPLIT:
${draft}

Return the complete revised text. No preamble. No commentary. Text only.
`.trim();

// Ch07 problem: ASW=1.57. Need to dig deeper into vocabulary.
const SYLLABLE_PROMPT = (draft: string) => `
You are a plain-English vocabulary editor. The text below still scores ASW=1.57 (too many multi-syllable words). The target is ASW ≤ 1.32.

## YOUR ONLY JOB
Replace polysyllabic words with shorter synonyms. Do not change sentence structure.

## DEEP REPLACEMENT LIST (beyond the basic swaps already done)
- register → log, list, record
- establish → set up, create, build, start
- assessment → check, review, test, look
- additional → extra, more, added
- available → on hand, ready, open
- application → app, tool, use, programme
- operation → running, work, use
- professional → expert, skilled, trained (vary)
- understand → see, know, grasp, follow
- consider → think about, weigh, look at
- different → other, new, varied (by context)
- provide → give, offer, supply
- activity → task, work, action
- approach → way, method, plan, angle
- specific → exact, clear, set
- identify → find, spot, name, flag
- process → steps, method, way, how-to
- determine → decide, work out, find
- particular → exact, set, named, one
- effective → that works, useful, strong
- acceptable → allowed, fine, within rules
- authorised → approved, signed off, cleared
- significant → big, major, key, important
- indicator → sign, marker, signal, flag
- established → set up, in place, running
- generally → mostly, often, usually, as a rule
- frequently → often, regularly
- occasionally → sometimes, now and then
- necessary → needed, required, must-have
- information → facts, data, details, records
- appropriate → right, correct, proper, fitting
- implement → put in place, run, set up, start
- individual → person, each, one, named
- circumstances → case, situation, facts
- responsibilities → duties, jobs, tasks, role
- communicate → tell, share, send, say
- facilitate → help, support, enable, allow
- evaluation → review, check, test, score
- qualification → skill, training, cert (by context)
- capability → ability, skill, power
- efficiently → well, quickly, cleanly
- contractual → in the contract, agreed
- obligation → duty, rule, must-do, commitment
- organisation → firm, practice, team
- automatically → by itself, on its own
- systematically → step by step, in order
- characteristic → trait, feature, quality

## CRITICAL RULES
- Every regulatory citation stays verbatim: "SRA Code 3.3", "UK GDPR Article 28", "EU AI Act Article 14"
- Every statistic and number stays verbatim
- Author name references stay verbatim
- Do not add or remove sentences
- Vary synonyms — do not repeat the same swap word in adjacent sentences
- If no good short synonym exists, leave the word unchanged

## TEXT TO EDIT:
${draft}

Return the complete revised text. No preamble. No commentary. Text only.
`.trim();

// Ch08 problem: ASL=16.6 borderline + ASW=1.47. Both need nudging.
const BOTH_PROMPT = (draft: string) => `
You are a plain-English editor making two targeted changes. The text scores ASL=16.6 and ASW=1.47. Targets: ASL ≤ 14, ASW ≤ 1.35.

## CHANGE 1 — Split any sentence over 18 words
At the first conjunction (and, but, so, because, which, that, when, if). Use a full stop, not a semicolon.

## CHANGE 2 — Replace polysyllabic words
- governance → rules, controls, oversight
- monitoring → tracking, watching, checking
- transparency → openness, visibility
- accountability → who is responsible, named owner
- responsibility → duty, ownership, role
- implementation → putting in place, running
- documentation → records, paperwork, written trail
- assessment → check, review, test
- identified → found, spotted, flagged, named
- authority → power, right, control
- function → job, role, task, work
- additional → extra, more, added
- classification → type, category, label, risk level
- structure → shape, setup, layout
- determine → decide, work out, find
- establish → set up, build, create
- consider → think about, weigh, look at
- organisation → firm, practice, team
- operational → in day-to-day use, running, active
- regulatory → SRA's, the rules', under the rules

Keep all citations, statistics, and scene details verbatim. Do not add facts.

After every 3 sentences, write one of ≤ 5 words. Examples: "That is the point." / "Start there." / "Own the outcome."

## TEXT TO EDIT:
${draft}

Return the complete revised text. No preamble. No commentary. Text only.
`.trim();

const PROMPTS: Record<number, (d: string) => string> = {
  7: SYLLABLE_PROMPT,
  8: BOTH_PROMPT,
  9: SPLIT_PROMPT,
};

async function run() {
  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });
  const chapters = [7, 8, 9];

  console.log('\n✂️  Nick Pass 7 — Surgical fixes');
  console.log('   Ch07: deep syllable reduction | Ch08: both | Ch09: sentence splitting\n');

  await Promise.all(chapters.map(async (ch) => {
    const file = FILES[ch];
    const filePath = path.join(CHAPTERS_DIR, file);
    const draft = fs.readFileSync(filePath, 'utf-8');
    const preAudit = auditReadability(ch, draft);

    console.log(`  Ch${ch} → Before: Flesch ${preAudit.fleschReadingEase} | ASL=${preAudit.avgSentenceWords} | Grade=${preAudit.fleschKincaidGrade}`);

    const prompt = PROMPTS[ch](draft);
    const response = await gpt.chat.completions.create({
      model: 'gpt-5.1',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 32000,
    });

    const revised = response.choices[0].message.content ?? '';
    const origWords = draft.split(/\s+/).length;
    const revWords = revised.split(/\s+/).length;

    if (revised.length === 0 || revWords < origWords * 0.80) {
      console.log(`  Ch${ch} → ⚠️  Truncation (${origWords}→${revWords}). Skipping.`);
      return;
    }

    const postAudit = auditReadability(ch, revised);
    const improved = postAudit.fleschReadingEase > preAudit.fleschReadingEase;

    console.log(`  Ch${ch} → After:  Flesch ${postAudit.fleschReadingEase} | ASL=${postAudit.avgSentenceWords} | Grade=${postAudit.fleschKincaidGrade} ${improved ? '✅' : '⚠️ '}`);

    const tokensIn = response.usage?.prompt_tokens ?? 0;
    const tokensOut = response.usage?.completion_tokens ?? 0;
    const cost = (tokensIn * 3 + tokensOut * 12) / 1_000_000 * 0.79;
    console.log(`  Ch${ch} → Cost: £${cost.toFixed(4)}`);

    // Only save if improved
    if (improved) {
      fs.writeFileSync(filePath, revised, 'utf-8');
      if (fs.existsSync(DRIVE_DIR)) {
        const pad = String(ch).padStart(2, '0');
        fs.writeFileSync(path.join(DRIVE_DIR, `chapter_${pad}_readable.md`), revised, 'utf-8');
      }
      console.log(`  Ch${ch} → Saved to Drive ✅`);
    } else {
      console.log(`  Ch${ch} → Not saved (no improvement)`);
    }
  }));

  console.log('\n✅ Pass 7 complete.\n');
}

run().catch(console.error);
