/**
 * Stage 5b — Humanise Pass
 * =========================
 * Final pass after all LLM stages. Detects AI writing patterns and,
 * if the Flesch score is below threshold OR AI smells exceed tolerance,
 * rewrites the chapter for a UK practice manager reading on their phone.
 *
 * Sources:
 *   - Wikipedia: Signs of AI writing — en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
 *   - Embryo: List of Words AI Overuses — embryo.com/blog/list-words-ai-overuses/
 *   - The Digital Law Firm Kill List (prompts.ts)
 *
 * Trigger conditions (either):
 *   - Flesch Reading Ease < 60
 *   - 3 or more AI smell signals detected
 *
 * Target: Flesch ≥ 70, zero Kill List violations, zero AI openers.
 */

import OpenAI from 'openai';

// ─────────────────────────────────────────────────────────────────────────────
// AI smell signal types
// ─────────────────────────────────────────────────────────────────────────────

export type SmellType =
  | 'kill_list'         // Digital Law Firm Kill List violations
  | 'ai_signal'         // Wikipedia Signs of AI Writing words
  | 'hollow_opener'     // "In today's rapidly evolving…" style openers
  | 'false_contrast'    // "It's not just X, it's Y" formula
  | 'transition_stacking' // furthermore + moreover + subsequently in one passage
  | 'vague_competence'; // "leveraging data to drive business outcomes"

export interface AISmell {
  word: string;
  type: SmellType;
  suggestion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Word lists
// ─────────────────────────────────────────────────────────────────────────────

/** Kill List — from The Digital Law Firm prompts.ts */
const KILL_LIST_WORDS: Array<{ word: string; suggestion: string }> = [
  { word: 'transformative',    suggestion: 'describe the specific change instead' },
  { word: 'delve',             suggestion: '"explore", "examine", or "look at"' },
  { word: 'delving',           suggestion: '"exploring" or "examining"' },
  { word: 'seamless',          suggestion: 'describe what actually happens' },
  { word: 'seamlessly',        suggestion: 'describe what actually happens' },
  { word: 'robust',            suggestion: 'name the specific strength' },
  { word: 'synergy',           suggestion: 'describe what works together and why' },
  { word: 'paradigm',          suggestion: '"approach", "model", or "way of working"' },
  { word: 'holistic',          suggestion: '"complete", "end-to-end", or "whole"' },
  { word: 'cutting-edge',      suggestion: 'name the specific technology' },
  { word: 'revolutionary',     suggestion: 'describe what changed and by how much' },
  { word: 'innovative',        suggestion: 'show the innovation; don\'t label it' },
  { word: 'disruptive',        suggestion: 'say what it replaces and why' },
  { word: 'ecosystem',         suggestion: '"tools", "suppliers", or "network"' },
  { word: 'pivotal',           suggestion: '"critical", "key", or drop the adjective' },
  { word: 'underscore',        suggestion: '"show", "confirm", or "make clear"' },
  { word: 'testament',         suggestion: '"proof" or "evidence"' },
  { word: 'meticulous',        suggestion: '"careful", "thorough", or "detailed"' },
  { word: 'tapestry',          suggestion: 'use a concrete image instead' },
  { word: 'garner',            suggestion: '"get", "earn", or "build"' },
  { word: 'leverage',          suggestion: 'use the plain verb for what you mean' },
  { word: 'navigate',          suggestion: '"use", "manage", or "work through"' },
  { word: 'unlock',            suggestion: '"enable", "allow", or "open up"' },
  { word: 'unleash',           suggestion: '"use", "apply", or "release"' },
  { word: 'showcase',          suggestion: '"show", "demonstrate", or "highlight"' },
  { word: 'landscape',         suggestion: 'describe the specific environment' },
  { word: 'straightforward',   suggestion: 'say why it is easy' },
  { word: 'crucial',           suggestion: '"important", "key", or explain why' },
];

/** Wikipedia Signs of AI Writing signals (beyond the Kill List) */
const WIKIPEDIA_AI_SIGNALS: Array<{ word: string; suggestion: string }> = [
  { word: 'certainly',         suggestion: '"yes", drop it, or state the fact directly' },
  { word: 'interplay',         suggestion: 'describe how the two things affect each other' },
  { word: 'intricate',         suggestion: '"complex", "detailed", or "involved"' },
  { word: 'data-driven',       suggestion: 'say what the data shows' },
];

/** Hollow openers AI loves */
const HOLLOW_OPENERS: string[] = [
  "in today's rapidly evolving",
  "in today's fast-paced",
  "it is worth noting that",
  "it's worth noting that",
  "it should be noted that",
  "needless to say",
  "as a matter of fact",
  "in conclusion",
  "to summarise,",
  "to summarize,",
  "in summary,",
  "this highlights the importance",
  "this demonstrates the",
  "here's the key takeaway",
  "the most important thing is",
];

/** False contrast formula */
const FALSE_CONTRAST_PATTERNS = [
  /it'?s? not just .{3,50},? it'?s/i,
  /is not just .{3,50},? it'?s/i,
  /not just .{3,30},? but also/i,
  /not merely .{3,30},? but/i,
];

/** Formal transition words that stack badly */
const STACKING_TRANSITIONS = [
  'furthermore', 'moreover', 'subsequently', 'accordingly',
  'notwithstanding', 'henceforth', 'therein', 'aforementioned',
];

/** Vague competence-speak */
const VAGUE_COMPETENCE: string[] = [
  'leveraging data to drive',
  'contribute effectively',
  'drive business outcomes',
  'deliver value',
  'actionable insights',
  'best practices',
  'going forward',
  'at the end of the day',
  'move the needle',
  'low-hanging fruit',
  'touch base',
  'circle back',
];

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

/** Scans text for AI writing signals. Returns all detected smells. */
export function detectAISmell(text: string): AISmell[] {
  const lower = text.toLowerCase();
  const smells: AISmell[] = [];

  // Kill List
  for (const { word, suggestion } of KILL_LIST_WORDS) {
    const re = new RegExp(`\\b${word.replace(/-/g, '[- ]')}\\b`, 'i');
    if (re.test(text)) {
      smells.push({ word, type: 'kill_list', suggestion });
    }
  }

  // Wikipedia AI signals
  for (const { word, suggestion } of WIKIPEDIA_AI_SIGNALS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
      smells.push({ word, type: 'ai_signal', suggestion });
    }
  }

