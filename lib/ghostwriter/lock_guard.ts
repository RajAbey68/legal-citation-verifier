/**
 * Chapter write-lock guard — TypeScript companion to scripts/lock_guard.py
 * in the book repo at /Users/arajiv/code/The-Digital-Law-Firm/.
 *
 * Any TS script that writes chapter content (readability_rewrite, sync-chapter,
 * apply_chapter_decisions, etc.) MUST call assertWritable(N) before any write.
 * Locked chapters refuse writes with a clear LockError message.
 *
 * The lock state lives in /Users/arajiv/code/The-Digital-Law-Firm/chapters/.locks.yaml
 * (the same file the Python guard reads). Single source of truth across languages.
 *
 * Emergency override (restore-from-backup only):
 *     LOCK_GUARD_OVERRIDE=I-have-read-the-lock-protocol npx tsx scripts/your-script.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const BOOK_REPO =
  process.env.DLF_BOOK_REPO ?? '/Users/arajiv/code/The-Digital-Law-Firm';
const LOCKS_PATH = path.join(BOOK_REPO, 'chapters', '.locks.yaml');
const AUDIT_LOG = path.join(BOOK_REPO, 'state', 'skool-sync.log');

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

interface LockEntry {
  locked: boolean;
  sha256?: string;
  words?: number;
  locked_at?: string;
  locked_reason?: string;
  unlock_reason?: string | null;
}

interface LocksFile {
  version?: number;
  protocol?: string;
  chapters?: Record<string, LockEntry>;
}

/**
 * Minimal YAML parser for the .locks.yaml shape.
 * The file uses simple indented key/value pairs with no anchors, no flow
 * collections, no multiline strings beyond what folding handles. A full YAML
 * dependency would be overkill; this 30-line parser handles our exact schema.
 *
 * If the parser fails (unexpected schema change), fall back to fail-closed:
 * treat every chapter as locked.
 */
function parseLocksYaml(raw: string): LocksFile {
  const out: LocksFile = { chapters: {} };
  const lines = raw.split('\n');
  let inChapters = false;
  let currentKey: string | null = null;
  let currentEntry: LockEntry | null = null;

  const setTopLevel = (key: string, value: string) => {
    if (key === 'version') out.version = parseInt(value, 10);
    else if (key === 'protocol') out.protocol = value;
  };

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trimStart();

    if (indent === 0) {
      if (line.startsWith('chapters:')) {
        inChapters = true;
        currentKey = null;
        currentEntry = null;
        continue;
      }
      const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (m) {
        inChapters = false;
        setTopLevel(m[1], m[2].replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    if (!inChapters) continue;

    // Two-space indent = chapter key. Four-space indent = field of current chapter.
    if (indent === 2) {
      const m = line.match(/^(ch\d{2}):\s*$/);
      if (m) {
        currentKey = m[1];
        currentEntry = { locked: true };
        out.chapters![currentKey] = currentEntry;
      }
    } else if (indent >= 4 && currentEntry && currentKey) {
      const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (!m) continue;
      const [, field, valueRaw] = m;
      const value = valueRaw.replace(/^["']|["']$/g, '');
      switch (field) {
        case 'locked':
          currentEntry.locked = value === 'true';
          break;
        case 'sha256':
          currentEntry.sha256 = value;
          break;
        case 'words':
          currentEntry.words = parseInt(value, 10);
          break;
        case 'locked_at':
          currentEntry.locked_at = value;
          break;
        case 'locked_reason':
          currentEntry.locked_reason = value;
          break;
        case 'unlock_reason':
          currentEntry.unlock_reason = value === 'null' ? null : value;
          break;
      }
    }
  }
  return out;
}

function loadLocks(): LocksFile {
  if (!fs.existsSync(LOCKS_PATH)) {
    throw new Error(
      `Lock file not found at ${LOCKS_PATH}. Cannot proceed with chapter writes until the lock file exists.`,
    );
  }
  const raw = fs.readFileSync(LOCKS_PATH, 'utf-8');
  try {
    return parseLocksYaml(raw);
  } catch {
    // Fail closed: if we can't parse the locks file, treat every chapter as locked.
    return { chapters: {} };
  }
}

function chapterKey(chapterNum: number): string {
  if (chapterNum < 1 || chapterNum > 12) {
    throw new Error(`chapterNum must be 1..12, got ${chapterNum}`);
  }
  return `ch${chapterNum.toString().padStart(2, '0')}`;
}

/** True iff the chapter is currently locked. Unknown chapters fail closed (treated as locked). */
export function isLocked(chapterNum: number): boolean {
  const locks = loadLocks();
  const entry = locks.chapters?.[chapterKey(chapterNum)];
  if (!entry) return true;
  return entry.locked !== false;
}

/** The locked sha256 for the chapter, or null if not locked / unknown. */
export function expectedSha256(chapterNum: number): string | null {
  const locks = loadLocks();
  return locks.chapters?.[chapterKey(chapterNum)]?.sha256 ?? null;
}

/**
 * Throws LockError if the chapter is locked. Call BEFORE any write to a
 * chapter draft or Skool lesson module.
 *
 *     await assertWritable(8, 'rewrite for readability');
 *
 * Emergency bypass:
 *     LOCK_GUARD_OVERRIDE=I-have-read-the-lock-protocol
 */
export function assertWritable(chapterNum: number, intent = 'write to chapter'): void {
  if (process.env.LOCK_GUARD_OVERRIDE === 'I-have-read-the-lock-protocol') {
    process.stderr.write(
      `[lock_guard] OVERRIDE active — allowing ${intent} on Ch${chapterNum
        .toString()
        .padStart(2, '0')}. ` +
        'This bypass MUST be set deliberately and removed after the operation.\n',
    );
    return;
  }
  if (isLocked(chapterNum)) {
    throw new LockError(
      `Ch${chapterNum.toString().padStart(2, '0')} is LOCKED. Refusing to ${intent}.\n` +
        `  To unlock: edit ${LOCKS_PATH} — set locked=false and add unlock_reason.\n` +
        `  Or for emergency restore: export LOCK_GUARD_OVERRIDE=I-have-read-the-lock-protocol`,
    );
  }
}

/** SHA256 of content (utf-8 if string). */
export function sha256Of(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Append one line to state/skool-sync.log. */
export function appendAudit(
  chapterNum: number,
  sha: string,
  actor: string,
  detail = '',
): void {
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  const ts = new Date().toISOString();
  const line = `${ts} — Ch${chapterNum
    .toString()
    .padStart(2, '0')} — sha=${sha.slice(0, 16)} — actor=${actor} — ${detail}\n`;
  fs.appendFileSync(AUDIT_LOG, line);
}
