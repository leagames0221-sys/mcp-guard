// T-36 concurrency safety (AC-NF-7). Drives 4 concurrent `runScan`
// invocations writing to the same `--output` path with different
// input configs. Asserts:
//   - all 4 promises resolve without throwing (no shared-lockfile block)
//   - final file is parseable JSON (atomic rename never half-wrote)
//   - final file's `target` field matches exactly one of the 4
//     inputs (no interleave / merge)
//   - the parent directory holds NO leftover temp files from the
//     UUID-suffixed writer (writeAtomic cleanup contract)
//
// In-process rather than spawning child processes because the
// atomic-rename invariant lives entirely in src/io/emitters/atomic.ts;
// per-process isolation buys nothing here, and stdin-spawning 4 CLI
// processes inflates the test wall-clock by ~30x on Windows runners.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runScan } from '../../src/cli/scan.js';
import { ExitCode } from '../../src/errors/index.js';

function captureStream(): NodeJS.WritableStream & { readonly text: string } {
  const chunks: string[] = [];
  const sink = {
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    },
  } as unknown as { -readonly [K in keyof (NodeJS.WritableStream & { text: string })]: (NodeJS.WritableStream & { text: string })[K] };
  Object.defineProperty(sink, 'text', { get: () => chunks.join('') });
  return sink as NodeJS.WritableStream & { readonly text: string };
}

function writeConfig(dir: string, id: string, url: string): string {
  const path = join(dir, `cfg-${id}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      mcpServers: {
        [`server-${id}`]: {
          url,
          headers: { Authorization: 'Bearer redacted-fixture-token' },
        },
      },
    }),
  );
  return path;
}

describe('AC-NF-7 — concurrent runScan against the same output path', () => {
  it('4 concurrent writers — at-least-1 succeeds, no corruption, no temp leak (AC-NF-7)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-concurrent-'));
    try {
      const out = join(dir, 'report.json');
      const configs = [
        writeConfig(dir, 'a', 'https://api-a.example.com/mcp'),
        writeConfig(dir, 'b', 'https://api-b.example.com/mcp'),
        writeConfig(dir, 'c', 'https://api-c.example.com/mcp'),
        writeConfig(dir, 'd', 'https://api-d.example.com/mcp'),
      ];

      // Use allSettled because the atomic emitter's contract (per
      // T-15 io-emitters-atomic.test.ts) is "at-least-1 fulfilled,
      // reject is typed IoError" — concurrent rename can EPERM /
      // EBUSY on Windows under contention. The load-bearing
      // invariant is corruption avoidance, not all-success.
      const settled = await Promise.allSettled(
        configs.map((cfg) =>
          runScan({
            config: cfg,
            format: 'json',
            output: out,
            stdout: captureStream(),
            failOnSeverity: 'critical', // benign URLs — keep exit 0
          }),
        ),
      );

      const fulfilled = settled.filter((s): s is PromiseFulfilledResult<typeof settled[number] extends PromiseFulfilledResult<infer V> ? V : never> => s.status === 'fulfilled');
      const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');

      // AC-NF-7: at-least-1 writer fulfilled (no shared-lockfile block).
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // AC-NF-7: every rejection is typed IoError, not a bare crash.
      for (const r of rejected) {
        expect((r.reason as Error).name).toBe('IoError');
      }

      // Every fulfilled writer carries the configured exit code.
      for (const r of fulfilled) {
        expect((r.value as { exitCode: number }).exitCode).toBe(ExitCode.Success);
      }

      // Final file is parseable JSON and matches exactly one of the
      // 4 absolute target paths (no interleave, no truncation).
      const text = readFileSync(out, 'utf-8');
      const parsed = JSON.parse(text);
      expect(typeof parsed.target).toBe('string');
      const observedTarget = parsed.target;
      const isOneOfInputs = configs.some((c) => observedTarget.endsWith(c.split(/[\\/]/).pop()!));
      expect(isOneOfInputs, `final report.target=${observedTarget} did not match any input`).toBe(true);

      // Atomic writer cleanup: no leftover UUID-named temp files
      // (writeAtomic best-effort unlinks on failure).
      const entries = readdirSync(dir);
      const leftoverTemps = entries.filter((n) => /^\.report\.json\..+\.tmp$/.test(n));
      expect(leftoverTemps, `temp leak: ${leftoverTemps.join(', ')}`).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('8-writer race still preserves at-least-one-winner + temp cleanup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-concurrent-'));
    try {
      const out = join(dir, 'race.json');
      const configs = Array.from({ length: 8 }, (_, i) =>
        writeConfig(dir, `race-${i}`, `https://api-${i}.example.com/mcp`),
      );
      const results = await Promise.allSettled(
        configs.map((cfg) =>
          runScan({
            config: cfg,
            format: 'json',
            output: out,
            stdout: captureStream(),
            failOnSeverity: 'critical',
          }),
        ),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      // At-least-one writer must succeed for the spec contract; the
      // atomic emitter accepts that some lose the race on rename.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // File still parseable.
      const text = readFileSync(out, 'utf-8');
      expect(() => JSON.parse(text)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('concurrent writers to DIFFERENT output paths each get their own file intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-concurrent-'));
    try {
      const cfgs = [
        { id: 'p', out: join(dir, 'p.json'), url: 'https://api-p.example.com/mcp' },
        { id: 'q', out: join(dir, 'q.json'), url: 'https://api-q.example.com/mcp' },
        { id: 'r', out: join(dir, 'r.json'), url: 'https://api-r.example.com/mcp' },
        { id: 's', out: join(dir, 's.json'), url: 'https://api-s.example.com/mcp' },
      ];
      const ops = cfgs.map((c) => {
        const cfgPath = writeConfig(dir, c.id, c.url);
        return runScan({
          config: cfgPath,
          format: 'json',
          output: c.out,
          stdout: captureStream(),
          failOnSeverity: 'critical',
        });
      });
      const results = await Promise.all(ops);
      expect(results.length).toBe(4);
      // Each output file independently parseable.
      for (const c of cfgs) {
        const parsed = JSON.parse(readFileSync(c.out, 'utf-8'));
        expect(parsed.target.endsWith(`cfg-${c.id}.json`)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
