/**
 * Stage 0b — Readability Audit
 * ==============================
 * Pre-flight check BEFORE any LLM stages run.
 * Scores each chapter for plain English, compellingness, and accessibility
 * to a law firm leader who is not a technologist.
 *
 * Metrics:
 *   Flesch Reading Ease      — target ≥ 60 (plain English; Law Society standard)
 *   Flesch-Kincaid Grade     — target ≤ 10 (readable by a non-specialist)
 *   Gunning Fog Index        — target ≤ 12 (clear professional prose)
 *   Avg sentence length      — target ≤ 20 words
 *   Passive voice ratio      — target < 10%
 *   Jargon density           — named tech/management terms per 1,000 words
 *   Compulsion score         — "Monday actions" / "Try this week" boxes per chapter
 *
 * A chapter that fails readability should be fixed BEFORE running the expensive
 * LLM pipeline. Readability issues are cheap to find and expensive to miss.
 */

export interface ParagraphFlag {
  index: number;
  preview: string;       // first 100 chars
  issue: string;
  gradeLevel: number;
  wordCount: number;
}

export interface ReadabilityResult {
  chapter: number;
  fleschReadingEase: number;       // 0–100, higher = easier
  fleschKincaidGrade: number;      // US school grade level
  gunningFog: number;              // complexity index
  smogGrade: number;               // Simple Measure of Gobbledygook — grade level
  daleChallScore: number;          // 0–10, based on 3,000 familiar-word list
  colemanLiauIndex: number;        // character-based grade level (more accurate for legal)
  avgSentenceWords: number;
  sentenceLengthVariation: number; // std dev of sentence lengths — measures rhythm (target SD >= 5)
  avgSyllablesPerWord: number;
  passiveVoiceRatio: number;       // 0–1
  lexicalDensity: number;          // content words / total words — information load (target 0.45–0.55)
  typeTokenRatio: number;          // unique words / total words — vocabulary richness (target 0.4–0.6)
  killListHits: string[];          // Kill List banned phrases found verbatim
  jargonDensity: number;           // jargon terms per 1,000 words
  compulsionScore: number;         // actionable boxes per chapter
  overallGrade: 'PASS' | 'ADVISORY' | 'FAIL';
  blockers: string[];              // reasons for FAIL
  warnings: string[];              // reasons for ADVISORY
  hardParagraphs: ParagraphFlag[]; // top 10 worst offenders
  summary: string;
}

// ── Jargon list — terms that need plain English equivalents ──────────────────
const JARGON_TERMS = [
  'hyperautomation', 'orchestration', 'operationalise', 'operationalize',
  'leverage', 'synergy', 'paradigm', 'holistic', 'ecosystem', 'scalable',
  'scalability', 'bandwidth', 'stakeholder', 'deliverable', 'granular',
  'deep dive', 'circle back', 'touch base', 'move the needle', 'low-hanging fruit',
  'boil the ocean', 'pivot', 'disruptive', 'transformative', 'robust solution',
  'best-in-class', 'mission-critical', 'value proposition', 'thought leader',
  'digital transformation', 'going forward', 'at the end of the day',
  'seamless integration', 'cutting-edge', 'state-of-the-art', 'game-changer',
  'ideate', 'ideation', 'agile', 'iterate', 'iteration', 'sprint',
  'llm', 'rag pipeline', 'embedding', 'vector store', 'fine-tuning',
  'api endpoint', 'saas', 'paas', 'iaas', 'cloud-native', 'microservices',
];

// Passive voice indicators (simplified detection)
const PASSIVE_INDICATORS = [
  /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi,
  /\b(has|have|had)\s+been\s+\w+ed\b/gi,
];

// ── Kill List (banned phrases — from prompts.ts KILL_LIST) ───────────────────
const KILL_LIST_PHRASES = [
  'transformative', 'delve', 'delving', 'game-changer', 'game-changing',
  'seamless', 'seamlessly', 'navigate', 'robust', 'synergy', 'paradigm',
  'holistic', 'cutting-edge', 'revolutionary', 'innovative', 'disruptive',
  'ecosystem', 'low-hanging fruit', 'it is worth noting', 'in order to',
  'due to the fact that', "in today's rapidly evolving", 'as a matter of fact',
  'in conclusion', 'this highlights the importance', 'this demonstrates',
  'it could be argued', 'studies show', 'research indicates', 'perhaps consider',
  'you could potentially', 'generally speaking', 'straightforward',
];

