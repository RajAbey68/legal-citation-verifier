/**
 * Skool Post Template Engine
 * ==========================
 * Generates ready-to-post Skool content from chapter pipeline outputs.
 * All posts are brand-anonymous — no tool names, no vendor mentions.
 *
 * Template types:
 *   production_note   — pipeline/production status updates (internal)
 *   quality_review    — Four-Eyes report summary for author community
 *   chapter_question  — [QUESTION] post for community engagement
 *   hitl_alert        — human-in-the-loop flag summary
 *   chapter_release   — chapter published announcement
 */

import type { HITLFlag } from '../ghostwriter/stages/hitl_audit';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChapterMeta {
  chapterNum: number;
  chapterTitle: string;
  wordCount?: number;
  fleschScore?: number;
  date?: string; // ISO YYYY-MM-DD, defaults to today
}

export interface QueuedPost {
  type: 'post' | 'comment';
  title: string;
  content: string;
  group_id?: string;
  root_id?: string;
  parent_id?: string;
  template_type: string;
  chapter?: number;
  schedule_at?: string; // ISO timestamp for future scheduling
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function chapterLabel(n: number): string {
  return `Chapter ${String(n).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: Production Note
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal production status post — pipeline run complete, stats attached.
 */
export function productionNoteTemplate(
  meta: ChapterMeta,
  notes: string[],
): QueuedPost {
  const date = meta.date ?? today();
  const ch = chapterLabel(meta.chapterNum);
  const stats = [
    meta.wordCount   ? `Words: ${meta.wordCount.toLocaleString()}` : null,
    meta.fleschScore ? `Readability: ${meta.fleschScore}/100` : null,
  ].filter(Boolean).join(' · ');

  return {
    type: 'post',
    template_type: 'production_note',
    chapter: meta.chapterNum,
    title: `[PRODUCTION NOTE — ${date}] ${ch}: ${meta.chapterTitle}`,
    content: [
      `Pipeline run complete for ${ch}: ${meta.chapterTitle}.`,
      stats ? `\n${stats}` : '',
      '',
      ...notes.map(n => `- ${n}`),
    ].join('\n').trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: Quality Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarises the Four-Eyes report for the author community.
 * Strips any internal flags marked REWRITE BEFORE RELEASE.
 */
export function qualityReviewTemplate(
  meta: ChapterMeta,
  fourEyesSummary: string,
  topIssues: string[],
  status: 'pass' | 'conditional' | 'rewrite',
): QueuedPost {
  const date = meta.date ?? today();
  const ch = chapterLabel(meta.chapterNum);

  const statusLine: Record<typeof status, string> = {
    pass:        '✅ Status: Passes Four-Eyes review.',
    conditional: '⚠️ Status: Conditional pass — minor revisions noted below.',
    rewrite:     '🔁 Status: Revision required before release.',
  };

  return {
    type: 'post',
    template_type: 'quality_review',
    chapter: meta.chapterNum,
    title: `[QUALITY REVIEW — ${date}] ${ch}: ${meta.chapterTitle}`,
    content: [
      statusLine[status],
      '',
      fourEyesSummary,
      '',
      topIssues.length > 0 ? 'Key points for author review:' : '',
      ...topIssues.map(i => `- ${i}`),
    ].join('\n').trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: Community Question
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [QUESTION] post to drive community engagement on a chapter theme.
 */
export function communityQuestionTemplate(
  meta: ChapterMeta,
  question: string,
  context: string,
  options?: string[],
): QueuedPost {
  const ch = chapterLabel(meta.chapterNum);

  return {
    type: 'post',
    template_type: 'chapter_question',
    chapter: meta.chapterNum,
    title: `[QUESTION] ${ch}: ${question.slice(0, 80)}`,
    content: [
      context,
      '',
      options && options.length > 0
        ? 'Options:\n' + options.map((o, i) => `${i + 1}. ${o}`).join('\n')
        : '',
      '',
      `This question comes from ${ch}: ${meta.chapterTitle} of The Digital Law Firm.`,
    ].join('\n').trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: HITL Alert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarises human-in-the-loop flags for author awareness.
 * Does NOT share full excerpts — keeps it at category level.
 */
export function hitlAlertTemplate(
  meta: ChapterMeta,
  flags: HITLFlag[],
): QueuedPost {
  const date = meta.date ?? today();
  const ch = chapterLabel(meta.chapterNum);

  const regulatory = flags.filter(f => f.category === 'regulatory').length;
  const policyGate = flags.filter(f => f.category === 'policy_gate').length;
  const wisdomGap  = flags.filter(f => f.category === 'wisdom_gap').length;

  return {
    type: 'post',
    template_type: 'hitl_alert',
    chapter: meta.chapterNum,
    title: `[HITL AUDIT — ${date}] ${ch}: ${meta.chapterTitle}`,
    content: [
      `Human-in-the-loop audit complete for ${ch}: ${meta.chapterTitle}.`,
      '',
      `Regulatory gates: ${regulatory}`,
      `Policy gates: ${policyGate}`,
      `Wisdom gaps: ${wisdomGap}`,
      `Total flags: ${flags.length}`,
      '',
      flags.length > 0
        ? 'Each flag marks a point where AI assistance must pause and a human must own the decision. Wisdom gap items additionally identify areas where keeping the task off AI entirely may be the better option until the technology matures.'
        : 'No flags raised. Chapter is clean for autonomous pipeline processing.',
    ].join('\n').trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template: Chapter Release
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public-facing announcement when a chapter ships to community.
 */
export function chapterReleaseTemplate(
  meta: ChapterMeta,
  summary: string,
  keyTakeaways: string[],
): QueuedPost {
  const ch = chapterLabel(meta.chapterNum);

  return {
    type: 'post',
    template_type: 'chapter_release',
    chapter: meta.chapterNum,
    title: `${ch} is live: ${meta.chapterTitle}`,
    content: [
      summary,
      '',
      'Key takeaways:',
      ...keyTakeaways.map(t => `- ${t}`),
      '',
      'Available now in The Digital Law Firm — Law Society Publishing.',
    ].join('\n').trim(),
  };
}
