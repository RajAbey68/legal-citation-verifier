/**
 * Stage 6.5 — Quote Integrity
 *
 * Catches quotes without attribution, attributions without years, statistics
 * without sources, and paraphrased regulatory text. Deterministic only — no
 * LLM. Counter-AI rules in ~/.claude/CLAUDE.md are the contract.
 */
import {
  auditQuoteIntegrity,
  type QuoteIntegrityResult,
} from '../lib/ghostwriter/stages/quote_integrity';

describe('Stage 6.5 — orphan quote detection', () => {
  it('flags a quoted phrase with no attribution nearby', () => {
    const text = 'The point is that "your client cannot consent to data they cannot see." That is the standard.';
    const r = auditQuoteIntegrity(text);
    expect(r.orphanQuotes.length).toBeGreaterThan(0);
  });

  it('passes a quote with a "said/stated/wrote" attribution', () => {
    const text = 'Lord Atkin said in Donoghue v Stevenson [1932], "you must not injure your neighbour."';
    const r = auditQuoteIntegrity(text);
    expect(r.orphanQuotes.length).toBe(0);
  });

  it('passes a quote with an "according to X" attribution', () => {
    const text = 'According to the LEAP Global Report 2026, "62% of UK legal professionals use AI weekly."';
    const r = auditQuoteIntegrity(text);
    expect(r.orphanQuotes.length).toBe(0);
  });

  it('handles curly quotes the same as straight quotes', () => {
    const text = 'The judge wrote, “the duty is plain.”';
    const r = auditQuoteIntegrity(text);
    expect(r.quotesFound).toBeGreaterThan(0);
    expect(r.orphanQuotes.length).toBe(0);
  });
});

describe('Stage 6.5 — quote-without-year', () => {
  it('flags an attributed quote that lacks a year', () => {
    const text = 'Lord Atkin said, "you must not injure your neighbour."';
    const r = auditQuoteIntegrity(text);
    expect(r.quotesWithoutYear.length).toBeGreaterThan(0);
  });

  it('passes when a four-digit year is within the attribution window', () => {
    const text = 'Lord Atkin in Donoghue v Stevenson [1932] said, "you must not injure your neighbour."';
    const r = auditQuoteIntegrity(text);
    expect(r.quotesWithoutYear.length).toBe(0);
  });
});

describe('Stage 6.5 — statistic without source', () => {
  it('flags a percentage with no source citation nearby', () => {
    const text = 'Some 62% of firms now use AI tools for document review on a weekly basis.';
    const r = auditQuoteIntegrity(text);
    expect(r.statisticsWithoutSource.length).toBeGreaterThan(0);
  });

  it('passes a percentage with a named report and year', () => {
    const text = 'The LEAP Global Report 2026 found that 62% of UK legal professionals are active AI users.';
    const r = auditQuoteIntegrity(text);
    expect(r.statisticsWithoutSource.length).toBe(0);
  });

  it('passes when the stat carries an [UNVERIFIED] marker', () => {
    const text = 'About 62% of firms use AI [UNVERIFIED — source not yet located].';
    const r = auditQuoteIntegrity(text);
    expect(r.statisticsWithoutSource.length).toBe(0);
  });
});

describe('Stage 6.5 — regulatory paraphrase risk', () => {
  it('flags SRA references that are not in quotation marks', () => {
    const text = 'SRA Code Outcome 8.5 requires solicitors to keep records of their AI use.';
    const r = auditQuoteIntegrity(text);
    expect(r.regulatoryParaphrases.length).toBeGreaterThan(0);
  });

  it('flags EU AI Act Article references that are paraphrased', () => {
    const text = 'EU AI Act Article 14 says firms must have human oversight at all times.';
    const r = auditQuoteIntegrity(text);
    expect(r.regulatoryParaphrases.length).toBeGreaterThan(0);
  });

  it('passes when the regulatory text is in quotation marks', () => {
    const text = 'EU AI Act Article 14(1) states: "high-risk AI systems shall be designed and developed in such a way... that they can be effectively overseen by natural persons."';
    const r = auditQuoteIntegrity(text);
    expect(r.regulatoryParaphrases.length).toBe(0);
  });

  it('passes a generic mention without a paraphrase verb', () => {
    const text = 'The SRA published new guidance in March 2026.';
    const r = auditQuoteIntegrity(text);
    expect(r.regulatoryParaphrases.length).toBe(0);
  });
});

describe('Stage 6.5 — known misattribution catch', () => {
  it('flags famous quotes attributed to the wrong person', () => {
    const text = 'As Einstein said, "the definition of insanity is doing the same thing over and over."';
    const r = auditQuoteIntegrity(text);
    expect(r.misattributions.length).toBeGreaterThan(0);
    expect(r.misattributions[0].author.toLowerCase()).toContain('einstein');
  });

  it('does not flag the correct attribution', () => {
    // Rita Mae Brown actually wrote the insanity line.
    const text = 'Rita Mae Brown wrote, "insanity is doing the same thing over and over and expecting different results."';
    const r = auditQuoteIntegrity(text);
    expect(r.misattributions.length).toBe(0);
  });
});

describe('Stage 6.5 — overall grade', () => {
  it('PASSes well-attributed prose', () => {
    const text =
      'According to the LEAP Global Report 2026, 62% of UK legal professionals use AI weekly. ' +
      'In Donoghue v Stevenson [1932], Lord Atkin wrote, "you must not injure your neighbour."';
    const r: QuoteIntegrityResult = auditQuoteIntegrity(text);
    expect(r.overallGrade).toBe('PASS');
  });

  it('FAILs prose with multiple integrity issues', () => {
    const text =
      'Some 62% of firms use AI. As Einstein said, "imagination is everything." ' +
      'SRA Code Outcome 8.5 requires record-keeping. "Trust matters most."';
    const r = auditQuoteIntegrity(text);
    expect(r.overallGrade).toBe('FAIL');
  });
});
