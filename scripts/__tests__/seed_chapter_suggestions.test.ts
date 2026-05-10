import { parseArgs, buildRows } from '../seed_chapter_suggestions';
import type { Suggestion } from '../../lib/ghostwriter/diff';

describe('parseArgs', () => {
  it('parses --chapter NN', () => {
    expect(parseArgs(['--chapter', '8'])).toEqual({
      chapters: [8],
      dryRun: false,
      includePadding: false,
    });
  });

  it('parses --all into 1..12', () => {
    expect(parseArgs(['--all']).chapters).toHaveLength(12);
    expect(parseArgs(['--all']).chapters[0]).toBe(1);
    expect(parseArgs(['--all']).chapters[11]).toBe(12);
  });

  it('parses --dry-run and --include-padding flags', () => {
    expect(parseArgs(['--chapter', '3', '--dry-run', '--include-padding'])).toEqual({
      chapters: [3],
      dryRun: true,
      includePadding: true,
    });
  });

  it('returns no chapters when no --chapter or --all', () => {
    expect(parseArgs(['--dry-run']).chapters).toEqual([]);
  });
});

describe('buildRows', () => {
  const sample: Suggestion[] = [
    {
      paragraphIndex: 0,
      originalText: 'Original A.',
      suggestedText: 'Pipeline A.',
      classification: 'term-change',
      rationale: 'r1',
    },
    {
      paragraphIndex: 5,
      originalText: '',
      suggestedText: 'Pipeline padded para.',
      classification: 'padding',
      rationale: 'r2',
    },
    {
      paragraphIndex: 7,
      originalText: 'Original B with 127 hours.',
      suggestedText: 'Pipeline B.',
      classification: 'precision-loss',
      rationale: 'r3',
    },
  ];

  it('skips padding by default', () => {
    const rows = buildRows(8, sample, false);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.classification)).toEqual(['term-change', 'precision-loss']);
  });

  it('includes padding when --include-padding is set', () => {
    const rows = buildRows(8, sample, true);
    expect(rows).toHaveLength(3);
  });

  it('attaches chapter_number and source_pipeline to every row', () => {
    const rows = buildRows(8, sample, false);
    for (const r of rows) {
      expect(r.chapter_number).toBe(8);
      expect(r.source_pipeline).toBe('v1_2026-05-08');
    }
  });

  it('preserves paragraph_index, original_text, suggested_text, rationale', () => {
    const rows = buildRows(8, sample, false);
    expect(rows[0]).toMatchObject({
      paragraph_index: 0,
      original_text: 'Original A.',
      suggested_text: 'Pipeline A.',
      rationale: 'r1',
    });
  });
});
