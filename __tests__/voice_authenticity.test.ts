/**
 * Stage 6 — Voice Authenticity
 *
 * Deterministic structural checks that catch AI-flavoured prose patterns
 * the readability pass misses. No LLM calls. No tokens.
 *
 * Tests target each of the 7 checks in isolation so a regression in any
 * single rule is immediately visible.
 */
import {
  auditVoiceAuthenticity,
  type VoiceAuthenticityResult,
} from '../lib/ghostwriter/stages/voice_authenticity';

const ONE_PARA = (text: string) => text;
const PARAS = (...ps: string[]) => ps.join('\n\n');

describe('Stage 6 — repetitive paragraph starts', () => {
  it('flags three adjacent paragraphs opening with the same connective', () => {
    const text = PARAS(
      'Moreover, the firm faces compliance risk.',
      'Moreover, the regulatory landscape is shifting.',
      'Moreover, cost pressures continue to mount.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.repetitiveStarts.length).toBeGreaterThan(0);
    expect(r.repetitiveStarts[0].word.toLowerCase()).toBe('moreover');
  });

  it('does not flag paragraphs that vary their openers', () => {
    const text = PARAS(
      'Sarah opened the file at 8:47am.',
      'Within an hour, three things had gone wrong.',
      'By Friday, the SRA had asked for the policy.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.repetitiveStarts.length).toBe(0);
  });
});

describe('Stage 6 — paragraph length uniformity', () => {
  it('flags three consecutive paragraphs of near-identical length', () => {
    const para = 'Word '.repeat(80).trim() + '.';
    const text = PARAS(para, para, para);
    const r = auditVoiceAuthenticity(text);
    expect(r.uniformParagraphClusters).toBeGreaterThan(0);
  });

  it('does not flag varied paragraph lengths', () => {
    const text = PARAS(
      'Short opener.',
      'A middle paragraph of moderate length that develops the point with some detail and context for the reader to engage with.',
      'And the close.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.uniformParagraphClusters).toBe(0);
  });
});

describe('Stage 6 — em-dash density', () => {
  it('flags an em-dash storm (2+ dashes within 50 words)', () => {
    const text = ONE_PARA(
      'The policy — which was new — required immediate sign-off.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.emDashStorms.length).toBeGreaterThan(0);
  });

  it('counts em-dash density per 200 words', () => {
    // 400 words, 4 em-dashes — exceeds 1 per 200.
    const sentence = 'A simple sentence with no dash here. '.repeat(40);
    const text = sentence + ' — alpha. — beta. — gamma. — delta.';
    const r = auditVoiceAuthenticity(text);
    expect(r.emDashPer200Words).toBeGreaterThan(1);
  });
});

describe('Stage 6 — named-specifics density', () => {
  it('rewards named people, dates, times, and numbers', () => {
    const text = ONE_PARA(
      'On 14 March 2026 at 8:47am, Sarah Lockett met with the SRA. ' +
      'The fee was £4,200. Three fee earners at Lockett & Co reviewed the file. ' +
      'By Monday, Article 12 of the EU AI Act had taken effect.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.namedSpecificsPer1000Words).toBeGreaterThan(5);
  });

  it('flags prose with no named specifics', () => {
    const text = ONE_PARA(
      'Firms should consider the implications of artificial intelligence. ' +
      'Practitioners must navigate the regulatory landscape carefully. ' +
      'Organisations face significant challenges in this domain.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.namedSpecificsPer1000Words).toBeLessThan(5);
    expect(r.warnings.some(w => w.includes('named'))).toBe(true);
  });
});

describe('Stage 6 — HITL placeholders', () => {
  it('counts HITL placeholder markers', () => {
    const text = '[INSERT PERSONAL ANECDOTE HERE] and [VERIFY STATISTIC AGAINST SOURCE].';
    const r = auditVoiceAuthenticity(text);
    expect(r.hitlPlaceholders).toBe(2);
  });

  it('reports zero when there are none', () => {
    const r = auditVoiceAuthenticity('No placeholders here.');
    expect(r.hitlPlaceholders).toBe(0);
  });
});

describe('Stage 6 — Monday-morning close', () => {
  it('passes when the final paragraph contains a concrete next action', () => {
    const text = PARAS(
      'A long discussion of governance.',
      'This Monday, ask three fee earners which AI tool they used last week. Write the answer down.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.mondayClosePresent).toBe(true);
  });

  it('flags a summary-platitude close', () => {
    const text = PARAS(
      'A long discussion of governance.',
      'In conclusion, governance is important and firms should consider their approach.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.mondayClosePresent).toBe(false);
  });
});

describe('Stage 6 — opening boilerplate', () => {
  it('flags generic chapter openings', () => {
    const text = ONE_PARA(
      'In this chapter we will explore the transformative impact of AI on the legal landscape.',
    );
    const r = auditVoiceAuthenticity(text);
    expect(r.boilerplateOpener).toBe(true);
  });

  it('passes a punchy opener', () => {
    const text = ONE_PARA('AI is already in your firm. You may not know it.');
    const r = auditVoiceAuthenticity(text);
    expect(r.boilerplateOpener).toBe(false);
  });
});

describe('Stage 6 — overall grade', () => {
  it('returns PASS when no significant issues', () => {
    const text = PARAS(
      'AI is already in your firm. You may not know it.',
      'On 14 March 2026, Sarah Lockett opened a file at 8:47am. By 9:15, three fee earners had used ChatGPT on it. The SRA later asked who authorised that.',
      'This Monday, ask three fee earners which AI tool they touched last week. Write the answer down.',
    );
    const r: VoiceAuthenticityResult = auditVoiceAuthenticity(text);
    expect(['PASS', 'ADVISORY']).toContain(r.overallGrade);
  });

  it('returns FAIL when multiple checks trip', () => {
    const sameLengthPara = 'Moreover, the regulatory landscape continues to evolve in ways that firms must consider very carefully indeed across multiple dimensions.';
    const text = PARAS(sameLengthPara, sameLengthPara, sameLengthPara);
    const r = auditVoiceAuthenticity(text);
    expect(r.overallGrade).toBe('FAIL');
  });
});
