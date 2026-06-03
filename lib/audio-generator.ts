/**
 * ElevenLabs Audio Generator
 * ===========================
 * Generates audiobook and discussion-style MP3s for The Digital Law Firm
 * using the ElevenLabs text-to-speech API.
 *
 * Voice strategy — target audience:
 *   narrator — English accent, senior/authoritative, 45+ (think senior partner,
 *              Law Society president, measured and assured delivery)
 *   host     — English accent, senior/authoritative, 45+ (discussion anchor,
 *              sets the frame, asks the right questions)
 *   guest    — English accent, practitioner energy, 30–40 (the implementer,
 *              hands-on, explains the "how", slightly faster cadence)
 *
 * Voice cast — full panel:
 *   narrator            — English male, 45+, senior/authoritative (audiobook narrator)
 *   host                — Irish female, 45+, discussion anchor / leadership voice
 *   guest               — Welsh male, 30–40, practice manager / implementer
 *   barrister_edinburgh — Scottish Edinburgh male, 45+, Bar / regulatory perspective
 *   barrister_guernsey  — Channel Islands English male, 40+, offshore / trust law
 *
 * ElevenLabs voice IDs:
 *   George  : JBFqnCBsd6RMkjVDRZzb  — British English male, warm, authoritative (narrator) ✅ confirmed
 *
 * ⚠️  Irish, Welsh, Edinburgh, Guernsey voices need selection from voice library:
 *   elevenlabs.io/voice-library → filter by accent → audition → copy ID → add to .env.local:
 *     ELEVENLABS_VOICE_HOST_IRISH=<id>          Irish female 45+
 *     ELEVENLABS_VOICE_GUEST_WELSH=<id>         Welsh male 30-40
 *     ELEVENLABS_VOICE_BARRISTER_EDINBURGH=<id> Scottish Edinburgh male 45+
 *     ELEVENLABS_VOICE_BARRISTER_GUERNSEY=<id>  Channel Islands male 40+ (use Voice Design if not in library)
 *
 *   Voice Design prompt for Guernsey: "Channel Islands English male, early 40s, barrister, measured and precise"
 */

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Voice registry
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceRole = 'narrator' | 'host' | 'guest' | 'barrister_edinburgh' | 'barrister_guernsey';

/**
 * Returns the ElevenLabs voice ID for the given role.
 * Read from env at call time (not module load time) so dotenv always runs first.
 */
export function selectVoice(role: VoiceRole): string {
  const voices: Record<VoiceRole, string> = {
    narrator:            'JBFqnCBsd6RMkjVDRZzb',                                                         // George — English male, warm, authoritative (45+) ✅
    host:                process.env.ELEVENLABS_VOICE_HOST_IRISH           ?? 'REPLACE_IRISH_FEMALE_45',  // Niamh — Irish female, 45+
    guest:               process.env.ELEVENLABS_VOICE_GUEST_WELSH          ?? 'REPLACE_WELSH_FEMALE',     // Hannah — Welsh female
    barrister_edinburgh: process.env.ELEVENLABS_VOICE_BARRISTER_EDINBURGH  ?? 'REPLACE_EDINBURGH',        // Callum — Scottish Edinburgh
    barrister_guernsey:  process.env.ELEVENLABS_VOICE_BARRISTER_GUERNSEY   ?? 'REPLACE_GUERNSEY',         // Julian — British deep/mature
  };
  return voices[role];
}

// ─────────────────────────────────────────────────────────────────────────────
// Text utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits text into chunks no longer than maxChars, breaking on sentence
 * boundaries (. ! ?) to avoid cutting mid-sentence.
 */
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  // Split into sentences — keep delimiter attached
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart / table detection and accessibility preprocessing
// ─────────────────────────────────────────────────────────────────────────────

export interface ChartBlock {
  start: number;  // char offset in original text
  end: number;    // char offset in original text (exclusive)
  header: string; // first row of the table (column names)
}

/**
 * Detects markdown table blocks in chapter text.
 * A table block is 2+ consecutive lines starting with '|'.
 * Returns an array of block positions and header text.
 */
export function detectChartBlocks(text: string): ChartBlock[] {
  const blocks: ChartBlock[] = [];
  const lines = text.split('\n');

  let blockStart = -1;
  let blockStartChar = 0;
  let headerRow = '';
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith('|');

    if (isTableLine && blockStart === -1) {
      // Start of a new table block
      blockStart = i;
      blockStartChar = charOffset;
      headerRow = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean).join(', ');
    } else if (!isTableLine && blockStart !== -1) {
      // End of a table block — only record if it was at least 2 lines
      const blockLineCount = i - blockStart;
      if (blockLineCount >= 2) {
        blocks.push({ start: blockStartChar, end: charOffset, header: headerRow });
      }
      blockStart = -1;
      headerRow = '';
    }
    charOffset += line.length + 1; // +1 for \n
  }

  // Handle table at end of text
  if (blockStart !== -1 && (lines.length - blockStart) >= 2) {
    blocks.push({ start: blockStartChar, end: charOffset, header: headerRow });
  }

  return blocks;
}

