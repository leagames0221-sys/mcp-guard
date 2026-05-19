// CLI integration tests — drives the commander program end-to-end
// through `parseAsync` so the per-subcommand action callbacks + main()
// exception handlers + Node-version-gate short-circuit are all
// exercised in the coverage report.
//
// All tests save/restore `process.exitCode` so concurrent vitest files
// (vitest defaults to per-file isolation, sequential within a file)
// cannot leak exit-code state across cases.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, it, expect } from 'vitest';

import { buildProgram, main } from '../../src/cli/index.js';
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

const CLEAN_CONFIG = JSON.stringify({
  mcpServers: {
    api: {
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer redacted-fixture-token' },
    },
  },
});

const DIRTY_HIGH_CONFIG = JSON.stringify({
  mcpServers: {
    bad: { url: 'http://localhost:8080/mcp' }, // SSRF-LOOPBACK = high
  },
});

describe('buildProgram action callbacks — parseAsync drives the full flow', () => {
  let prevExitCode: typeof process.exitCode;
  let prevStdoutWrite: typeof process.stdout.write;
  let prevStderrWrite: typeof process.stderr.write;
  let stdoutCap: ReturnType<typeof captureStream>;
  let stderrCap: ReturnType<typeof captureStream>;

  beforeEach(() => {
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    // Capture process stdout / stderr so action callbacks (which write
    // through process.stdout via the emitters) don't pollute test
    // output. commander's configureOutput is also pointed at the cap.
    stdoutCap = captureStream();
    stderrCap = captureStream();
    prevStdoutWrite = process.stdout.write.bind(process.stdout);
    prevStderrWrite = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string | Uint8Array) => stdoutCap.write(chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = (chunk: string | Uint8Array) => stderrCap.write(chunk);
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = prevStdoutWrite;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = prevStderrWrite;
    process.exitCode = prevExitCode;
  });

  it('scan action: clean config + json format produces exit 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const cfg = join(dir, 'clean.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const program = buildProgram('9.9.9');
      await program.parseAsync([
        'node', 'mcp-guard', 'scan', cfg,
        '--format', 'json',
        '--fail-on-severity', 'low',
      ]);
      expect(process.exitCode).toBe(ExitCode.Success);
      expect(stdoutCap.text).toContain('"results": []');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scan action: dirty config breaches default high floor → exit 1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const cfg = join(dir, 'dirty.json');
      writeFileSync(cfg, DIRTY_HIGH_CONFIG);
      const program = buildProgram('1.0.0');
      await program.parseAsync(['node', 'mcp-guard', 'scan', cfg, '--format', 'json']);
      expect(process.exitCode).toBe(ExitCode.FindingsExceedThreshold);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scan action: invalid --format value throws actionable error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const cfg = join(dir, 'x.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const program = buildProgram('1.0.0');
      program.exitOverride();
      await expect(
        program.parseAsync(['node', 'mcp-guard', 'scan', cfg, '--format', 'xml']),
      ).rejects.toThrow(/console.*json.*sarif/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scan action: invalid --fail-on-severity value throws', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const cfg = join(dir, 'x.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const program = buildProgram('1.0.0');
      program.exitOverride();
      await expect(
        program.parseAsync([
          'node', 'mcp-guard', 'scan', cfg,
          '--fail-on-severity', 'urgent',
        ]),
      ).rejects.toThrow(/severity must be one of/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('inject action: runs against bundled corpus with mock fallback', async () => {
    const program = buildProgram('1.0.0');
    await program.parseAsync(['node', 'mcp-guard', 'inject']);
    // Mock provider produces a mix of pass + fail; harness sets
    // process.exitCode to Success or FindingsExceedThreshold based on
    // the severity-floor gate. Either is a valid action-callback exit
    // for this assertion — the goal is exercising the callback path.
    const code = process.exitCode;
    expect([ExitCode.Success, ExitCode.FindingsExceedThreshold]).toContain(code);
    // Schema marker on the serialized harness report proves the action
    // path actually invoked runInject + serializer.
    expect(stdoutCap.text).toContain('"schema": "mcp-guard-harness-report@1"');
  });

  it('inject action: --severity-floor critical accepted by parseSeverity', async () => {
    const program = buildProgram('1.0.0');
    await program.parseAsync([
      'node', 'mcp-guard', 'inject',
      '--severity-floor', 'critical',
    ]);
    expect(stdoutCap.text).toContain('"severityFloor": "critical"');
  });

  it('suggest action: emits schema-tagged JSON for a valid prior report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const reportPath = join(dir, 'report.json');
      writeFileSync(
        reportPath,
        JSON.stringify({
          schemaVersion: '1.0',
          generatedAt: '2026-05-19T00:00:00.000Z',
          tool: { name: 'mcp-guard', version: '0.0.0' },
          target: '/abs/.mcp.json',
          results: [
            {
              id: 'f-1',
              ruleId: 'SSRF-LOOPBACK',
              severity: 'high',
              source: 'static',
              message: 'localhost target',
            },
          ],
        }),
      );
      const program = buildProgram('1.0.0');
      await program.parseAsync(['node', 'mcp-guard', 'suggest', reportPath]);
      expect(process.exitCode).toBe(ExitCode.Success);
      expect(stdoutCap.text).toContain('"schema": "mcp-guard-suggest-output@1"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('main() exception handler chain', () => {
  let prevExitCode: typeof process.exitCode;
  let prevStdoutWrite: typeof process.stdout.write;
  let prevStderrWrite: typeof process.stderr.write;
  let stdoutCap: ReturnType<typeof captureStream>;
  let stderrCap: ReturnType<typeof captureStream>;

  beforeEach(() => {
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    stdoutCap = captureStream();
    stderrCap = captureStream();
    prevStdoutWrite = process.stdout.write.bind(process.stdout);
    prevStderrWrite = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string | Uint8Array) => stdoutCap.write(chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = (chunk: string | Uint8Array) => stderrCap.write(chunk);
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = prevStdoutWrite;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = prevStderrWrite;
    process.exitCode = prevExitCode;
  });

  it('returns IoError (74) when scan target does not exist', async () => {
    const code = await main([
      'node', 'mcp-guard', 'scan',
      join(tmpdir(), 'mcp-guard-cli-missing-' + Date.now() + '.json'),
      '--format', 'json',
    ]);
    expect(code).toBe(ExitCode.IoError);
    expect(stderrCap.text).toContain('IoError');
  });

  it('returns InvalidInput (2) when suggest target is non-Finding shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const path = join(dir, 'bad.json');
      writeFileSync(path, JSON.stringify({ noresults: true }));
      const code = await main(['node', 'mcp-guard', 'suggest', path]);
      expect(code).toBe(ExitCode.InvalidInput);
      expect(stderrCap.text).toContain('InvalidInputError');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns DataFormatError (65) when suggest target is malformed JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const path = join(dir, 'mal.json');
      writeFileSync(path, '{not valid');
      const code = await main(['node', 'mcp-guard', 'suggest', path]);
      expect(code).toBe(ExitCode.DataFormatError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns a non-zero exit for unknown subcommand', async () => {
    const code = await main(['node', 'mcp-guard', 'totally-not-a-real-command']);
    // commander surfaces unknown commands differently across versions
    // (sometimes a CommanderError with exitCode hint, sometimes a
    // plain Error). main() respects the exitCode hint when present;
    // otherwise falls back to resolveExitCode → InternalError (70).
    // The load-bearing assertion is "non-zero exit", not the specific
    // code.
    expect(code).not.toBe(ExitCode.Success);
  });

  it('returns Success (0) when scan target is clean', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-cli-'));
    try {
      const cfg = join(dir, 'clean.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const code = await main([
        'node', 'mcp-guard', 'scan', cfg,
        '--format', 'json',
        '--fail-on-severity', 'low',
      ]);
      expect(code).toBe(ExitCode.Success);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
