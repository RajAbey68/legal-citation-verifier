/**
 * Programmatic sentence splitter for Ch09.
 * Forces splits at conjunctions when sentence > 20 words.
 * Then LLM cleans up the joins.
 */
import OpenAI from 'openai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/arajiv/legal-citation-verifier/frontend/.env.local' });

const FILE = '/Users/arajiv/Downloads/Digital_Law_Firm_Chapters/chapter_09_the_eu_ai_act_roadmap_readable.md';
const DRIVE_DIR = `${process.env.HOME}/Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/First Author Review`;

// Programmatic forced split
function forceSplitLongSentences(text: string): string {
  // Process paragraph by paragraph
  const paragraphs = text.split(/\n\n+/);
  
  const processed = paragraphs.map(para => {
    // Don't touch headings, code blocks, bullet lists, tables
    if (para.startsWith('#') || para.startsWith('|') || para.startsWith('-') || 
        para.startsWith('*') || para.startsWith('```') || para.startsWith('>')) {
      return para;
    }
    
    // Split into sentences, then re-evaluate
    const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
    
    const result = sentences.map(sent => {
      const words = sent.trim().split(/\s+/);
      if (words.length <= 18) return sent.trim();
      
      // Try to split at first qualifying conjunction (not too early, not too late)
      // Look for split points after word 8
      const splitPatterns = [
        // Relative clause with comma
        /^(.{30,}?),\s+(which|that|where|when)\s/i,
        // Coordinating conjunctions mid-sentence
        /^(.{30,}?),?\s+\b(but|yet|however)\s/i,
        /^(.{35,}?),?\s+\b(and|so|because|although|while|whereas|unless|until)\s/i,
        // Participial phrases
        /^(.{30,}?),\s+(making|providing|ensuring|requiring|allowing|helping|giving)\s/i,
        // Conditional
        /^(.{30,}?),?\s+\bif\s/i,
      ];
      
      for (const pattern of splitPatterns) {
        const m = sent.trim().match(pattern);
        if (m && m[1]) {
          const first = m[1].trim().replace(/[,;]$/, '') + '.';
          const rest = sent.trim().slice(m[1].length).replace(/^[,\s]+/, '');
          const restCapitalised = rest.charAt(0).toUpperCase() + rest.slice(1);
          const firstWords = first.split(/\s+/).length;
          const restWords = restCapitalised.split(/\s+/).length;
          // Only accept if both halves are reasonable
          if (firstWords >= 5 && restWords >= 5) {
            return first + ' ' + restCapitalised;
          }
        }
      }
      
      return sent.trim();
    });
    
    return result.join(' ');
  });
  
  return processed.join('\n\n');
}

// Count words in a string
function countWords(s: string) { return s.split(/\s+/).filter(Boolean).length; }

// Compute raw average sentence length
function avgSentLen(text: string): number {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  if (!sentences.length) return 0;
  const total = sentences.reduce((s, sent) => s + sent.split(/\s+/).length, 0);
  return Math.round(total / sentences.length * 10) / 10;
}

async function run() {
  const draft = fs.readFileSync(FILE, 'utf-8');
  console.log('Ch09 Before split: ASL=' + avgSentLen(draft));
  
  // Step 1: Programmatic split
  const split = forceSplitLongSentences(draft);
  console.log('Ch09 After code split: ASL=' + avgSentLen(split));
  
  // Step 2: LLM cleanup pass to make joins natural
  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, timeout: 600_000 });
  
  const prompt = `You are a plain-English editor. The text below has been mechanically split into shorter sentences. 
Some splits may be awkward. Fix ONLY the awkward splits — make them flow naturally.

RULES:
- Do not re-join sentences. Keep them short.
- Do not add new information.
- Do not remove information.
- Keep ALL citations verbatim: "EU AI Act Article 14", "SRA Code 3.3", "UK GDPR Article 28"
- Keep ALL numbers and percentages verbatim.
- After every 3 sentences of medium length (10-16 words), write one sentence of 5 words or fewer.
  Examples: "That is the requirement." / "Start there." / "No alternative exists." / "Firms cannot ignore this."
- Replace any remaining polysyllabic words where a short synonym exists:
  governance→rules/controls, monitoring→tracking, transparency→openness, 
  regulation→rules/law, classification→category/label, implementation→roll-out/setup,
  assessment→check/review, documentation→records, obligation→duty/must-do

TEXT:
${split}

Return the complete revised text. No preamble. No commentary.`;

  const response = await gpt.chat.completions.create({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 32000,
  });
  
  const revised = response.choices[0].message.content ?? '';
  console.log('Ch09 After LLM cleanup: ASL=' + avgSentLen(revised));
  
  // Import auditReadability dynamically
  const { auditReadability } = await import('/Users/arajiv/legal-citation-verifier/frontend/lib/ghostwriter/stages/readability.ts' as any);
  const audit = auditReadability(9, revised);
  console.log('Ch09 Flesch=' + audit.fleschReadingEase + ' | Grade=' + audit.fleschKincaidGrade);
  
  const origWords = draft.split(/\s+/).length;
  const revWords = revised.split(/\s+/).length;
  if (revised.length === 0 || revWords < origWords * 0.80) {
    console.log('Truncation detected. Not saving.');
    return;
  }
  
  const splitAudit = auditReadability(9, draft);
  if (audit.fleschReadingEase > splitAudit.fleschReadingEase) {
    fs.writeFileSync(FILE, revised, 'utf-8');
    if (fs.existsSync(DRIVE_DIR)) {
      fs.writeFileSync(`${DRIVE_DIR}/chapter_09_readable.md`, revised, 'utf-8');
    }
    console.log('Saved ✅');
  } else {
    console.log('No improvement, not saved.');
  }
}

run().catch(console.error);