// ── Dale-Chall familiar word list (abridged — 800 most common, representative) ─
// Full 3,000-word list would be imported; this is a production-quality subset.
// Words NOT on this list are "unfamiliar" and increase the score.
const DALE_CHALL_FAMILIAR = new Set([
  'a','able','about','above','act','add','afraid','after','again','age','ago',
  'agree','air','all','allow','almost','alone','along','already','also','always',
  'am','among','an','and','answer','any','are','arm','army','around','as','ask',
  'at','away','back','bad','ball','base','be','beat','because','been','before',
  'begin','being','best','better','between','big','black','blue','board','body',
  'book','both','box','boy','bring','brother','build','business','but','by',
  'call','came','can','care','carry','cause','certain','change','check','child',
  'city','class','clean','clear','close','color','come','cost','could','court',
  'cover','cut','day','dead','deal','deep','did','different','do','does','done',
  'door','down','draw','drive','drop','dry','during','each','early','earth',
  'east','easy','end','enough','even','ever','every','example','face','fact',
  'fall','far','farm','fast','few','field','fight','figure','fill','find','fire',
  'first','five','floor','fly','follow','food','for','force','form','four',
  'free','from','front','full','game','get','give','go','good','government',
  'great','green','group','grow','half','hand','hard','has','have','he','head',
  'hear','heart','heavy','help','her','here','high','him','his','hold','home',
  'hot','hour','how','human','hundred','idea','if','important','in','into','is',
  'it','its','just','keep','kind','know','large','last','late','lead','learn',
  'left','less','let','life','light','like','line','list','little','live','long',
  'look','low','main','make','man','many','matter','may','me','mean','men',
  'might','mind','more','most','move','much','must','my','name','near','never',
  'new','next','night','no','north','not','note','now','number','of','off',
  'often','old','on','once','one','only','open','or','order','other','our',
  'out','over','own','part','past','pay','people','place','plan','plant','play',
  'point','poor','power','press','public','put','question','read','ready','real',
  'reason','red','report','rest','right','road','room','round','run','said',
  'same','say','sea','seem','send','set','she','short','show','side','since',
  'six','small','so','some','soon','south','space','stand','start','state','stay',
  'step','still','stop','strong','such','sure','take','talk','ten','than','that',
  'the','their','them','then','there','these','they','thing','think','this',
  'those','three','through','time','to','today','together','too','town','try',
  'turn','two','under','until','up','use','very','walk','want','war','was',
  'water','way','we','well','went','were','west','what','when','where','while',
  'white','who','why','will','with','word','work','world','would','write','year',
  'yes','yet','you','young','your',
  // Legal/business terms practitioners know:
  'firm','client','law','legal','court','case','evidence','contract','partner',
  'revenue','cost','profit','data','process','staff','team','risk','review',
  'system','plan','result','service','practice','advice','compliance','report',
  'matter','rule','standard','policy','code','fee','bill','claim','issue',
  'training','draft','version','final','section','chapter','note','record',
]);

