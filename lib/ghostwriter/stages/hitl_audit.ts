/**
 * Stage 6 — Human-in-the-Loop (HITL) Audit
 * ==========================================
 * Scans chapter text and flags every point where a human must remain
 * in the loop. Three categories:
 *
 *   regulatory   — SRA, ICO, FCA, GDPR, AML, legal privilege rules
 *                  require a human practitioner to own the decision.
 *   policy_gate  — board approval, partner sign-off, firm policy mandates.
 *   wisdom_gap   — AI lacks contextual judgment: reputational risk, ethics,
 *                  client relationship nuance, precedent awareness.
 *
 * Output is a structured list of flags + a markdown report.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HITLCategory = 'regulatory' | 'policy_gate' | 'wisdom_gap';

export interface HITLFlag {
  category: HITLCategory;
  excerpt: string;    // flagged sentence (max 200 chars)
  reason: string;     // one-line explanation
  lineHint: number;   // approximate line number in the chapter
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection patterns
// ─────────────────────────────────────────────────────────────────────────────

interface Pattern {
  category: HITLCategory;
  triggers: RegExp[];   // ALL must match in the sentence for a flag
  reason: string;
}

const PATTERNS: Pattern[] = [
  // ── Regulatory ──────────────────────────────────────────────────────────
  {
    category: 'regulatory',
    triggers: [/\b(SRA|Solicitors Regulation Authority)\b/i, /\b(decision|approv|sign|authoris|compli)\w*/i],
    reason: 'SRA regulatory requirement — a qualified solicitor must own this decision',
  },
  {
    category: 'regulatory',
    triggers: [/\b(ICO|Information Commissioner)\b/i],
    reason: 'ICO / data protection — human accountability required under UK GDPR',
  },
  {
    category: 'regulatory',
    triggers: [/\b(FCA|Financial Conduct Authority)\b/i, /\b(decision|approv|report|disclos)\w*/i],
    reason: 'FCA-regulated activity — human sign-off is a regulatory obligation',
  },
  {
    category: 'regulatory',
    triggers: [/\b(GDPR|data protection|personal data)\b/i, /\b(process|shar|transfer|retain|delet)\w*/i],
    reason: 'GDPR / UK data protection — lawful basis and accountability require human oversight',
  },
  {
    category: 'regulatory',
    triggers: [/\b(legal professional privilege|LPP|privileged)\b/i],
    reason: 'Legal professional privilege — waiver risk means a solicitor must assess this',
  },
  {
    category: 'regulatory',
    triggers: [/\b(AML|anti.?money laundering|money laundering|suspicious activity|SAR)\b/i],
    reason: 'AML / POCA — reporting obligations and tipping-off risk require a qualified MLRO decision',
  },
  {
    category: 'regulatory',
    triggers: [/\b(compli\w+)\b/i, /\b(regulat\w+|statutory|mandatory|obligat\w+)\b/i, /\b(decision|approv|sign)\w*/i],
    reason: 'Regulatory compliance decision — human practitioner must confirm',
  },

  // ── Policy gate ─────────────────────────────────────────────────────────
  {
    category: 'policy_gate',
    triggers: [/\b(board|partnership|partners)\b/i, /\b(approv|sign.?off|authoris|ratif)\w*/i],
    reason: 'Board or partnership approval required — firm governance gate',
  },
  {
    category: 'policy_gate',
    triggers: [/\b(managing partner|senior partner|equity partner)\b/i],
    reason: 'Senior partner involvement required — firm policy gate',
  },
  {
    category: 'policy_gate',
    triggers: [/\b(firm policy|company policy|internal policy|policy requires)\b/i],
    reason: 'Firm policy mandates human sign-off at this point',
  },
  {
    category: 'policy_gate',
    triggers: [/\b(authorisation required|requires authorisation|written authorisation)\b/i],
    reason: 'Explicit authorisation requirement — cannot be delegated to AI',
  },

  // ── Wisdom gap ──────────────────────────────────────────────────────────
  {
    category: 'wisdom_gap',
    triggers: [/\b(reputational|reputation)\b/i, /\b(risk|impact|consequence|damage)\w*/i],
    reason: 'Reputational risk assessment requires human judgment — AI cannot weigh firm standing against past context',
  },
  {
    category: 'wisdom_gap',
    triggers: [/\b(ethic\w+|moral\w+|integrity)\b/i, /\b(decision|judgment|consider|assess)\w*/i],
    reason: 'Ethical judgment required — AI cannot reliably weigh competing moral obligations',
  },
  {
    category: 'wisdom_gap',
    triggers: [/\b(client relationship|relationship with the client|long.?standing client)\b/i],
    reason: 'Client relationship context — history and trust cannot be fully captured by AI',
  },
  {
    category: 'wisdom_gap',
    triggers: [/\b(precedent|past cases?|prior matters?)\b/i, /\b(judgment|analogous|similar|applies)\w*/i],
    reason: 'Precedent-based reasoning — experienced practitioner judgment needed',
  },
  {
    category: 'wisdom_gap',
    triggers: [/\b(AI (should|will|can|decides?|determines?|recommends?|concludes?))\b/i, /\b(without human|autonomously|automatically)\b/i],
    reason: 'AI described as making the decision autonomously — human oversight must be inserted',
  },
  {
    category: 'wisdom_gap',
    triggers: [/\b(stakeholder\w*|public interest|wider impact)\b/i, /\b(consequence\w*|implication\w*|effect\w*)\b/i],
    reason: 'Stakeholder or public-interest consequences require human contextual judgment',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core audit function
// ─────────────────────────────────────────────────────────────────────────────

/** Scans chapter text and returns all HITL flags. */
export function auditForHITL(chapterText: string): HITLFlag[] {
  const lines = chapterText.split('\n');
  const flags: HITLFlag[] = [];

  // Split into sentences for more granular matching
  const sentences: Array<{ text: string; lineHint: number }> = [];
  let lineOffset = 0;
  for (const line of lines) {
    const parts = line.match(/[^.!?]+[.!?]*/g) ?? [line];
    for (const part of parts) {
      if (part.trim().length > 20) {
        sentences.push({ text: part.trim(), lineHint: lineOffset + 1 });
      }
    }
    lineOffset++;
  }

  for (const { text, lineHint } of sentences) {
    for (const pattern of PATTERNS) {
      const allMatch = pattern.triggers.every(re => re.test(text));
      if (allMatch) {
        // Avoid duplicate flags for same sentence + category
        const alreadyFlagged = flags.some(
          f => f.lineHint === lineHint && f.category === pattern.category
        );
        if (!alreadyFlagged) {
          flags.push({
            category: pattern.category,
            excerpt: text.slice(0, 200),
            reason: pattern.reason,
            lineHint,
          });
        }
        break; // one flag per sentence per category is enough
      }
    }
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report formatter
// ─────────────────────────────────────────────────────────────────────────────

/** Formats HITL flags as a markdown report for author review. */
export function formatHITLReport(flags: HITLFlag[], chapterNum: number): string {
  const regulatory  = flags.filter(f => f.category === 'regulatory');
  const policyGate  = flags.filter(f => f.category === 'policy_gate');
  const wisdomGap   = flags.filter(f => f.category === 'wisdom_gap');

  const formatSection = (title: string, items: HITLFlag[]): string => {
    if (items.length === 0) return `### ${title} (0)\n_None detected._\n`;
    return `### ${title} (${items.length})\n${items.map(
      f => `- Line ~${f.lineHint}: "${f.excerpt}"\n  → ${f.reason}`
    ).join('\n')}\n`;
  };

  return [
    `## Chapter ${chapterNum} — Human-in-the-Loop Audit`,
    '',
    '> Every item below marks a point where AI assistance must stop and a human must take ownership.',
    '> Items marked **wisdom_gap** also flag areas where keeping the task off AI entirely may be',
    '> the better option until AI judgment matures sufficiently to handle the context safely.',
    '',
    formatSection('Regulatory gates', regulatory),
    formatSection('Policy gates', policyGate),
    formatSection('Wisdom gaps', wisdomGap),
    `**Total flags: ${flags.length}**`,
  ].join('\n');
}
