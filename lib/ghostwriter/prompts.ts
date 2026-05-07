export const AUTHOR_VOICES: Record<number, string> = {
  1:  'Rajiv: structured-conversational, concept-led, contrarian framing. Executive tone: direct, calm, no jargon. Pattern: context → reframe → angle → next step. Short declarative sentences; no padding.',
  2:  'Darren: write to "you". Evidence before argument; short declarative sentences. Pattern: scenario → logic → action → outcome.',
  3:  'Rajiv: see Ch1.',
  4:  'Rajiv: see Ch1.',
  5:  'Rajiv: see Ch1.',
  6:  'Darren: see Ch2.',
  7:  'Nick Lockett: triadic structure. Parenthetical precision. Direct attribution: "the SRA requires X". Occasional dry wit; never academic distance.',
  8:  'Nick Lockett: see Ch7.',
  9:  'Nick Lockett: see Ch7.',
  10: 'Rajiv: see Ch1.',
  11: 'Darren: see Ch2.',
  12: 'Darren: see Ch2.',
};

export const KILL_LIST =
  '"X is not just Y" | passive voice where active works | "It is worth noting" | ' +
  '"In order to" | "This highlights the importance of" | "Straightforward" | ' +
  'generic description where specific detail available';

export const TIER_RULES = `Evidence hierarchy:
- TIER 1 (use): Law Society, SRA, EUR-Lex official documents; Legal Futures/Law Gazette (named journalist, dated); Thomson Reuters, Clio reports.
- TIER 2 (label as practitioner-developed): Task Classification Method, Shadow Efficiency, HITL protocol, Story Files.
- TIER 3 (label as illustrative): fictional characters (Sarah, Emily, David).
- DELETE if none apply: "approximately X%", "around X%", "industry average", "studies show" without named Tier 1 source.`;
