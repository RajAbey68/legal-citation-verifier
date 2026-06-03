/**
 * Audio chart/diagram detection tests
 *
 * detectChartBlocks — finds markdown table ranges in chapter text
 * preprocessForAudio — replaces tables with accessible alt-descriptions
 */

import { detectChartBlocks, preprocessForAudio } from '../lib/audio-generator';

const SAMPLE_WITH_TABLE = `
This chapter explains the efficiency gains from AI adoption.

| Metric           | Before AI | After AI |
|------------------|-----------|----------|
| Time per matter  | 4.5 hours | 1.2 hours |
| Error rate       | 12%       | 3%        |
| Cost per matter  | £480      | £130      |

Firms that adopted AI early saw the greatest improvements.
`.trim();

const SAMPLE_NO_TABLE = `
Sarah opened the file. She had three probate letters to draft before lunch.
The first was straightforward — a standard executor notification.
No tables, no charts, just prose.
`.trim();

const SAMPLE_MULTI_TABLE = `
Chapter overview.

| Column A | Column B |
|----------|----------|
| Value 1  | Value 2  |

Some text in between.

| Year | Revenue |
|------|---------|
| 2023 | £1.2m   |
| 2024 | £1.8m   |

End of chapter.
`.trim();

describe('detectChartBlocks', () => {
  it('returns empty array for text with no tables', () => {
    expect(detectChartBlocks(SAMPLE_NO_TABLE)).toHaveLength(0);
  });

  it('detects a single markdown table', () => {
    const blocks = detectChartBlocks(SAMPLE_WITH_TABLE);
    expect(blocks.length).toBe(1);
  });

  it('returns start and end character positions', () => {
    const blocks = detectChartBlocks(SAMPLE_WITH_TABLE);
    expect(blocks[0].start).toBeGreaterThanOrEqual(0);
    expect(blocks[0].end).toBeGreaterThan(blocks[0].start);
  });

  it('extracts the header row text', () => {
    const blocks = detectChartBlocks(SAMPLE_WITH_TABLE);
    expect(blocks[0].header).toContain('Metric');
  });

  it('detects multiple tables', () => {
    const blocks = detectChartBlocks(SAMPLE_MULTI_TABLE);
    expect(blocks.length).toBe(2);
  });
});

describe('preprocessForAudio', () => {
  it('returns unchanged text when no tables present', () => {
    expect(preprocessForAudio(SAMPLE_NO_TABLE)).toBe(SAMPLE_NO_TABLE);
  });

  it('replaces table with accessible placeholder', () => {
    const result = preprocessForAudio(SAMPLE_WITH_TABLE);
    expect(result).toContain('[Chart:');
    expect(result).toContain('see printed edition');
  });

  it('does not contain raw table pipe characters after processing', () => {
    const result = preprocessForAudio(SAMPLE_WITH_TABLE);
    // No lines should start with | after processing
    const lines = result.split('\n');
    const tableLines = lines.filter(l => l.trim().startsWith('|'));
    expect(tableLines).toHaveLength(0);
  });

  it('preserves surrounding prose', () => {
    const result = preprocessForAudio(SAMPLE_WITH_TABLE);
    expect(result).toContain('This chapter explains');
    expect(result).toContain('Firms that adopted AI early');
  });

  it('includes the header description in the placeholder', () => {
    const result = preprocessForAudio(SAMPLE_WITH_TABLE);
    expect(result).toContain('Metric');
  });
});
