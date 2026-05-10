import { applyDecisions, parseArgs } from '../apply_chapter_decisions';

describe('parseArgs', () => {
  it('parses --chapter and --dry-run', () => {
    const args = parseArgs(['--chapter', '8', '--dry-run']);
    expect(args).toEqual({ chapter: 8, dryRun: true, output: undefined });
  });

  it('parses --output path', () => {
    const args = parseArgs(['--chapter', '3', '--output', '/tmp/x.md']);
    expect(args).toEqual({ chapter: 3, dryRun: false, output: '/tmp/x.md' });
  });

  it('throws when --chapter missing', () => {
    expect(() => parseArgs(['--dry-run'])).toThrow(/--chapter/);
  });
});

describe('applyDecisions', () => {
  const originalParas = ['Para zero.', 'Para one — discipline.', 'Para two.', 'Para three.'];

  it('returns original unchanged when no decisions', () => {
    expect(applyDecisions(originalParas, [])).toEqual(originalParas);
  });

  it('KEEP leaves the paragraph untouched', () => {
    const out = applyDecisions(originalParas, [
      {
        paragraph_index: 1,
        original_text: 'Para one — discipline.',
        suggested_text: 'Para one — habit.',
        decision: 'KEEP',
        edited_text: null,
        decided_by: 'rajabey68@gmail.com',
      },
    ]);
    expect(out[1]).toBe('Para one — discipline.');
  });

  it('SWAP replaces with suggested_text', () => {
    const out = applyDecisions(originalParas, [
      {
        paragraph_index: 1,
        original_text: 'Para one — discipline.',
        suggested_text: 'Para one — habit.',
        decision: 'SWAP',
        edited_text: null,
        decided_by: 'nick@thedigitallawfirm.co.uk',
      },
    ]);
    expect(out[1]).toBe('Para one — habit.');
  });

  it('REWRITE replaces with edited_text', () => {
    const out = applyDecisions(originalParas, [
      {
        paragraph_index: 1,
        original_text: 'Para one — discipline.',
        suggested_text: 'Para one — habit.',
        decision: 'REWRITE',
        edited_text: 'Para one — the institutional habit.',
        decided_by: 'nick@thedigitallawfirm.co.uk',
      },
    ]);
    expect(out[1]).toBe('Para one — the institutional habit.');
  });

  it('REWRITE with empty edited_text falls back to original', () => {
    const out = applyDecisions(originalParas, [
      {
        paragraph_index: 1,
        original_text: 'Para one — discipline.',
        suggested_text: 'Para one — habit.',
        decision: 'REWRITE',
        edited_text: '   ',
        decided_by: 'nick@thedigitallawfirm.co.uk',
      },
    ]);
    expect(out[1]).toBe('Para one — discipline.');
  });

  it('out-of-range paragraph_index is ignored, no throw', () => {
    const out = applyDecisions(originalParas, [
      {
        paragraph_index: 99,
        original_text: 'x',
        suggested_text: 'y',
        decision: 'SWAP',
        edited_text: null,
        decided_by: 'rajabey68@gmail.com',
      },
    ]);
    expect(out).toEqual(originalParas);
  });
});
