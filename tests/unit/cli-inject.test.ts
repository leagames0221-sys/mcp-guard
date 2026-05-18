import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

import { runInject } from '../../src/cli/inject.js';
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

const CORPUS_DIR = join(process.cwd(), 'src', 'probes', 'owasp');

describe('runInject — defaults', () => {
  it('runs against bundled corpus with mock fallback and emits report JSON on stdout', async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const { exitCode, report } = await runInject({ corpusDir: CORPUS_DIR, stdout, stderr });
    expect(stdout.text.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdout.text);
    expect(parsed.schema).toBe('mcp-guard-harness-report@1');
    expect(parsed.providerUsed).toBe('mock');
    expect(parsed.fallbackToMock).toBe(true);
    // exit gate matches the harness's shouldExitNonZero decision.
    if (report.shouldExitNonZero) {
      expect(exitCode).toBe(ExitCode.FindingsExceedThreshold);
    } else {
      expect(exitCode).toBe(ExitCode.Success);
    }
  });

  it('warns on stderr when falling back to mock', async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    await runInject({ corpusDir: CORPUS_DIR, stdout, stderr });
    expect(stderr.text).toContain('no provider supplied');
  });
});

describe('runInject — severity floor mapping', () => {
  it('exit gate respects --severity-floor critical', async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const { exitCode, report } = await runInject({
      corpusDir: CORPUS_DIR,
      severityFloor: 'critical',
      stdout,
      stderr,
    });
    // Same probes, but only critical-severity fails count.
    const criticalFailures = report.results.filter(
      (r) => !r.verdict.pass && r.severity === 'critical',
    ).length;
    if (criticalFailures > 0) {
      expect(exitCode).toBe(ExitCode.FindingsExceedThreshold);
    } else {
      expect(exitCode).toBe(ExitCode.Success);
    }
  });
});
