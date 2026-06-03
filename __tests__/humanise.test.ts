/**
 * Humanise stage tests
 *
 * detectAISmell(text) must:
 *   - return an empty array for clean human-style text
 *   - flag known Kill List words (transformative, delve, seamless, robust, etc.)
 *   - flag Wikipedia AI-writing signals (pivotal, underscore, tapestry, testament, meticulous)
 *   - flag hollow openers ("In today's rapidly evolving", "It is worth noting")
 *   - flag false contrast formula ("It's not just X, it's Y")
 *   - flag transition stacking (furthermore + moreover in same passage)
 *   - flag vague competence-speak ("leveraging data to drive")
 *   - NOT flag legitimate uses of similar words (e.g. "navigate" in navigation context)
 *
 * buildHumanisePrompt(draft, fleschScore, aiSmells) must:
 *   - return a non-empty string
 *   - include the Flesch score
 *   - include each detected AI smell
 *   - include the Wikipedia Signs of AI Writing URL
 *   - include the target Flesch score (≥ 70)
 *   - include the instruction to keep all facts
 *
 * needsHumanisePass(fleschScore, aiSmells) must:
 *   - return true when Flesch < 60
 *   - return true when aiSmells has 3 or more items
 *   - return false when Flesch ≥ 70 and aiSmells has fewer than 3 items
 *   - return true when Flesch is between 60–69 AND aiSmells has 3+ items
 */

import { detectAISmell, buildHumanisePrompt, needsHumanisePass } from '../lib/ghostwriter/stages/humanise';

// ─────────────────────────────────────────────────────────────────────────────
// detectAISmell
// ─────────────────────────────────────────────────────────────────────────────

describe('detectAISmell', () => {
  it('returns empty array for clean human-style text', () => {
    const clean = 'Sarah opened the file. She had three probate letters to draft before lunch. The first was simple enough — a standard executor notification.';
    expect(detectAISmell(clean)).toHaveLength(0);
  });

  it('flags Kill List word: transformative', () => {
    const text = 'This transformative approach changes how law firms operate.';
    expect(detectAISmell(text).some(s => s.word === 'transformative')).toBe(true);
  });

  it('flags Kill List word: delve', () => {
    const text = "Let's delve into the practical implications for practice managers.";
    expect(detectAISmell(text).some(s => s.word === 'delve')).toBe(true);
  });

  it('flags Kill List word: seamless', () => {
    const text = 'The seamless integration of AI tools reduces manual effort.';
    expect(detectAISmell(text).some(s => s.word === 'seamless')).toBe(true);
  });

  it('flags Wikipedia AI signal: pivotal', () => {
    const text = 'This is a pivotal moment for the legal profession.';
    expect(detectAISmell(text).some(s => s.word === 'pivotal')).toBe(true);
  });

  it('flags Wikipedia AI signal: underscore', () => {
    const text = 'These findings underscore the importance of early adoption.';
    expect(detectAISmell(text).some(s => s.word === 'underscore')).toBe(true);
  });

  it('flags hollow opener: "In today\'s rapidly evolving"', () => {
    const text = "In today's rapidly evolving legal landscape, firms must adapt.";
    expect(detectAISmell(text).some(s => s.type === 'hollow_opener')).toBe(true);
  });

  it('flags hollow opener: "It is worth noting"', () => {
    const text = 'It is worth noting that this approach has significant benefits.';
    expect(detectAISmell(text).some(s => s.type === 'hollow_opener')).toBe(true);
  });

  it('flags false contrast formula', () => {
    const text = "This is not just about efficiency, it's about transformation.";
    expect(detectAISmell(text).some(s => s.type === 'false_contrast')).toBe(true);
  });

  it('flags transition stacking when 3+ formal transitions appear', () => {
    const text = 'Furthermore, this matters. Moreover, it is crucial. Subsequently, firms should act. Additionally, they must consider compliance.';
    expect(detectAISmell(text).some(s => s.type === 'transition_stacking')).toBe(true);
  });

  it('does not flag transition stacking for a single connector word', () => {
    const text = 'Furthermore, practice managers should consider the cost. The savings are real.';
    expect(detectAISmell(text).some(s => s.type === 'transition_stacking')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildHumanisePrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildHumanisePrompt', () => {
  const draft = 'Sample chapter text with transformative ideas and delving analysis.';
  const smells = detectAISmell(draft);
  const prompt = buildHumanisePrompt(draft, 38, smells);

  it('returns a non-empty string', () => {
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('includes the current Flesch score', () => {
    expect(prompt).toContain('38');
  });

  it('includes the target Flesch score', () => {
    expect(prompt).toContain('70');
  });

  it('includes the Wikipedia Signs of AI Writing URL', () => {
    expect(prompt).toContain('wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing');
  });

  it('includes instruction to keep all facts', () => {
    expect(prompt.toLowerCase()).toContain('keep all facts');
  });

  it('includes detected AI smells', () => {
    expect(prompt).toContain('transformative');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// needsHumanisePass
// ─────────────────────────────────────────────────────────────────────────────

describe('needsHumanisePass', () => {
  const manySmells = [
    { word: 'transformative', type: 'kill_list' as const, suggestion: 'remove' },
    { word: 'delve', type: 'kill_list' as const, suggestion: 'remove' },
    { word: 'pivotal', type: 'ai_signal' as const, suggestion: 'remove' },
  ];
  const fewSmells = [{ word: 'robust', type: 'kill_list' as const, suggestion: 'specific detail' }];

  it('returns true when Flesch < 60', () => {
    expect(needsHumanisePass(45, fewSmells)).toBe(true);
  });

  it('returns true when 3 or more AI smells detected', () => {
    expect(needsHumanisePass(72, manySmells)).toBe(true);
  });

  it('returns false when Flesch ≥ 70 and fewer than 3 smells', () => {
    expect(needsHumanisePass(73, fewSmells)).toBe(false);
  });

  it('returns true when Flesch 60–69 AND 3+ smells', () => {
    expect(needsHumanisePass(65, manySmells)).toBe(true);
  });

  it('returns false when Flesch 60–69 and fewer than 3 smells', () => {
    expect(needsHumanisePass(65, fewSmells)).toBe(false);
  });
});
