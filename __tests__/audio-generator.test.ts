/**
 * ElevenLabs Audio Generator tests
 *
 * chunkText(text, maxChars) must:
 *   - return a single chunk when text is shorter than maxChars
 *   - split on sentence boundaries (. ! ?) not mid-sentence
 *   - never produce a chunk exceeding maxChars
 *   - preserve all text across chunks (no content loss)
 *
 * buildAudiobookScript(chapterText) must:
 *   - return a string (the cleaned narration-ready text)
 *   - strip markdown heading markers (# ## ###)
 *   - strip bullet point markers (- * •)
 *   - collapse multiple blank lines to a single blank line
 *
 * buildDiscussionScript(chapterText) must:
 *   - return an array of { speaker: 'host'|'guest', line: string }
 *   - alternate speakers starting with host
 *   - produce at least 4 turns for any non-trivial input
 *   - never produce an empty line for either speaker
 *
 * selectVoice(role) must:
 *   - return a non-empty ElevenLabs voice ID string for 'narrator'
 *   - return a non-empty ElevenLabs voice ID string for 'host'
 *   - return a non-empty ElevenLabs voice ID string for 'guest'
 *   - return different IDs for host and guest
 *
 * buildOutputPath(chapter, type) must:
 *   - return a path ending in Ch{NN}_Audiobook_DRAFT_v1.0_{date}.mp3 for type 'audiobook'
 *   - return a path ending in Ch{NN}_Discussion_DRAFT_v1.0_{date}.mp3 for type 'discussion'
 *   - zero-pad chapter numbers below 10
 */

import {
  chunkText,
  buildAudiobookScript,
  buildDiscussionScript,
  selectVoice,
  buildOutputPath,
} from '../lib/audio-generator';

// ─────────────────────────────────────────────────────────────────────────────
// chunkText
// ─────────────────────────────────────────────────────────────────────────────

describe('chunkText', () => {
  it('returns a single chunk when text is shorter than maxChars', () => {
    const text = 'Hello world. This is a short sentence.';
    const chunks = chunkText(text, 5000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('never produces a chunk exceeding maxChars', () => {
    const text = Array(200).fill('This is a sentence with exactly some words.').join(' ');
    const chunks = chunkText(text, 500);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it('preserves all text content across chunks', () => {
    const text = Array(100).fill('Short sentence here.').join(' ');
    const chunks = chunkText(text, 300);
    const reassembled = chunks.join(' ').replace(/\s+/g, ' ').trim();
    const original = text.replace(/\s+/g, ' ').trim();
    expect(reassembled).toBe(original);
  });

  it('splits on sentence boundaries not mid-sentence', () => {
    const text = 'First sentence ends here. Second sentence starts here. Third sentence follows.';
    const chunks = chunkText(text, 50);
    for (const chunk of chunks) {
      // Each chunk should end with punctuation or be the last chunk
      const trimmed = chunk.trim();
      expect(trimmed).toMatch(/[.!?]$|^.{1,50}$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAudiobookScript
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAudiobookScript', () => {
  it('returns a string', () => {
    expect(typeof buildAudiobookScript('Some chapter text.')).toBe('string');
  });

  it('strips markdown heading markers', () => {
    const input = '# Chapter One\n## Section A\n### Subsection\nBody text.';
    const result = buildAudiobookScript(input);
    expect(result).not.toMatch(/^#+\s/m);
    expect(result).toContain('Chapter One');
    expect(result).toContain('Body text.');
  });

  it('strips bullet point markers', () => {
    const input = 'Intro.\n- First item\n* Second item\n• Third item\nEnd.';
    const result = buildAudiobookScript(input);
    expect(result).not.toMatch(/^[-*•]\s/m);
    expect(result).toContain('First item');
  });

  it('collapses multiple blank lines to a single blank line', () => {
    const input = 'Para one.\n\n\n\nPara two.';
    const result = buildAudiobookScript(input);
    expect(result).not.toMatch(/\n{3,}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDiscussionScript
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDiscussionScript', () => {
  const sampleChapter = `
    AI is transforming law firms in three key ways. First, document automation
    saves significant time. Second, client communication improves. Third,
    compliance monitoring becomes proactive rather than reactive. Law firms
    that adopt these tools early gain a competitive advantage. The SRA has
    indicated that technology adoption is expected. Practice managers need
    practical guidance on where to start.
  `.trim();

  it('returns an array', () => {
    expect(Array.isArray(buildDiscussionScript(sampleChapter))).toBe(true);
  });

  it('rotates through all four panel speakers', () => {
    const turns = buildDiscussionScript(sampleChapter);
    const speakers = new Set(turns.map(t => t.speaker));
    expect(speakers.has('host')).toBe(true);
    expect(speakers.has('guest')).toBe(true);
    expect(speakers.has('barrister_edinburgh')).toBe(true);
    expect(speakers.has('barrister_guernsey')).toBe(true);
  });

  it('starts with the host', () => {
    const turns = buildDiscussionScript(sampleChapter);
    expect(turns[0].speaker).toBe('host');
  });

  it('ends with the host closing the panel', () => {
    const turns = buildDiscussionScript(sampleChapter);
    expect(turns[turns.length - 1].speaker).toBe('host');
  });

  it('produces at least 4 turns', () => {
    const turns = buildDiscussionScript(sampleChapter);
    expect(turns.length).toBeGreaterThanOrEqual(4);
  });

  it('never produces an empty line for either speaker', () => {
    const turns = buildDiscussionScript(sampleChapter);
    for (const turn of turns) {
      expect(turn.line.trim().length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectVoice
// ─────────────────────────────────────────────────────────────────────────────

describe('selectVoice', () => {
  it('returns a non-empty string for narrator', () => {
    expect(selectVoice('narrator').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for host', () => {
    expect(selectVoice('host').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for guest', () => {
    expect(selectVoice('guest').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for barrister_edinburgh', () => {
    expect(selectVoice('barrister_edinburgh').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for barrister_guernsey', () => {
    expect(selectVoice('barrister_guernsey').length).toBeGreaterThan(0);
  });

  it('returns different voice IDs for host and guest', () => {
    expect(selectVoice('host')).not.toBe(selectVoice('guest'));
  });

  it('returns different voice IDs for both barristers', () => {
    expect(selectVoice('barrister_edinburgh')).not.toBe(selectVoice('barrister_guernsey'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildOutputPath
// ─────────────────────────────────────────────────────────────────────────────

describe('buildOutputPath', () => {
  it('produces audiobook filename for type audiobook', () => {
    const p = buildOutputPath(1, 'audiobook');
    expect(p).toMatch(/Ch01_Audiobook_DRAFT_v1\.0_\d{8}\.mp3$/);
  });

  it('produces discussion filename for type discussion', () => {
    const p = buildOutputPath(3, 'discussion');
    expect(p).toMatch(/Ch03_Discussion_DRAFT_v1\.0_\d{8}\.mp3$/);
  });

  it('zero-pads chapter numbers below 10', () => {
    const p = buildOutputPath(5, 'audiobook');
    expect(p).toContain('Ch05_');
  });

  it('does not zero-pad chapter numbers 10 and above', () => {
    const p = buildOutputPath(12, 'audiobook');
    expect(p).toContain('Ch12_');
  });
});
