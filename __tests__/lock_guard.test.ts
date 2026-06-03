/**
 * lock_guard.ts — wiring tests for the chapter write-lock guard.
 *
 * The guard's job is single-purpose: refuse writes to chapters that are
 * marked `locked: true` in chapters/.locks.yaml unless LOCK_GUARD_OVERRIDE
 * is set. These tests exercise that contract directly so any regression
 * surfaces immediately, independent of the scripts that consume it
 * (readability_rewrite, sync-chapter, apply_chapter_decisions, etc.).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REAL_BOOK_REPO = process.env.DLF_BOOK_REPO;

function withTempLocks(yaml: string, fn: () => void) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dlf-locks-'));
  fs.mkdirSync(path.join(tmpRoot, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'chapters', '.locks.yaml'), yaml, 'utf-8');
  process.env.DLF_BOOK_REPO = tmpRoot;
  jest.resetModules();
  try {
    fn();
  } finally {
    if (REAL_BOOK_REPO === undefined) delete process.env.DLF_BOOK_REPO;
    else process.env.DLF_BOOK_REPO = REAL_BOOK_REPO;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

const LOCKED_YAML = `version: 1
chapters:
  ch07:
    locked: true
    sha256: "abc123"
    words: 6630
`;

const UNLOCKED_YAML = `version: 1
chapters:
  ch07:
    locked: false
    sha256: "abc123"
    words: 6630
`;

describe('lock_guard.assertWritable', () => {
  afterEach(() => {
    delete process.env.LOCK_GUARD_OVERRIDE;
  });

  it('throws LockError when the chapter is locked', () => {
    withTempLocks(LOCKED_YAML, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable, LockError } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(7, 'unit test')).toThrow(LockError);
    });
  });

  it('allows the write when the chapter is unlocked', () => {
    withTempLocks(UNLOCKED_YAML, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(7, 'unit test')).not.toThrow();
    });
  });

  it('fails closed on unknown chapter (missing entry = locked)', () => {
    withTempLocks(LOCKED_YAML, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable, LockError } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(3, 'unit test')).toThrow(LockError);
    });
  });

  it('bypasses the lock when LOCK_GUARD_OVERRIDE is set to the exact token', () => {
    withTempLocks(LOCKED_YAML, () => {
      process.env.LOCK_GUARD_OVERRIDE = 'I-have-read-the-lock-protocol';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(7, 'emergency restore')).not.toThrow();
    });
  });

  it('does NOT bypass the lock when LOCK_GUARD_OVERRIDE is any other value', () => {
    withTempLocks(LOCKED_YAML, () => {
      process.env.LOCK_GUARD_OVERRIDE = 'yes';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable, LockError } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(7, 'unit test')).toThrow(LockError);
    });
  });

  it('rejects chapter numbers outside 1..12', () => {
    withTempLocks(LOCKED_YAML, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { assertWritable } = require('../lib/ghostwriter/lock_guard');
      expect(() => assertWritable(0, 'unit test')).toThrow(/1\.\.12/);
      expect(() => assertWritable(13, 'unit test')).toThrow(/1\.\.12/);
    });
  });
});

describe('lock_guard.sha256Of', () => {
  it('produces a stable hex digest for the same input', () => {
    withTempLocks(LOCKED_YAML, () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sha256Of } = require('../lib/ghostwriter/lock_guard');
      const a = sha256Of('hello');
      const b = sha256Of('hello');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
