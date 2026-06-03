#!/usr/bin/env npx tsx
/**
 * Readability Rewrite Pass
 * ========================
 * Targeted plain-English rewrite. Does NOT touch content, citations, or
 * regulatory language — only delivery: sentence length, active voice,
 * jargon, and compulsion to act.
 *
 * Produces a _readable.md alongside the original for author comparison.
 * Authors approve, reject, or merge changes — this is a first draft aid,
 * not a final edit.
 *
 * Usage:
 *   npx tsx scripts/readability_rewrite.ts          # all chapters
 *   npx tsx scripts/readability_rewrite.ts 7 8 9   # Nick's chapters first
 *
 * Cost: ~£0.15–0.25 per chapter (one gpt-5.1 call)
 * Time: ~60–90s per chapter
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import OpenAI from 'openai';
import { auditReadability } from '../lib/ghostwriter/stages/readability';
import { KILL_LIST, CHARACTER_PROFILES, RISK5_FIXES } from '../lib/ghostwriter/prompts';
import { assertWritable, LockError, sha256Of, appendAudit } from '../lib/ghostwriter/lock_guard';

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

// Author-specific polysyllabic word profiles — derived from frequency analysis of each author's chapters
const AUTHOR_WORD_PROFILES: Record<string, { polyPct: string; topWords: string; swaps: string }> = {
  'Rajiv Abeysinghe': {
    polyPct: '27.2%',
    topWords: 'governance, transparency, documentation, practitioner, oversight, deployment, framework, escalation, commodity, accuracy, documented, amendment, renewal',
    swaps: `- governance → rules, controls (use 'governance' only for regulatory context)
- transparency → openness, being open
- documentation → records, paperwork, your paper trail
- documented → recorded, written down, on paper
- practitioner → solicitor, lawyer, fee earner
- deployment → rollout, going live, putting it to work
- framework → plan, structure, approach
- escalation → flagging it, raising it, calling it out
- commodity → product, service, off-the-shelf tool
- accuracy → getting it right, reliable, trustworthy
- amendment → change, update
- oversight → review, check, sign-off`
  },
  'Darren': {
    polyPct: '25.9%',
    topWords: 'adoption, scenario, management, capacity, fictional, majority, deployment, methodology, efficiency, practitioner, governance, partnership, documentation',
    swaps: `- adoption → uptake, use, taking it on
- scenario → case, situation, example, picture this
- management → running, handling, leading
- capacity → room, ability, headroom, bandwidth → time
- fictional → made-up, invented, not real
- majority → most
- deployment → rollout, use, putting it in place
- methodology → method, approach, way of working
- efficiency → speed, output, doing more with less
- practitioner → solicitor, lawyer, fee earner
- partnership → working with, your supplier, your vendor
- documentation → records, paperwork`
  },
  'Nick Lockett': {
    polyPct: '30.2%',
    topWords: 'governance, register, technology, oversight, transparency, monitoring, classification, accuracy, quarterly, competence, inspection, protocol, ownership',
    swaps: `- governance → rules, controls, oversight (vary; avoid repeating)
- technology → tool, system, AI tool, software
- oversight → check, review, sign-off, supervision
- transparency → openness, visibility, being clear
- monitoring → tracking, watching, checking
- classification → type, category, risk level
- accuracy → getting it right, reliable output, trustworthy
- quarterly → every three months
- competence → skill, ability, know-how
- inspection → check, audit, review
- protocol → rule, procedure, step
- ownership → who owns it, who is responsible
- register → log, list, record (vary to avoid repetition)`
  },
  'Rajiv Abeysinghe / Sushila': {
    polyPct: '26.2%',
    topWords: 'criteria, criterion, documented, evaluation, integration, residency, reliability, mechanism, deployment, processing',
    swaps: `- criteria → requirements, what to look for, tests
- criterion → requirement, test, measure
- documented → recorded, written down, on paper
- evaluation → review, assessment, scoring
- integration → connecting, linking, plugging in
- residency → where data lives, data location, UK-based
- reliability → how well it works, consistency, dependability
- mechanism → way, method, how it works
- deployment → rollout, going live
- processing → handling, running, working through`
  },
};

const READABILITY_PROMPT = (chapter: number, author: string, draft: string, blockers: string[], warnings: string[], hardParas: string) => {
  const profile = AUTHOR_WORD_PROFILES[author] ?? AUTHOR_WORD_PROFILES['Darren'];
  return `
You are a plain English editor preparing Chapter ${chapter} of "The Digital Law Firm" (Law Society Publishing, Q4 2026) for its first author review draft.

**Author:** ${author}
**Target reader:** A practice manager or senior partner at a UK high street or regional law firm. 4–25 fee earners, SRA-regulated. Time-poor, change-sceptical, accountable for outcomes. They are reading this book because they feel pressure to act on AI — not because they find AI interesting.

**The book's mission:** To encourage, guide, and compel law firm leaders to adopt AI in a compliant manner. This is not a technology book. It is a book about professional confidence in the face of change. Every chapter must leave the reader with one clear action they can take before their next meeting — alone, without budget approval, in under two hours.

---

YOUR TASK — Compelling Professional Writing Edit:

Rewrite the chapter for clarity, compulsion, and emotional resonance. You are editing delivery, NOT content.

STRICT RULES:
1. Do NOT change any factual claims, statistics, or cited figures
2. Do NOT change regulatory language, SRA references, or legal caveats
3. Do NOT remove or alter any TLDR boxes, Try This Week boxes, Common Mistakes boxes, Two-Path boxes, or Forward Bridge paragraphs
4. Do NOT add new content, scenarios, or recommendations not already in the draft
5. Do NOT change chapter structure, headings, or section order
6. Preserve all ASCII art, tables, and flowcharts exactly

---

THE 10 PRINCIPLES OF COMPELLING PROFESSIONAL WRITING — apply all of these:

**1. LOSS FRAME BEFORE GAIN FRAME**
People act on fear of loss twice as readily as hope of gain. Every risk section should name what the reader stands to lose — their professional reputation, a client relationship, regulatory standing — before offering the solution. "Firms that don't document their AI use face SRA scrutiny" lands harder than "Documenting AI use builds client trust."
Failure mode: Selling benefits while burying the risk. The reader agrees but doesn't move.

**2. CONCRETE SENSORY SPECIFICITY**
Replace abstract claims with scenes the reader can picture. Not "AI improves document review" but "When you upload a client file without stripping metadata, the vendor's model trains on your client's strategy. You can't undo that." Numbers, names, times, and specific documents — not "outcomes" and "value."
Failure mode: Principles without pictures. The reader understands but cannot simulate what to do.

**3. ESTABLISH THE DEFAULT — WHERE THEY ARE NOW**
Name the reader's current reality before describing what needs to change. "Right now, three of your fee earners are using ChatGPT for client work. No policy. No audit trail. No consent." Make the status quo visible. Only then introduce the gap.
Failure mode: Jumping to "you should" before acknowledging "you are." Reader feels lectured, not understood.

**4. PEER AUTHORITY — NOT TOP-DOWN**
This reader trusts a fellow practice manager more than a consultant or regulator. Write as a peer who has already navigated this at their own firm. "Here's what we did first" carries more weight than "firms should consider." Where the draft is authoritative in tone, soften it to peer-level — "what worked for us", "what we'd do differently."
Failure mode: Regulatory or consultant framing. Reader suspects an agenda and disengages.

**5. NARRATIVE AS FLIGHT SIMULATOR**
Every scenario in the draft exists to rehearse the reader for a real decision. Make the rehearsal vivid. Show the exact moment of choice: "Monday morning. A solicitor drafts a contract. She pastes the client's instructions directly into Claude. What must happen next?" The reader should recognise this as a scene they will face — not a case study they are observing.
Failure mode: Abstract bullet-point guidance without a scene. Reader knows what to do but not when or how.

**6. CREDIBILITY THROUGH HONEST LIMITS**
Trust is built by acknowledging what is not yet known. "The SRA has not yet issued definitive guidance on this. Here is what we know from their published statements, and here is what remains unresolved." Overstating certainty triggers the sceptic. Naming the limits builds it.
Failure mode: False confidence. One overstatement and the sceptical reader dismisses the whole chapter.

**7. SIMPLICITY THROUGH ELIMINATION, NOT DUMBING DOWN**
Remove everything that does not help the reader act. If a paragraph cannot be connected to a decision the reader will face this month, cut or compress it. This reader is intelligent and time-poor — they resent padding, not complexity. One clear decision tree beats a comprehensive framework.
Failure mode: Comprehensive coverage. Reader cannot find what applies to them and shelves the book.

**8. VIOLATED EXPECTATIONS — OPEN AGAINST THE OBVIOUS**
Each major section should open with a sentence the reader did not expect. "The biggest AI risk in your firm is probably not ChatGPT" or "Your receptionist may already be your highest-risk AI user." The gap between expectation and reality creates curiosity. The reader reads on.
Failure mode: Opening with the predictable statement. "AI is transforming the legal sector." Reader stops paying attention before the chapter has started.

**9. ONE SPECIFIC FIRST ACTION — NOT A ROADMAP**
Every chapter and every major section must close with one action the reader can take alone, without budget, before their next meeting. Not "develop a governance framework" — but "This Thursday: ask three fee earners to show you the last AI tool they used. Write down the answer. That is your starting inventory." Small commitment primes larger ones. Overwhelming roadmaps produce nothing.
Failure mode: "You should now implement a comprehensive AI policy." Reader agrees, does nothing.

**10. INDIVIDUAL EMOTIONAL STAKES — NOT AGGREGATE RISK**
"Firms face reputational damage" means nothing to someone who has run a firm for 20 years. "You are on a call with your best client. They have just read that their matter file was used to train a public AI model. They are asking how. You don't have an answer." Individual, specific, and personal. Statistics describe; scenarios move.
Failure mode: Aggregate risk language. Reader accepts it intellectually and takes no action.

**11. WITNESS, NOT ADVOCATE — EARNED CONVICTION**
The reader must arrive at urgency themselves. Write as someone who has observed what is happening at real firms — not as someone trying to persuade. Report what early movers are experiencing. Report what firms that waited are losing. Place the evidence in front of the reader and trust them to draw the conclusion. The moment the writing feels like it is pushing adoption, the sceptical practice manager disengages — not because they disagree, but because they distrust the motive. The moment they reach the conclusion from evidence you gave them, they own it. That ownership is what produces action. The question every paragraph should answer is not "why should they adopt AI?" but "what is already happening to the firms that haven't?"
Failure mode: Advocacy and exhortation. "Firms must embrace AI." Reader agrees and moves on. No urgency. No action.

**THE CONSEQUENCE OF NOT ACTING — make this visible in every chapter:**
Every chapter must answer, explicitly or through scene, the question: "What happens to the practice manager who reads this chapter and does nothing?" Not as a threat. As a fact. Three things are already happening to firms that are not moving: their costs are not falling while competitors' are; their clients are beginning to ask questions they cannot answer; their regulatory exposure is growing as AI becomes the expected standard of care. Name these. Show them. Let the reader feel the gap between where they are and where they need to be — and then give them the first step across it.

---

---

FLESCH READING EASE — TECHNICAL TARGETS (this author scores ${profile.polyPct} polysyllabic words; target is ≤ 20%):

The Flesch formula: 206.835 − 1.015 × (avg sentence length) − 84.6 × (avg syllables/word)
The syllable lever is 83× more powerful than the sentence-length lever.
Replacing one 3-syllable word with a 1-syllable word across 100 uses = approximately +8 Flesch points.

THIS AUTHOR'S HIGH-FREQUENCY POLYSYLLABIC WORDS — replace these specifically:
${profile.topWords}

WORD-BY-WORD SUBSTITUTION TABLE — apply throughout:
${profile.swaps}

ADDITIONAL UNIVERSAL SWAPS (apply to all authors):
- utilise → use
- implement → put in place, set up, run
- ensure → make sure, check, confirm
- provide → give, offer, share
- significant → major, large, big, real
- facilitate → help, enable, allow
- regarding → about, on
- approximately → about, around, roughly
- additional → more, extra, another
- however → but
- therefore → so
- subsequently → then, next, after that
- individuals → people, staff, fee earners
- organisations → firms, businesses
- requirements → needs, rules, what you need
- capabilities → skills, what it can do
- opportunities → chances, openings
- challenges → problems, hurdles
- considerations → things to think about
- implications → what it means, the effect

SENTENCE AND VOICE RULES:
- Target average sentence length ≤ 16 words (not 20 — 16 is the sweet spot for Flesch 60+).
- Break any sentence over 22 words into two, always.
- Active voice throughout. "The policy must be reviewed" → "Review the policy."
- Direct "you" address — not "firms should" or "practitioners may."
- Imperatives for actions: "Start with...", "Ask...", "Check...", "Book..."
- After every 3 long sentences, write one short one (under 10 words). This resets the reader.
- Boardroom persuasion arc for any risk section: external data → measurement gap in their firm → competitor or regulatory threat → practical exit ramp.

BANNED WORDS AND PHRASES — KILL LIST (zero tolerance, delete or rewrite):
${KILL_LIST}

CHARACTER INTEGRITY — do not alter any of these canonical facts:
${CHARACTER_PROFILES}

REGULATORY INTEGRITY — RISK 5 FIXES (these three errors must never appear):
${RISK5_FIXES}

KNOWN ISSUES TO FIX IN THIS CHAPTER:
${blockers.map(b => `- ${b}`).join('\n')}
${warnings.map(w => `- ${w}`).join('\n')}

HARDEST PARAGRAPHS (priority targets — apply the 11 principles and the syllable swaps here first):
${hardParas}

---

CHAPTER DRAFT:
${draft}

---

Return the complete revised chapter. Do not add a preamble or commentary. Return only the revised text.
`.trim();
};

// ── Pass 6: Nick Lockett — targeted style intervention ───────────────────────
// Nick's approach is exceptional. His scenes, LOGIC structure, Beat narrative,
// and regulatory precision are assets. Three specific patterns suppress his Flesch:
//   1. "The X" sentence openers (87 in Ch09 alone) — distancing, passive
//   2. Semicolon chains in Mitigation blocks — dense compound lists
//   3. Framework-first structure — implication arrives too late
// This pass surgically fixes those three patterns while preserving everything else.

const NICK_PROMPT = (chapter: number, draft: string) => `
You are a specialist plain-English editor working ONLY on Nick Lockett's chapters of "The Digital Law Firm" (Law Society Publishing, Q4 2026).

Nick's writing has three exceptional strengths — and three specific patterns that suppress readability. Your task is to eliminate the three patterns while leaving everything else untouched.

**DO NOT CHANGE:**
- Nick's scenes (Sarah at her desk, the SRA phone call, the GmbH email, the 8:47am arrival)
- Nick's LOGIC sections
- Nick's Beat structure (Beat 1, Beat 2, etc.)
- Nick's TLDR boxes, TWO WAYS boxes, Common Mistakes boxes, Forward Bridge paragraphs
- Nick's regulatory precision — every SRA reference, Article number, UK GDPR citation stays
- Nick's legal caveats ("practitioner-developed", "not legal advice", "take your own advice")
- All ASCII art, tables, flowcharts, and template structures
- All statistics, percentages, currency figures, and cited data

---

## THE THREE PATTERNS TO FIX

---

### PATTERN 1: "The X" openers — invert to direct address

Nick starts 40–50% of his body sentences with "The". This creates distance. The reader watches rather than acts.

**The rule:** Every "The [noun] does/is/has/requires" should become "Your [noun]", "You need to", or a short imperative.

**Nick's own examples — transform these patterns throughout:**

| Nick writes | Rewrite as |
|---|---|
| "The monthly meeting runs thirty minutes." | "Run it in thirty minutes." |
| "The Technology Register has three sections." | "Your Register needs three sections." |
| "The governing body must review the register quarterly." | "Review the register every three months." |
| "The alternative is the fiasco." | "Without this, you face the fiasco." |
| "The position for UK firms is fact-sensitive." | "Your position depends on the facts of your practice." |
| "The commercial dynamic is straightforward." | "Here is the commercial case." |
| "The classification decision tree is practitioner-developed." | "Use this decision tree — it is practitioner-developed." |
| "The firm's governance model is tested." | "This is how governance gets tested." |
| "The review process is completed monthly." | "Complete the review monthly." |
| "The monitoring protocol has three stages." | "Run the monitoring in three stages." |

**Apply this transformation to every "The [noun]" sentence in the body text.** Exception: keep "The SRA", "The Law Society", "The EU AI Act" as proper noun references.

---

### PATTERN 2: Semicolon chains → numbered bullets

Nick uses semicolons to chain multiple actions into one sentence. This is thorough but unreadable.

**The rule:** Any sentence with 2+ semicolons becomes a numbered list. The sentence before the list states what the list is for. The sentence after states the consequence of not doing it.

**Nick's own examples — transform these patterns:**

BEFORE:
> "Mitigation: treat each AI supplier as a potential data processor under UK GDPR; record lawful bases, data processing agreements, and data residency; configure tools so client data is not used for training models; avoid feeding identifiable client details into any tool without a signed DPA."

AFTER:
> **Four things to do with every AI supplier:**
> 1. Treat them as a data processor under UK GDPR
> 2. Record the lawful basis, the DPA, and where data lives
> 3. Set the tool so client data is not used for training
> 4. Never feed identifiable client details into a tool without a signed DPA
>
> *Miss any of these four and the data breach risk sits with you, not the vendor.*

BEFORE:
> "Mitigation: assign a specific person to review trigger status during the monthly audit, and record any remedial action with deadlines and escalation routes."

AFTER:
> "Assign one person to own the audit. Record every remedial action with a deadline and an escalation name. No owner, no audit. No audit, no governance."

---

### PATTERN 3: Framework first → Consequence first

Nick's deepest habit: he introduces the framework, then explains why it matters. For a time-poor practice manager, the consequence must come first.

**The rule:** Every section that opens with "A governance model that..." or "The [framework] operates by..." or "There are three components..." should be inverted. Lead with what happens without it. Then show the framework.

**Nick's own examples:**

BEFORE:
> "A governance model that has ownership but no monitoring produces documented responsibility that nobody discharges. A governance model that has monitoring but no remediation produces evidence of non-compliance that nobody corrects."

AFTER:
> "Ownership without monitoring is paperwork. Nobody acts on it. Monitoring without remediation is evidence. Nobody fixes it. You need all three to work — or the whole thing is decoration."

BEFORE:
> "The Technology Register serves three compliance functions. Each function is equally non-negotiable."

AFTER:
> "Three things will go wrong without a Technology Register. You will lose track of which AI tools you are running. You will lose track of who owns each one. You will lose track of when each was last reviewed. The Register fixes all three."

BEFORE:
> "Classification is not a one-time exercise — systems change, usage changes, and regulatory guidance updates."

AFTER:
> "Classify once and you are out of date within six months. Systems change. Usage changes. Regulatory guidance changes. Build in a quarterly review."

---

## WHAT NICK DOES BRILLIANTLY — PRESERVE AND AMPLIFY

**His scenes are outstanding.** Do not touch them. Sarah at her desk at 8:47am. The SRA phone call. The GmbH email arriving. These deliver earned conviction — the reader sees the moment rather than the principle. If anything, make the scene transition crisper (shorter bridge sentence into each scene).

**His LOGIC sections work.** The three numbered questions that open each chapter beat are exactly the right device. Keep them. Tighten any prose that follows them.

**His Monday actions are strong.** When he gives a specific, timed action ("This Monday: ..."), it lands. Make sure every major section closes with one.

**His regulatory precision is his authority.** Every specific reference — "SRA Code 3.3", "UK GDPR Article 28", "EU AI Act Article 14" — is a trust signal. Never generalise these. They stay verbatim.

---

## SYLLABLE TARGETS — Nick's author-specific word swaps

Nick's polysyllabic word density is 30.2% — the highest of all authors. Target ≤ 20%.

Replace these high-frequency words:
- governance → rules, controls, oversight (vary; never repeat in same paragraph)
- technology → tool, system, AI tool, software
- oversight → check, review, sign-off, supervision
- transparency → openness, visibility, being clear
- monitoring → tracking, watching, checking, keeping watch
- classification → type, category, risk level, label
- accuracy → getting it right, reliable, trustworthy output
- quarterly → every three months
- competence → skill, ability, know-how
- inspection → check, audit, review
- protocol → rule, step, procedure
- ownership → who owns it, who is responsible, named person
- documentation → records, paperwork, written trail
- register → log, list, record (vary to avoid repetition)
- requirement → what you need, rule, obligation
- compliance → meeting the rules, staying within bounds, regulatory health
- regulatory → SRA's, the rules', legal (vary by context)
- implement → put in place, set up, run, build
- framework → plan, structure, approach, model
- organisation → firm, practice, team

---

## SENTENCE RHYTHM

After EVERY three sentences of medium length, write one sentence of 5 words or fewer.

This one pattern is responsible for 10–15 Flesch points.

Examples of Nick's closing short sentences — use this style:
- "That is the point."
- "You cannot undo that."
- "Start there."
- "One person. One register. One rule."
- "That is governance."
- "No owner, no check."
- "Simple. But most firms miss it."

---

## CHAPTER DRAFT:
${draft}

---

Return the complete revised chapter. No preamble. No commentary. Only the revised text.
`.trim();

// ── Pass 5: Structural punch — targets Flesch 80+ ─────────────────────────────
const PASS5_PROMPT = (chapter: number, author: string, draft: string, profile: typeof AUTHOR_WORD_PROFILES[string]) => `
You are a structural editor working on Chapter ${chapter} of "The Digital Law Firm" (Law Society Publishing, Q4 2026).

This chapter has already been rewritten for plain English. It scores Flesch ~55–65. The target is Flesch 80+.
That target is achievable. It requires structural surgery — not more word swaps.

**Author:** ${author}
**Reader:** A practice manager or senior partner at a UK high street or regional law firm. 4–25 fee earners, SRA-regulated, time-poor, change-sceptical. Reading under pressure. Interrupted constantly. Will skim before they commit to a paragraph.

---

## YOUR BENCHMARK: The SRA's Own Writing Style

The SRA issues enforcement notices and warning letters that solicitors actually read and act on. They achieve Flesch 80–85. Study their structure:

**SRA enforcement notice style:**
"Your firm is at risk. Three things must change before your next file review. First: your AI policy must be in writing. Second: every fee earner must sign it. Third: your COLP must audit compliance quarterly. This is not optional."

**Why it works:**
- Opening sentence: 5 words. Consequence stated immediately.
- One fact per sentence.
- Short declarative constructions: subject → verb → object.
- Lists replace subordinate clauses.
- The reader cannot miss the point.

**Apply this pattern throughout the chapter.**

---

## THE THREE STRUCTURAL MOVES THAT REACH FLESCH 80

**MOVE 1 — PUNCH OPENERS: Every section starts with 6–10 words**

Every major heading, every paragraph lead sentence must be short and hit hard.
Replace this:
> "In considering the implications of artificial intelligence adoption for small and medium-sized law firms, it is important to first establish..."

With this:
> "AI is already in your firm. You may not know it."

The opener creates a micro-commitment. The reader reads the next sentence. Then the next.
Every section opener in this chapter must work this way.

**MOVE 2 — RHYTHM RULE: After every two medium sentences, one short one**

Target pattern: medium (12–16 words) → medium (12–16 words) → short (4–9 words). Repeat.

The short sentence does one of three things:
- Delivers the conclusion ("That is the risk.")
- Issues the action ("Start there.")
- Names the consequence ("You cannot undo that.")

This one pattern, applied consistently, will add 12–18 Flesch points by itself.

**MOVE 3 — COMPLEXITY INTO STRUCTURE**

Any sentence explaining a comparison, a process, or a list of conditions becomes a bullet list or table.
The prose sentence then says: "Here is what that means for you."

Replace this:
> "The system must be assessed for accuracy, checked for jurisdiction-specific performance, evaluated against the firm's existing workflow, and reviewed against the SRA's guidance on technology oversight."

With this:
> "Before you sign a contract, check four things:
> - Accuracy — on UK matters, not global averages
> - Jurisdiction — England and Wales, not California
> - Workflow fit — your PMS, not a generic demo
> - SRA compliance — documented, signed, audited"
> Then one line of prose: "If you can't answer all four, don't sign."

---

## CONTENT RULES — NON-NEGOTIABLE

1. Do NOT change any statistic, figure, or cited number
2. Do NOT change any SRA, ICO, UK GDPR, or regulatory reference
3. Do NOT remove any TLDR, Try This Week, Common Mistakes, or Forward Bridge box
4. Do NOT add new content not in the draft
5. Preserve all tables, ASCII art, and flowcharts exactly
6. The fictional/illustrative labels on examples MUST remain — "fictional", "made-up", "illustrative"
7. All legal caveats ("not a substitute for legal advice", "practitioner-developed method") must survive

---

## AUTHOR-SPECIFIC WORD SWAPS — apply these throughout

${profile.swaps}

Plus — target average syllables per word ≤ 1.45 (current ~1.60):
- Replace any remaining 3+ syllable word where a 1–2 syllable alternative exists
- "approximately" → "about" | "demonstrate" → "show" | "requirements" → "needs" | "implementation" → "rollout" | "organisations" → "firms" | "individuals" → "people" | "however" → "but" | "therefore" → "so" | "significant" → "real" | "consider" → "think about" | "ensure" → "make sure" | "provide" → "give"

---

## THE STANDARD TO HIT

Think of the writing style in:
- **The SRA's enforcement notices** — direct, one fact per sentence, no padding
- **Good to Great (Jim Collins)** — short punches, then the evidence, then the implication
- **The E-Myth Revisited (Gerber)** — almost everything is a scene or a dialogue
- **Which? magazine** — complex consumer rights in plain English, sub-Grade 10

This reader is as intelligent as any of those audiences. They are not being dumbed down. They are being respected.

---

## CHAPTER DRAFT (already plain-English edited — now needs structural surgery):

${draft}

---

Return the complete revised chapter. No preamble. No commentary. Only the revised text.
`.trim();

async function rewriteForReadability(chapter: number, pass5 = false, pass6 = false): Promise<void> {
  // Lock guard — refuse to rewrite a locked chapter unless LOCK_GUARD_OVERRIDE is set.
  // Readability rewrite produces a derivative (_readable.md) but is treated as a
  // chapter mutator per the global lock protocol: review drafts of a locked
  // chapter risk drifting from the canonical sha and re-entering the pipeline.
  try {
    assertWritable(chapter, `readability rewrite (pass${pass6 ? '6' : pass5 ? '5' : '4'})`);
  } catch (err) {
    if (err instanceof LockError) {
      console.log(`  Ch${String(chapter).padStart(2, '0')} → 🔒 ${err.message.split('\n')[0]}`);
      return;
    }
    throw err;
  }

  const filename = CHAPTER_FILES[chapter];
  const author = CHAPTER_AUTHORS[chapter];

  // Pass 6 (Nick-specific) and Pass 5 both rewrite the _readable.md (compounding)
  const filePath = (pass5 || pass6)
    ? path.join(CHAPTERS_DIR, filename.replace('.md', '_readable.md'))
    : path.join(CHAPTERS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  Ch${chapter} — ${pass5 ? '_readable.md' : 'original'} not found, skipping`);
    return;
  }

  const draft = fs.readFileSync(filePath, 'utf-8');
  const profile = AUTHOR_WORD_PROFILES[author] ?? AUTHOR_WORD_PROFILES['Darren'];

  // Pre-audit against the ORIGINAL for baseline comparison
  const origPath = path.join(CHAPTERS_DIR, filename);
  const origDraft = fs.existsSync(origPath) ? fs.readFileSync(origPath, 'utf-8') : draft;
  const audit = auditReadability(chapter, origDraft);
  const preAudit = auditReadability(chapter, draft); // audit what we're about to rewrite

  const hardParas = preAudit.hardParagraphs.slice(0, 5)
    .map((p, i) => `${i + 1}. [Grade ${p.gradeLevel}] ${p.preview}`)
    .join('\n');

  const passLabel = pass6 ? 'Pass 6' : pass5 ? 'Pass 5' : 'Pass 4';
  console.log(`  Ch${String(chapter).padStart(2, '0')} → ${passLabel} input: Flesch ${preAudit.fleschReadingEase} | Grade ${preAudit.fleschKincaidGrade} | target 80`);

  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });

  const prompt = pass6 && [7, 8, 9].includes(chapter)
    ? NICK_PROMPT(chapter, draft)
    : pass5
    ? PASS5_PROMPT(chapter, author, draft, profile)
    : READABILITY_PROMPT(chapter, author, draft, audit.blockers, audit.warnings, hardParas);

  const response = await gpt.chat.completions.create({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 32000,
  });

  const revised = response.choices[0].message.content ?? '';

  // Truncation guard
  const origWords = draft.split(/\s+/).length;
  const revWords = revised.split(/\s+/).length;
  if (revised.length === 0 || revWords < origWords * 0.75) {
    console.log(`  Ch${chapter} → ⚠️  Truncation detected (${origWords}→${revWords} words). Keeping original.`);
    return;
  }

  // Post-audit to verify improvement
  const postAudit = auditReadability(chapter, revised);
  const improved = postAudit.fleschReadingEase > audit.fleschReadingEase;
  const icon = postAudit.overallGrade === 'PASS' ? '✅'
    : postAudit.overallGrade === 'ADVISORY' ? '⚠️ '
    : '❌';

  console.log(`  Ch${String(chapter).padStart(2, '0')} → After:  Flesch ${postAudit.fleschReadingEase} | Grade ${postAudit.fleschKincaidGrade} | Compulsion ${postAudit.compulsionScore} ${icon} ${improved ? '(improved)' : '(no change)'}`);

  // Save readable draft for author comparison
  const chPad = String(chapter).padStart(2, '0');
  const readablePath = path.join(CHAPTERS_DIR, filename.replace('.md', '_readable.md'));
  const comparePath = path.join(REPORTS_DIR, `chapter_${chPad}_readability_changes.md`);

  fs.writeFileSync(readablePath, revised, 'utf-8');
  appendAudit(
    chapter,
    sha256Of(revised),
    'readability_rewrite.ts',
    `pass${pass6 ? '6' : pass5 ? '5' : '4'} _readable.md written (override=${process.env.LOCK_GUARD_OVERRIDE ? 'yes' : 'no'})`,
  );

  // Comparison summary for author
  const comparison = `# Chapter ${chapter} — Readability Edit Summary
**Author:** ${author}
**Generated:** ${new Date().toISOString().slice(0, 16)} UTC

## What changed (delivery only — content unchanged)

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Flesch Reading Ease | ${audit.fleschReadingEase} | ${postAudit.fleschReadingEase} | ≥ 60 |
| FK Grade Level | ${audit.fleschKincaidGrade} | ${postAudit.fleschKincaidGrade} | ≤ 10 |
| Gunning Fog | ${audit.gunningFog} | ${postAudit.gunningFog} | ≤ 12 |
| Avg sentence length | ${audit.avgSentenceWords} words | ${postAudit.avgSentenceWords} words | ≤ 20 |
| Passive voice | ${(audit.passiveVoiceRatio * 100).toFixed(0)}% | ${(postAudit.passiveVoiceRatio * 100).toFixed(0)}% | < 10% |
| Compulsion score | ${audit.compulsionScore} | ${postAudit.compulsionScore} | ≥ 3 |
| Overall grade | ${audit.overallGrade} | ${postAudit.overallGrade} | PASS |

## How to review

The original chapter is: \`${filename}\`
The plain English draft is: \`${filename.replace('.md', '_readable.md')}\`

Open both side by side. The readable draft has the same structure, same facts, same citations.
Changes are to sentence length, voice, and jargon only.

Accept the changes you agree with. Reject anything that loses your voice or changes your meaning.
The goal is not perfection — it is a chapter a time-poor practice manager will finish and act on.

${postAudit.warnings.length > 0 ? `## Remaining warnings\n${postAudit.warnings.map(w => `- ${w}`).join('\n')}` : '## ✅ All warnings resolved'}
`;

  fs.writeFileSync(comparePath, comparison, 'utf-8');

  // Copy to Google Drive
  if (fs.existsSync(DRIVE_DIR)) {
    fs.writeFileSync(
      path.join(DRIVE_DIR, `chapter_${chPad}_readable.md`),
      revised, 'utf-8'
    );
    fs.writeFileSync(
      path.join(DRIVE_DIR, `chapter_${chPad}_readability_changes.md`),
      comparison, 'utf-8'
    );
  }

  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  const cost = (tokensIn * 3 + tokensOut * 12) / 1_000_000 * 0.79;
  console.log(`  Ch${String(chapter).padStart(2, '0')} → Cost: £${cost.toFixed(4)} | Saved to Drive`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const isPass5 = rawArgs.includes('--pass5');
const isPass6 = rawArgs.includes('--pass6');
const args = rawArgs.filter(a => a !== '--pass5' && a !== '--pass6');
const chapters = args.length > 0
  ? args.map(Number).filter(n => CHAPTER_FILES[n])
  : Object.keys(CHAPTER_FILES).map(Number);

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const passLabel = isPass6
  ? 'Pass 6 — Nick Lockett Structural Intervention (target Flesch 80+)'
  : isPass5
  ? 'Pass 5 — Structural Punch (target Flesch 80+)'
  : 'Pass 4 — Syllable Reduction';
console.log(`\n✍️  Readability Rewrite — The Digital Law Firm`);
console.log(`   ${passLabel}`);
console.log(`   Chapters: ${chapters.join(', ')}`);
console.log(`   Cost estimate: £${(chapters.length * 0.20).toFixed(2)}–£${(chapters.length * 0.35).toFixed(2)}\n`);

(async () => {
  await Promise.all(chapters.map(ch => rewriteForReadability(ch, isPass5, isPass6)));
  console.log(`\n✅ Done. Readable drafts in: ${CHAPTERS_DIR}`);
  console.log(`   Comparison summaries in: ${REPORTS_DIR}`);
  console.log(`   Google Drive: First Author Review folder\n`);
})();
