import { diffChapter, splitParagraphs, classifyPair } from '../diff';

describe('splitParagraphs', () => {
  it('splits on blank lines and trims', () => {
    const md = 'Para one.\n\nPara two.\n\n\nPara three.';
    expect(splitParagraphs(md)).toEqual(['Para one.', 'Para two.', 'Para three.']);
  });

  it('drops empty paragraphs', () => {
    expect(splitParagraphs('\n\n\n\n')).toEqual([]);
  });
});

describe('classifyPair', () => {
  it('returns null for identical paragraphs', () => {
    expect(classifyPair('Same text.', 'Same text.')).toBeNull();
  });

  it('returns null for whitespace-only differences', () => {
    expect(classifyPair('Same  text.', 'Same text.')).toBeNull();
  });

  it('classifies a single-word swap as term-change', () => {
    const original = 'The discipline that turns ad-hoc AI use into defensible practice.';
    const pipeline = 'The habit that turns ad-hoc AI use into defensible practice.';
    const r = classifyPair(original, pipeline);
    expect(r?.classification).toBe('term-change');
  });

  it('classifies removed numbers as precision-loss', () => {
    const original = 'The firm recorded 127 chargeable hours across all fee earners last Thursday.';
    const pipeline = 'The firm recorded chargeable hours across fee earners.';
    const r = classifyPair(original, pipeline);
    expect(r?.classification).toBe('precision-loss');
  });

  it('classifies pipeline-added paragraph as padding', () => {
    expect(classifyPair(null, 'Pipeline added this.')?.classification).toBe('padding');
  });

  it('classifies pipeline-removed paragraph as precision-loss', () => {
    expect(classifyPair('Author had this.', null)?.classification).toBe('precision-loss');
  });

  it('classifies a significant shortening without lost tokens as readability-win', () => {
    const original =
      'In the author\'s professional view, an AI readiness audit can usually be conducted using your existing staff and your existing systems without requiring large new investments.';
    const pipeline = 'An AI readiness audit uses your existing staff and systems.';
    const r = classifyPair(original, pipeline);
    expect(r?.classification).toBe('readability-win');
  });
});

describe('diffChapter', () => {
  it('returns an empty list when both texts are identical', () => {
    const md = 'Para one.\n\nPara two.';
    expect(diffChapter(md, md)).toEqual([]);
  });

  it('produces one suggestion per non-matching paragraph', () => {
    const original = 'Same one.\n\nDifferent original.';
    const pipeline = 'Same one.\n\nDifferent pipeline rewrite.';
    const out = diffChapter(original, pipeline);
    expect(out).toHaveLength(1);
    expect(out[0].paragraphIndex).toBe(1);
  });

  it('flags pipeline-only paragraphs as padding', () => {
    const original = 'Para one.';
    const pipeline = 'Para one.\n\nPipeline added this para.';
    const out = diffChapter(original, pipeline);
    expect(out).toHaveLength(1);
    expect(out[0].classification).toBe('padding');
  });
});