/**
 * Replaces markdown tables with audio-friendly alt-text placeholders.
 * A blind listener hears what the chart shows, not a list of raw numbers.
 *
 * Before: | Year | Revenue | Growth |
 *         |------|---------|--------|
 *         | 2023 | £1.2m   | 12%    |
 *
 * After:  [Chart: see printed edition for full data.
 *          The chart shows Year, Revenue, Growth.]
 */
export function preprocessForAudio(text: string): string {
  const blocks = detectChartBlocks(text);
  if (blocks.length === 0) return text;

  // Replace from end to start so char offsets remain valid
  let result = text;
  for (const block of [...blocks].reverse()) {
    const placeholder = `[Chart: see printed edition for full data. The chart shows ${block.header}.]`;
    result = result.slice(0, block.start) + placeholder + result.slice(block.end);
  }
  return result;
}

/**
 * Cleans a chapter DOCX text into narration-ready prose:
 *   - Replaces chart/table blocks with accessible alt-text
 *   - Strips markdown heading markers (# ## ###)
 *   - Strips bullet point markers (- * •) replacing with prose flow
 *   - Collapses 3+ blank lines into a single blank line
 */
export function buildAudiobookScript(chapterText: string): string {
  return preprocessForAudio(chapterText)
    .replace(/^#{1,6}\s+/gm, '')          // strip heading markers, keep text
    .replace(/^[-*•]\s+/gm, '')           // strip bullet markers, keep text
    .replace(/\n{3,}/g, '\n\n')           // collapse excess blank lines
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Discussion script builder
// ─────────────────────────────────────────────────────────────────────────────

export type Speaker = 'host' | 'guest' | 'barrister_edinburgh' | 'barrister_guernsey';

export interface DiscussionTurn {
  speaker: Speaker;
  line: string;
}

/**
 * Converts a chapter text into a 4-voice panel discussion script:
 *   host                — English 45+, frames the topic
 *   guest               — English 30–40, practice manager perspective
 *   barrister_edinburgh — Scottish Edinburgh 45+, Bar / regulatory perspective
 *   barrister_guernsey  — Guernsey 40+, offshore / trust law perspective
 *
 * Rotation: host → guest → barrister_edinburgh → barrister_guernsey → host...
 *
 * Note: for production, pass --llm-discussion to generate richer dialogue
 * via Claude/Gemini before sending to ElevenLabs.
 */
export function buildDiscussionScript(chapterText: string): DiscussionTurn[] {
  const sentences = chapterText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^[-*•#]+\s*/, '').trim())
    .filter(s => s.length > 40);

  if (sentences.length === 0) {
    return [
      { speaker: 'host',                line: 'Welcome to this chapter overview.' },
      { speaker: 'guest',               line: 'Happy to be here. Let\'s dive straight in.' },
      { speaker: 'barrister_edinburgh', line: 'From a regulatory standpoint, this is timely.' },
      { speaker: 'barrister_guernsey',  line: 'And the offshore implications are equally significant.' },
    ];
  }

  const bridges: Record<Speaker, string[]> = {
    host: [
      'Let\'s start with', 'What\'s the practical takeaway from',
      'Can you expand on', 'How should a practice manager approach',
      'What struck you most about',
    ],
    guest: [
      'In practice,', 'What this means day-to-day is', 'Building on that,',
      'From a practice management perspective,', 'The implementation reality is',
    ],
    barrister_edinburgh: [
      'From the Bar\'s perspective,', 'Regulatory considerations here include',
      'The SRA position on this is', 'Speaking as someone at the Bar,',
      'The professional conduct angle is',
    ],
    barrister_guernsey: [
      'In the Channel Islands context,', 'For offshore practices,',
      'Trust and private client work adds a layer here —', 'Guernsey and Jersey firms face',
      'From a cross-border standpoint,',
    ],
  };

  const rotation: Speaker[] = ['host', 'guest', 'barrister_edinburgh', 'barrister_guernsey'];
  const turns: DiscussionTurn[] = [];

  // Opening round
  turns.push({ speaker: 'host', line: `Welcome. Today's chapter from The Digital Law Firm covers a topic every UK law firm needs to understand. ${sentences[0]}` });
  turns.push({ speaker: 'guest',               line: `${bridges.guest[0]} ${sentences[1] ?? 'this reshapes how we run the practice.'}` });
  turns.push({ speaker: 'barrister_edinburgh', line: `${bridges.barrister_edinburgh[0]} ${sentences[2] ?? 'the professional obligations here are clear.'}` });
  turns.push({ speaker: 'barrister_guernsey',  line: `${bridges.barrister_guernsey[0]} ${sentences[3] ?? 'we see the same pressures across the Crown Dependencies.'}` });

  // Body — rotate through panel
  for (let i = 4; i < sentences.length && turns.length < 24; i++) {
    const speaker = rotation[turns.length % 4];
    const speakerBridges = bridges[speaker];
    const bridge = speakerBridges[(Math.floor(turns.length / 4)) % speakerBridges.length];
    turns.push({ speaker, line: `${bridge} ${sentences[i]}` });
  }

  // Closing round — one line each, host wraps up
  turns.push({ speaker: 'guest',               line: 'The practical steps are clear. Any firm can start this week.' });
  turns.push({ speaker: 'barrister_edinburgh', line: 'And the regulatory framework supports early adoption — there\'s no reason to wait.' });
  turns.push({ speaker: 'barrister_guernsey',  line: 'For international and offshore practices, the competitive advantage is real.' });
  turns.push({ speaker: 'host',                line: 'The Digital Law Firm is available from Law Society Publishing. Thank you all.' });

  return turns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output path builder
// ─────────────────────────────────────────────────────────────────────────────

const GDRIVE_AUDIO_DIR = path.join(
  process.env.HOME ?? '',
  'Library/CloudStorage/GoogleDrive-rajabey68@gmail.com',
  'My Drive/Digital Law firms/Book Method',
  'v2 Complete 12 after CT scuritiny',
  'The_Digital_Law_Firm_Complete_Manuscript_v2.0',
);

/**
 * Returns the full output path for a chapter audio file.
 * Matches the naming convention used for Ch01–Ch08:
 *   Ch{NN}_{Audiobook|Discussion}_DRAFT_v1.0_{YYYYMMDD}.mp3
 */
export function buildOutputPath(chapter: number, type: 'audiobook' | 'discussion'): string {
  const nn = String(chapter).padStart(2, '0');
  const label = type === 'audiobook' ? 'Audiobook' : 'Discussion';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `Ch${nn}_${label}_DRAFT_v1.0_${date}.mp3`;
  return path.join(GDRIVE_AUDIO_DIR, filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// ElevenLabs API client
// ─────────────────────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const MODEL_ID = 'eleven_multilingual_v2';

interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  text: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Calls ElevenLabs TTS API and returns the MP3 buffer.
 * Throws on non-200 responses with the API error message.
 */
export async function generateAudioBuffer(opts: ElevenLabsOptions): Promise<Buffer> {
  const { apiKey, voiceId, text, stability = 0.5, similarityBoost = 0.75 } = opts;

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability, similarity_boost: similarityBoost },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generates a full audiobook MP3 for a chapter by chunking the text
 * and concatenating audio buffers from ElevenLabs.
 */
export async function generateAudiobook(apiKey: string, chapterText: string, outputPath: string): Promise<void> {
  const script = buildAudiobookScript(chapterText);
  const chunks = chunkText(script, 2500); // ElevenLabs recommended max per call
  const buffers: Buffer[] = [];

  console.log(`  Generating audiobook: ${chunks.length} chunk(s)...`);
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`    Chunk ${i + 1}/${chunks.length}...`);
    const buf = await generateAudioBuffer({
      apiKey,
      voiceId: selectVoice('narrator'),
      text: chunks[i],
    });
    buffers.push(buf);
    console.log(' done');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  console.log(`  ✅ Audiobook saved: ${outputPath}`);
}

/**
 * Generates a discussion-style MP3 for a chapter, alternating
 * between host and guest voices.
 */
export async function generateDiscussion(apiKey: string, chapterText: string, outputPath: string): Promise<void> {
  const turns = buildDiscussionScript(chapterText);
  const buffers: Buffer[] = [];

  console.log(`  Generating discussion: ${turns.length} turn(s)...`);
  for (let i = 0; i < turns.length; i++) {
    const { speaker, line } = turns[i];
    process.stdout.write(`    Turn ${i + 1}/${turns.length} (${speaker})...`);
    const stability = speaker === 'host' || speaker === 'barrister_edinburgh' ? 0.55 : 0.45;
    const buf = await generateAudioBuffer({
      apiKey,
      voiceId: selectVoice(speaker as VoiceRole),
      text: line,
      stability,
      similarityBoost: 0.75,
    });
    buffers.push(buf);
    console.log(' done');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  console.log(`  ✅ Discussion saved: ${outputPath}`);
}