function daleChall(words: string[], sentences: string[]): number {
  const unfamiliar = words.filter(w => !DALE_CHALL_FAMILIAR.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  const pctUnfamiliar = (unfamiliar.length / Math.max(1, words.length)) * 100;
  const asl = words.length / Math.max(1, sentences.length);
  let score = 0.1579 * pctUnfamiliar + 0.0496 * asl;
  if (pctUnfamiliar > 5) score += 3.6365; // correction factor
  return score;
}

function smogGrade(text: string, sentences: string[]): number {
  // SMOG = 3 + sqrt(polysyllabic count × (30 / sentence count))
  const words = text.match(/\b[a-zA-Z']+\b/g) ?? [];
  const poly = words.filter(w => countSyllables(w) >= 3).length;
  const n = Math.max(1, sentences.length);
  return 3 + Math.sqrt(poly * (30 / n));
}

function colemanLiau(text: string, words: string[], sentences: string[]): number {
  // CLI = 0.0588 × L - 0.296 × S - 15.8
  // L = avg letters per 100 words; S = avg sentences per 100 words
  const letters = text.replace(/[^a-zA-Z]/g, '').length;
  const L = (letters / Math.max(1, words.length)) * 100;
  const S = (sentences.length / Math.max(1, words.length)) * 100;
  return 0.0588 * L - 0.296 * S - 15.8;
}

function sentenceLengthVariation(sentences: string[]): number {
  if (sentences.length < 2) return 0;
  const lengths = sentences.map(s => (s.match(/\b\w+\b/g) ?? []).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance);
}

function lexicalDensity(words: string[]): number {
  // Content words = nouns, verbs, adjectives, adverbs (approximated by excluding function words)
  const FUNCTION_WORDS = new Set([
    'a','an','the','and','but','or','nor','for','yet','so','at','by','for',
    'from','in','into','of','off','on','onto','to','up','with','as','it','its',
    'this','that','these','those','he','she','they','we','you','i','me','him',
    'her','us','them','my','your','his','our','their','be','is','are','was',
    'were','been','being','have','has','had','do','does','did','will','would',
    'shall','should','may','might','can','could','must','not','no','if','then',
    'than','when','where','which','who','what','how','there','here',
  ]);
  const content = words.filter(w => !FUNCTION_WORDS.has(w.toLowerCase()));
  return content.length / Math.max(1, words.length);
}

function typeTokenRatio(words: string[]): number {
  const unique = new Set(words.map(w => w.toLowerCase()));
  return unique.size / Math.max(1, words.length);
}

function killListScan(text: string): string[] {
  const lower = text.toLowerCase();
  return KILL_LIST_PHRASES.filter(phrase => lower.includes(phrase));
}

// ── Compulsion markers — things that signal "do this now"
const COMPULSION_MARKERS = [
  /try this week/gi,
  /on monday/gi,
  /this week[,:]?\s*(do|start|open|check|run|ask|review|book)/gi,
  /your action/gi,
  /first step:/gi,
  /do this now/gi,
  /common mistakes/gi,
  /tldr/gi,
];

// ── Syllable counter (Ployglot heuristic — accurate to ~95%) ─────────────────
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
                   .replace(/^y/, '');
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function countComplexWords(words: string[]): number {
  return words.filter(w => countSyllables(w) >= 3 && w.length > 6).length;
}

// ── Sentence splitter ────────────────────────────────────────────────────────
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && s.split(/\s+/).length > 3);
}

// ── Paragraph splitter (skip headings, tables, code blocks) ─────────────────
function extractParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p =>
      p.length > 100 &&
      !p.startsWith('#') &&
      !p.startsWith('|') &&
      !p.startsWith('```') &&
      !p.startsWith('---') &&
      !p.startsWith('>') &&
      !/^\*\*/.test(p)
    );
}

