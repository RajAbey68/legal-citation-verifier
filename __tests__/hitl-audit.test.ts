/**
 * Human-in-the-Loop audit stage tests
 *
 * auditForHITL(text) must:
 *   - return empty array for clean operational text
 *   - flag SRA compliance decisions as regulatory
 *   - flag FCA, GDPR, AML mentions with decision context as regulatory
 *   - flag board/partner sign-off requirements as policy_gate
 *   - flag AI making autonomous decisions as wisdom_gap
 *   - flag reputational risk + consequence language as wisdom_gap
 *   - flag ethical judgment requirements as wisdom_gap
 *
 * formatHITLReport(flags, chapterNum) must:
 *   - include chapter number
 *   - include counts per category
 *   - include the excerpt text
 */

import { auditForHITL, formatHITLReport, HITLFlag } from '../lib/ghostwriter/stages/hitl_audit';

describe('auditForHITL', () => {
  it('returns empty array for clean operational text', () => {
    const text = 'The paralegal uploads the document to the case management system. The system saves the file and sends a confirmation email. The partner reviews the draft at the weekly team meeting.';
    expect(auditForHITL(text)).toHaveLength(0);
  });

  it('flags SRA compliance decision as regulatory', () => {
    const text = 'Where the SRA requires a compliance decision to be made, the firm must ensure the process is documented.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'regulatory')).toBe(true);
  });

  it('flags AML suspicious activity as regulatory', () => {
    const text = 'If the AI system detects a suspicious activity pattern, it should flag the matter for AML review.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'regulatory')).toBe(true);
  });

  it('flags GDPR data processing decision as regulatory', () => {
    const text = 'Before the firm shares personal data with a third party, it must confirm the lawful basis under GDPR.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'regulatory')).toBe(true);
  });

  it('flags board approval requirement as policy_gate', () => {
    const text = 'The decision to adopt a new AI platform requires board approval before implementation can begin.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'policy_gate')).toBe(true);
  });

  it('flags managing partner sign-off as policy_gate', () => {
    const text = 'The managing partner must sign off on any AI deployment that affects client-facing processes.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'policy_gate')).toBe(true);
  });

  it('flags AI making autonomous ethical decision as wisdom_gap', () => {
    const text = 'The AI decides autonomously whether the matter raises ethical concerns, without human review.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'wisdom_gap')).toBe(true);
  });

  it('flags reputational risk consequence language as wisdom_gap', () => {
    const text = 'A poor decision here carries significant reputational risk and could have serious consequences for the firm.';
    const flags = auditForHITL(text);
    expect(flags.some(f => f.category === 'wisdom_gap')).toBe(true);
  });

  it('returns HITLFlag objects with required fields', () => {
    const text = 'The SRA requires the firm to approve any change to its compliance framework.';
    const flags = auditForHITL(text);
    expect(flags.length).toBeGreaterThan(0);
    const flag = flags[0];
    expect(flag).toHaveProperty('category');
    expect(flag).toHaveProperty('excerpt');
    expect(flag).toHaveProperty('reason');
    expect(flag).toHaveProperty('lineHint');
    expect(flag.excerpt.length).toBeLessThanOrEqual(200);
  });
});

describe('formatHITLReport', () => {
  const flags: HITLFlag[] = [
    { category: 'regulatory', excerpt: 'SRA decision required here.', reason: 'SRA regulatory gate', lineHint: 10 },
    { category: 'policy_gate', excerpt: 'Board approval needed.', reason: 'Governance gate', lineHint: 25 },
    { category: 'wisdom_gap', excerpt: 'AI decides on reputational risk.', reason: 'Wisdom gap', lineHint: 40 },
  ];

  it('includes the chapter number', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('Chapter 3');
  });

  it('includes regulatory section with count', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('Regulatory gates (1)');
  });

  it('includes policy gate section with count', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('Policy gates (1)');
  });

  it('includes wisdom gap section with count', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('Wisdom gaps (1)');
  });

  it('includes the excerpt text', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('SRA decision required here');
  });

  it('includes total flag count', () => {
    const report = formatHITLReport(flags, 3);
    expect(report).toContain('Total flags: 3');
  });

  it('mentions keeping tasks off AI for wisdom gaps', () => {
    const report = formatHITLReport(flags, 3);
    expect(report.toLowerCase()).toContain('keeping');
  });
});