  // Hollow openers
  for (const opener of HOLLOW_OPENERS) {
    if (lower.includes(opener)) {
      smells.push({ word: opener, type: 'hollow_opener', suggestion: 'start with the specific fact instead' });
    }
  }

  // False contrast
  for (const pattern of FALSE_CONTRAST_PATTERNS) {
    if (pattern.test(text)) {
      smells.push({ word: 'false contrast formula', type: 'false_contrast', suggestion: 'make one clear claim' });
      break;
    }
  }

  // Transition stacking (3+ in same passage)
  const transitionCount = STACKING_TRANSITIONS.filter(t => lower.includes(t)).length;
  if (transitionCount >= 3) {
    smells.push({
      word: `${transitionCount} stacked transitions (${STACKING_TRANSITIONS.filter(t => lower.includes(t)).slice(0, 3).join(', ')})`,
      type: 'transition_stacking',
      suggestion: 'use one connector per passage; vary with plain connectors like "also", "and", "but"',
    });
  }

  // Vague competence-speak
  for (const phrase of VAGUE_COMPETENCE) {
    if (lower.includes(phrase)) {
      smells.push({ word: phrase, type: 'vague_competence', suggestion: 'name the specific outcome' });
    }
  }

  return smells;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a humanise rewrite pass is needed.
 * Triggers when:
 *   - Flesch < 60 (regardless of smell count), OR
 *   - 3+ AI smells detected (regardless of Flesch score), OR
 *   - Flesch 60–69 AND 3+ smells
 */
export function needsHumanisePass(fleschScore: number, aiSmells: AISmell[]): boolean {
  if (fleschScore < 60) return true;
  if (aiSmells.length >= 3) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the system prompt for the humanise rewrite pass.
 * Incorporates Wikipedia's Signs of AI Writing guide and the Kill List.
 */
export function buildHumanisePrompt(draft: string, fleschScore: number, aiSmells: AISmell[]): string {
  const smellList = aiSmells.length > 0
    ? aiSmells.map(s => `  - "${s.word}" (${s.type}) → ${s.suggestion}`).join('\n')
    : '  (none detected — rewriting for Flesch target only)';

  return `You are a plain-English editor for a UK legal practitioner handbook published by the Law Society.

TASK: Rewrite the chapter draft below so a UK practice manager can read it on their phone during a 6-minute commute.

CURRENT FLESCH READING EASE: ${fleschScore}/100
TARGET: ≥ 70 (plain English standard)

REFERENCE: Wikipedia Signs of AI Writing — en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
Read this guide. These are the patterns you must eliminate.

RULES (non-negotiable):
1. Keep all facts, figures, citations, case studies, and character names exactly as written.
2. Cut syllables, not substance. If a 3-syllable word has a 1-syllable equivalent, use it.
3. Break sentences at 20 words. If a sentence runs longer, split it.
4. Eliminate every word on the AI Smells list below.
5. Replace hollow openers with the specific fact that follows them.
6. Use active voice. The person or firm does the thing.
7. Vary sentence length — one short punchy sentence after every two longer ones.
8. Never use: "furthermore", "moreover", "notwithstanding", "henceforth" — use "also", "and", "but", "so".
9. Write like a senior partner telling a colleague what to do, not like a consultant writing a deck.
10. Do not add new content, claims, or recommendations not in the original.

AI SMELLS TO ELIMINATE (found in this draft):
${smellList}

OUTPUT: Return only the rewritten chapter text. No preamble, no explanation, no "here is the rewritten version".

DRAFT:
${draft}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage runner
// ─────────────────────────────────────────────────────────────────────────────

export interface HumaniseResult {
  rewritten: string;
  skipped: boolean;      // true if gate conditions not met — original returned
  fleschBefore: number;
  aiSmellsFound: AISmell[];
  tokensIn: number;
  tokensOut: number;
  costGbp: number;
}

const COST_IN  = (3  / 1_000_000) * 0.79;  // GPT-4o pricing × GBP
const COST_OUT = (12 / 1_000_000) * 0.79;

/**
 * Runs the humanise pass using GPT-4o.
 * If gate conditions are not met, returns the original draft unchanged.
 */
export async function runHumaniseStage(
  apiKey: string,
  draft: string,
  fleschScore: number,
): Promise<HumaniseResult> {
  const aiSmells = detectAISmell(draft);

  if (!needsHumanisePass(fleschScore, aiSmells)) {
    return {
      rewritten: draft,
      skipped: true,
      fleschBefore: fleschScore,
      aiSmellsFound: aiSmells,
      tokensIn: 0,
      tokensOut: 0,
      costGbp: 0,
    };
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildHumanisePrompt(draft, fleschScore, aiSmells);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,   // low temp — preserve facts, improve readability
    max_tokens: 8000,
  });

  const rewritten = response.choices[0]?.message?.content ?? draft;
  const tokensIn  = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;

  return {
    rewritten,
    skipped: false,
    fleschBefore: fleschScore,
    aiSmellsFound: aiSmells,
    tokensIn,
    tokensOut,
    costGbp: tokensIn * COST_IN + tokensOut * COST_OUT,
  };
}
