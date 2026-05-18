import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, stat, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeAtomic, buildTempPath } from '../../src/io/emitters/index.js';
import { IoError } from '../../src/errors/index.js';

// T-15 / AC-NF-7: writeAtomic = writeFile(temp) → rename(temp → final).
// The reader either sees the previous file or the full new one — never a
// truncated partial. Temp filename carries a UUID so two concurrent
// writers cannot collide on the staging path.

async function makeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mcp-guard-atomic-'));
}

describe('buildTempPath', () => {
  it('emits dot-prefixed temp filename in the target directory', () => {
    const t = buildTempPath('/some/dir/report.json', 'abc-123');
    expect(t).toBe(join('/some/dir', '.report.json.abc-123.tmp'));
  });

  it('uses a randomUUID() by default (each call distinct)', () => {
    const a = buildTempPath('/x/out.json');
    const b = buildTempPath('/x/out.json');
    expect(a).not.toBe(b);
    // UUID v4 shape inside the filename
    expect(a).toMatch(/\.out\.json\.[0-9a-f-]{36}\.tmp$/);
  });
});

describe('writeAtomic — happy path', () => {
  it('writes content to the target and leaves no temp files behind', async () => {
    const dir = await makeDir();
    try {
      const target = join(dir, 'out.json');
      await writeAtomic(target, '{"hello":"world"}\n');

      const text = await readFile(target, 'utf-8');
      expect(text).toBe('{"hello":"world"}\n');

      // No stray .tmp files left in the directory
      const entries = await readdir(dir);
      expect(entries).toEqual(['out.json']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites a pre-existing target atomically (rename semantics)', async () => {
    const dir = await makeDir();
    try {
      const target = join(dir, 'out.txt');
      await writeAtomic(target, 'first');
      const before = await stat(target);

      // brief delay so mtime differentiation is measurable on coarse fs
      await new Promise((r) => setTimeout(r, 10));

      await writeAtomic(target, 'second');
      const after = await stat(target);

      const text = await readFile(target, 'utf-8');
      expect(text).toBe('second');
      // size differs, and the directory still contains only the target
      expect(after.size).not.toBe(before.size);
      const entries = await readdir(dir);
      expect(entries).toEqual(['out.txt']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts Uint8Array content', async () => {
    const dir = await makeDir();
    try {
      const target = join(dir, 'bin');
      const bytes = new Uint8Array([0x68, 0x69, 0x0a]); // "hi\n"
      await writeAtomic(target, bytes);
      const round = await readFile(target);
      expect(Array.from(round)).toEqual(Array.from(bytes));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('writeAtomic — error path', () => {
  it('throws IoError with target + tempPath + code when parent dir is missing', async () => {
    const bogus = join(tmpdir(), `mcp-guard-no-such-dir-${Date.now()}`, 'out.json');
    try {
      await writeAtomic(bogus, 'x');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IoError);
      const details = (err as IoError).details ?? {};
      expect(details.target).toBe(bogus);
      expect(typeof details.tempPath).toBe('string');
      expect(details.code).toBe('ENOENT');
    }
  });

  it('cleans up the temp file when an error happens mid-write', async () => {
    // Construct a scenario where writeFile succeeds but rename fails: we
    // pass a target whose final path is a directory (EISDIR or EPERM on
    // rename). Verifies no stray tmp file leaks afterward.
    const dir = await makeDir();
    try {
      const blockingDir = join(dir, 'iam-a-dir');
      await mkdir(blockingDir);

      await expect(writeAtomic(blockingDir, 'x')).rejects.toBeInstanceOf(IoError);

      // The temp file (.iam-a-dir.<uuid>.tmp) must not linger
      const entries = await readdir(dir);
      const stray = entries.filter((e) => e.endsWith('.tmp'));
      expect(stray).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('writeAtomic — AC-NF-7 concurrent safety', () => {
  it('two concurrent writes to the same target produce one valid final file', async () => {
    const dir = await makeDir();
    try {
      const target = join(dir, 'race.json');
      const A = JSON.stringify({ who: 'A', payload: 'a'.repeat(2000) });
      const B = JSON.stringify({ who: 'B', payload: 'b'.repeat(2000) });

      const results = await Promise.allSettled([
        writeAtomic(target, A),
        writeAtomic(target, B),
      ]);

      // AC-NF-7 surface = "no corruption". At least one writer must
      // succeed; any failure must be a typed IoError (no surprise throw).
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(IoError);
        }
      }

      // Final file is exactly one of the two writers' contents — no
      // truncation, no interleaving.
      const final = await readFile(target, 'utf-8');
      expect([A, B]).toContain(final);

      // Directory clean: only the target survives, no orphan .tmp.
      const entries = await readdir(dir);
      expect(entries).toEqual(['race.json']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('eight concurrent writers settle without corruption + no temp leakage', async () => {
    const dir = await makeDir();
    try {
      const target = join(dir, 'octo.json');
      const payloads = Array.from({ length: 8 }, (_, i) =>
        JSON.stringify({ writer: i, blob: 'x'.repeat(500) }),
      );

      const settled = await Promise.allSettled(
        payloads.map((p) => writeAtomic(target, p)),
      );

      // At least one writer wins the rename race; any losers fail
      // with a typed IoError (Windows MoveFileExW can refuse a
      // sharing-violation rename — that is acceptable corruption-
      // avoidance behaviour, not corruption).
      const fulfilled = settled.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      for (const r of settled) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(IoError);
        }
      }

      // Final file is exactly one of the payloads — never truncated
      // or interleaved.
      const final = await readFile(target, 'utf-8');
      expect(payloads).toContain(final);

      // Directory is clean. Even failed writers cleaned up their
      // temp file (verified by the error-path cleanup behaviour).
      const entries = await readdir(dir);
      expect(entries).toEqual(['octo.json']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
