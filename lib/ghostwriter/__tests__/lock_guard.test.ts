import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertWritable, isLocked, expectedSha256, sha256Of, LockError } from '../lock_guard';

/**
 * The guard reads from the real book repo at /Users/arajiv/code/The-Digital-Law-Firm.
 * For deterministic tests we don't depend on the real file — we override DLF_BOOK_REPO
 * to a temp dir and stage a synthetic locks.yaml there.
 */

function withTempBookRepo(locksYaml: string, fn: () => void) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockguard-'));
  fs.mkdirSync(path.join(tmp, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'chapters', '.locks.yaml'), locksYaml);
  const prev = process.env.DLF_BOOK_REPO;
  process.env.DLF_BOOK_REPO = tmp;
  try {
    // The module caches DLF_BOOK_REPO at import time via top-level constants —
    // for these tests we re-require fresh.
    jest.resetModules();
    const fresh = require('../lock_guard');
    fn.call(fresh);
  } finally {
    if (prev !== undefined) process.env.DLF_BOOK_REPO = prev;
    else delete process.env.DLF_BOOK_REPO;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const LOCKED_YAML = `
version: 1
protocol: test
chapters:
  ch01:
    locked: true
    sha256: aaaa
    words: 1541
  ch02:
    locked: false
    sha256: bbbb
    words: 4614
`;

describe('isLocked', () => {
  it('returns true for a locked chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(this.isLocked(1)).toBe(true);
    });
  });

  it('returns false for an explicitly unlocked chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(this.isLocked(2)).toBe(false);
    });
  });

  it('fail-closes on unknown chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(this.isLocked(7)).toBe(true);
    });
  });
});

describe('assertWritable', () => {
  it('throws LockError on a locked chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(() => this.assertWritable(1, 'test write')).toThrow(this.LockError);
    });
  });

  it('does not throw on an unlocked chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(() => this.assertWritable(2, 'test write')).not.toThrow();
    });
  });

  it('honours LOCK_GUARD_OVERRIDE env var', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      process.env.LOCK_GUARD_OVERRIDE = 'I-have-read-the-lock-protocol';
      try {
        expect(() => this.assertWritable(1, 'emergency restore')).not.toThrow();
      } finally {
        delete process.env.LOCK_GUARD_OVERRIDE;
      }
    });
  });

  it('rejects the wrong override value', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      process.env.LOCK_GUARD_OVERRIDE = 'wrong';
      try {
        expect(() => this.assertWritable(1, 'test')).toThrow(this.LockError);
      } finally {
        delete process.env.LOCK_GUARD_OVERRIDE;
      }
    });
  });

  it('rejects chapter numbers outside 1..12', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(() => this.assertWritable(0, 'test')).toThrow();
      expect(() => this.assertWritable(13, 'test')).toThrow();
    });
  });
});

describe('expectedSha256', () => {
  it('returns the recorded sha for a known chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(this.expectedSha256(1)).toBe('aaaa');
    });
  });

  it('returns null for an unknown chapter', () => {
    withTempBookRepo(LOCKED_YAML, function (this: typeof import('../lock_guard')) {
      expect(this.expectedSha256(7)).toBeNull();
    });
  });
});

describe('sha256Of', () => {
  it('produces consistent SHA256 for strings', () => {
    expect(sha256Of('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('matches between Buffer and string input', () => {
    expect(sha256Of('hello')).toBe(sha256Of(Buffer.from('hello')));
  });
});