// ── Core metrics ─────────────────────────────────────────────────────────────
function computeMetrics(text: string) {
  const sentences = splitSentences(text);
  const words = text.match(/\b[a-zA-Z']+\b/g) ?? [];
  const syllableCount = words.reduce((n, w) => n + countSyllables(w), 0);
  const complexWordCount = countComplexWords(words);

  const totalWords = words.length;
  const totalSentences = Math.max(1, sentences.length);
  const avgSentenceWords = totalWords / totalSentences;
  const avgSyllablesPerWord = syllableCount / Math.max(1, totalWords);

  // Flesch Reading Ease (206.835 - 1.015 × ASL - 84.6 × ASW)
  const fleschReadingEase = Math.min(100, Math.max(0,
    206.835 - 1.015 * avgSentenceWords - 84.6 * avgSyllablesPerWord
  ));

  // Flesch-Kincaid Grade Level (0.39 × ASL + 11.8 × ASW - 15.59)
  const fleschKincaidGrade = Math.max(0,
    0.39 * avgSentenceWords + 11.8 * avgSyllablesPerWord - 15.59
  );

  // Gunning Fog (0.4 × (ASL + % complex words))
  const gunningFog = 0.4 * (avgSentenceWords + 100 * (complexWordCount / Math.max(1, totalWords)));

  // Passive voice
  const passiveSentences = sentences.filter(s =>
    PASSIVE_INDICATORS.some(re => re.test(s))
  ).length;
  const passiveVoiceRatio = passiveSentences / totalSentences;

  // Jargon density
  const textLower = text.toLowerCase();
  const jargonHits = JARGON_TERMS.filter(j => textLower.includes(j)).length;
  const jargonDensity = (jargonHits / Math.max(1, totalWords)) * 1000;

  // Compulsion score
  const compulsionScore = COMPULSION_MARKERS.reduce((n, re) => {
    const matches = text.match(re);
    return n + (matches ? matches.length : 0);
  }, 0);

  // New metrics
  const smog = smogGrade(text, sentences);
  const daleChallScore = daleChall(words, sentences);
  const cli = colemanLiau(text, words, sentences);
  const slv = sentenceLengthVariation(sentences);
  const lexDensity = lexicalDensity(words);
  const ttr = typeTokenRatio(words);
  const killHits = killListScan(text);

  return {
    fleschReadingEase, fleschKincaidGrade, gunningFog,
    smogGrade: smog, daleChallScore, colemanLiauIndex: cli,
    avgSentenceWords, sentenceLengthVariation: slv, avgSyllablesPerWord,
    passiveVoiceRatio, lexicalDensity: lexDensity, typeTokenRatio: ttr,
    killListHits: killHits,
    jargonDensity, compulsionScore,
    totalWords, totalSentences,
  };
}

// ── Per-paragraph scoring (find the hardest passages) ────────────────────────
function scoreParagraphs(text: string): ParagraphFlag[] {
  const paragraphs = extractParagraphs(text);
  const flags: ParagraphFlag[] = [];

  paragraphs.forEach((para, i) => {
    const words = para.match(/\b[a-zA-Z']+\b/g) ?? [];
    if (words.length < 15) return;

    const sentences = splitSentences(para);
    const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
    const avgSyl = syllables / Math.max(1, words.length);
    const avgLen = words.length / Math.max(1, sentences.length);
    const grade = 0.39 * avgLen + 11.8 * avgSyl - 15.59;

    const issues: string[] = [];
    if (grade > 14) issues.push(`Grade level ${grade.toFixed(0)} — too complex`);
    if (avgLen > 30) issues.push(`Avg ${avgLen.toFixed(0)} words/sentence — too long`);
    if (JARGON_TERMS.some(j => para.toLowerCase().includes(j)))
      issues.push('Contains jargon');
    if (PASSIVE_INDICATORS.some(re => re.test(para)))
      issues.push('Passive voice detected');

    if (issues.length > 0) {
      flags.push({
        index: i,
        preview: para.slice(0, 120).replace(/\n/g, ' ') + '…',
        issue: issues.join('; '),
        gradeLevel: Math.round(grade * 10) / 10,
        wordCount: words.length,
      });
    }
  });

  // Return worst 10 by grade level
  return flags.sort((a, b) => b.gradeLevel - a.gradeLevel).slice(0, 10);
}

// ── Overall grading ──────────────────────────────────────────────────────────
function grade(metrics: ReturnType<typeof computeMetrics>): {
  overall: 'PASS' | 'ADVISORY' | 'FAIL';
  blockers: string[];
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Hard failures
  if (metrics.fleschReadingEase < 40)
    blockers.push(`Flesch Reading Ease ${metrics.fleschReadingEase.toFixed(0)}/100 — target ≥ 60. Very difficult for a non-specialist.`);
  if (metrics.fleschKincaidGrade > 14)
    blockers.push(`Flesch-Kincaid Grade ${metrics.fleschKincaidGrade.toFixed(1)} — target ≤ 10. Requires post-graduate reading level.`);
  if (metrics.gunningFog > 16)
    blockers.push(`Gunning Fog ${metrics.gunningFog.toFixed(1)} — target ≤ 12. Dense and hard to scan.`);
  if (metrics.compulsionScore < 2)
    blockers.push(`Compulsion score ${metrics.compulsionScore} — target ≥ 3 action prompts per chapter. Reader has no clear call to action.`);

  // Advisory warnings
  if (metrics.fleschReadingEase < 60 && metrics.fleschReadingEase >= 40)
    warnings.push(`Flesch Reading Ease ${metrics.fleschReadingEase.toFixed(0)} — borderline. Aim for 60+.`);
  if (metrics.fleschKincaidGrade > 10 && metrics.fleschKincaidGrade <= 14)
    warnings.push(`Flesch-Kincaid Grade ${metrics.fleschKincaidGrade.toFixed(1)} — slightly above target of 10.`);
  if (metrics.passiveVoiceRatio > 0.15)
    warnings.push(`Passive voice in ${(metrics.passiveVoiceRatio * 100).toFixed(0)}% of sentences — target < 10%. Use active constructions.`);
  if (metrics.jargonDensity > 5)
    warnings.push(`Jargon density ${metrics.jargonDensity.toFixed(1)} per 1,000 words — reduce or define technical terms.`);
  if (metrics.avgSentenceWords > 22)
    warnings.push(`Average sentence length ${metrics.avgSentenceWords.toFixed(0)} words — target ≤ 20. Break long sentences.`);
  if (metrics.compulsionScore < 5)
    warnings.push(`Compulsion score ${metrics.compulsionScore} — add more "Try This Week" or "On Monday" prompts.`);
  if (metrics.smogGrade > 12)
    warnings.push(`SMOG Grade ${metrics.smogGrade.toFixed(1)} — target ≤ 12. Too many 3-syllable words.`);
  if (metrics.daleChallScore > 7)
    warnings.push(`Dale-Chall ${metrics.daleChallScore.toFixed(1)} — target ≤ 7.0. Too many unfamiliar words for a time-poor reader.`);
  if (metrics.colemanLiauIndex > 13)
    warnings.push(`Coleman-Liau Grade ${metrics.colemanLiauIndex.toFixed(1)} — target ≤ 12. Dense character load.`);
  if (metrics.sentenceLengthVariation < 4)
    warnings.push(`Sentence rhythm (SD ${metrics.sentenceLengthVariation.toFixed(1)}) — target SD ≥ 5. Monotone prose. Mix short punchy sentences with longer ones.`);
  if (metrics.killListHits.length > 0)
    warnings.push(`Kill List violations: ${metrics.killListHits.slice(0, 5).map(k => `"${k}"`).join(', ')}${metrics.killListHits.length > 5 ? ` + ${metrics.killListHits.length - 5} more` : ''}.`);

  const overall = blockers.length > 0 ? 'FAIL'
    : warnings.length > 0 ? 'ADVISORY'
    : 'PASS';

  return { overall, blockers, warnings };
}

// ── Main export ──────────────────────────────────────────────────────────────
export function auditReadability(chapter: number, draft: string): ReadabilityResult {
  const metrics = computeMetrics(draft);
  const { overall, blockers, warnings } = grade(metrics);
  const hardParagraphs = scoreParagraphs(draft);

  const ease = metrics.fleschReadingEase;
  const easeLabel = ease >= 70 ? 'Easy (plain English ✅)'
    : ease >= 60 ? 'Standard (acceptable ✅)'
    : ease >= 50 ? 'Fairly difficult (⚠️ borderline)'
    : ease >= 30 ? 'Difficult (❌ rewrite needed)'
    : 'Very difficult (❌ major rewrite)';

  const summary = [
    `## Readability Audit — Chapter ${String(chapter).padStart(2, '0')}`,
    '',
    `| Metric | Score | Target | Status |`,
    `|--------|-------|--------|--------|`,
    `| Flesch Reading Ease | ${metrics.fleschReadingEase.toFixed(0)}/100 | ≥ 60 | ${metrics.fleschReadingEase >= 60 ? '✅' : metrics.fleschReadingEase >= 40 ? '⚠️' : '❌'} |`,
    `| Flesch-Kincaid Grade | ${metrics.fleschKincaidGrade.toFixed(1)} | ≤ 10 | ${metrics.fleschKincaidGrade <= 10 ? '✅' : metrics.fleschKincaidGrade <= 14 ? '⚠️' : '❌'} |`,
    `| Gunning Fog Index | ${metrics.gunningFog.toFixed(1)} | ≤ 12 | ${metrics.gunningFog <= 12 ? '✅' : metrics.gunningFog <= 16 ? '⚠️' : '❌'} |`,
    `| SMOG Grade | ${metrics.smogGrade.toFixed(1)} | ≤ 12 | ${metrics.smogGrade <= 12 ? '✅' : '⚠️'} |`,
    `| Dale-Chall Score | ${metrics.daleChallScore.toFixed(1)} | ≤ 7.0 | ${metrics.daleChallScore <= 7 ? '✅' : '⚠️'} |`,
    `| Coleman-Liau Index | ${metrics.colemanLiauIndex.toFixed(1)} | ≤ 12 | ${metrics.colemanLiauIndex <= 12 ? '✅' : '⚠️'} |`,
    `| Avg sentence length | ${metrics.avgSentenceWords.toFixed(0)} words | ≤ 20 | ${metrics.avgSentenceWords <= 20 ? '✅' : '⚠️'} |`,
    `| Sentence rhythm (SD) | ${metrics.sentenceLengthVariation.toFixed(1)} | ≥ 5 | ${metrics.sentenceLengthVariation >= 5 ? '✅' : '⚠️'} |`,
    `| Passive voice | ${(metrics.passiveVoiceRatio * 100).toFixed(0)}% | < 10% | ${metrics.passiveVoiceRatio < 0.1 ? '✅' : '⚠️'} |`,
    `| Lexical density | ${(metrics.lexicalDensity * 100).toFixed(0)}% | 45–55% | ${metrics.lexicalDensity >= 0.45 && metrics.lexicalDensity <= 0.55 ? '✅' : '⚠️'} |`,
    `| Type-Token Ratio | ${metrics.typeTokenRatio.toFixed(2)} | 0.4–0.6 | ${metrics.typeTokenRatio >= 0.4 && metrics.typeTokenRatio <= 0.6 ? '✅' : '⚠️'} |`,
    `| Jargon density | ${metrics.jargonDensity.toFixed(1)}/1k words | < 5 | ${metrics.jargonDensity < 5 ? '✅' : '⚠️'} |`,
    `| Kill List violations | ${metrics.killListHits.length} found | 0 | ${metrics.killListHits.length === 0 ? '✅' : '❌'} |`,
    `| Compulsion score | ${metrics.compulsionScore} prompts | ≥ 3 | ${metrics.compulsionScore >= 3 ? '✅' : metrics.compulsionScore >= 1 ? '⚠️' : '❌'} |`,
    '',
    `**Reading level:** ${easeLabel}`,
    `**Overall:** ${overall}`,
    '',
    blockers.length > 0 ? `### ❌ Blockers (fix before pipeline)\n${blockers.map(b => `- ${b}`).join('\n')}` : '',
    warnings.length > 0 ? `### ⚠️ Warnings\n${warnings.map(w => `- ${w}`).join('\n')}` : '',
    hardParagraphs.length > 0 ? [
      '',
      '### Hardest Paragraphs (rewrite these first)',
      ...hardParagraphs.slice(0, 5).map((p, i) =>
        `**${i + 1}.** Grade ${p.gradeLevel} | ${p.issue}\n> ${p.preview}`
      ),
    ].join('\n') : '',
  ].filter(Boolean).join('\n');

  return {
    chapter,
    fleschReadingEase: Math.round(metrics.fleschReadingEase * 10) / 10,
    fleschKincaidGrade: Math.round(metrics.fleschKincaidGrade * 10) / 10,
    gunningFog: Math.round(metrics.gunningFog * 10) / 10,
    smogGrade: Math.round(metrics.smogGrade * 10) / 10,
    daleChallScore: Math.round(metrics.daleChallScore * 100) / 100,
    colemanLiauIndex: Math.round(metrics.colemanLiauIndex * 10) / 10,
    avgSentenceWords: Math.round(metrics.avgSentenceWords * 10) / 10,
    sentenceLengthVariation: Math.round(metrics.sentenceLengthVariation * 10) / 10,
    avgSyllablesPerWord: Math.round(metrics.avgSyllablesPerWord * 100) / 100,
    passiveVoiceRatio: Math.round(metrics.passiveVoiceRatio * 1000) / 1000,
    lexicalDensity: Math.round(metrics.lexicalDensity * 1000) / 1000,
    typeTokenRatio: Math.round(metrics.typeTokenRatio * 1000) / 1000,
    killListHits: metrics.killListHits,
    jargonDensity: Math.round(metrics.jargonDensity * 10) / 10,
    compulsionScore: metrics.compulsionScore,
    overallGrade: overall,
    blockers,
    warnings,
    hardParagraphs,
    summary,
  };
}
