import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

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

const CLEAN_CONFIG = JSON.stringify({
  mcpServers: {
    good: {
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer redacted-fixture-token' },
    },
  },
});

// High-severity-only fixture (SSRF-LOOPBACK is severity=high). Lets
// the floor=critical test verify that high-only findings do NOT
// breach a critical floor.
const DIRTY_CONFIG = JSON.stringify({
  mcpServers: {
    bad: {
      url: 'http://localhost:8080/mcp',
    },
  },
});

describe('runScan — clean config', () => {
  it('exits 0 with empty findings on a benign config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'clean.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const stdout = captureStream();
      const { exitCode, report } = await runScan({
        config: cfg,
        format: 'json',
        stdout,
        failOnSeverity: 'low',
      });
      expect(exitCode).toBe(ExitCode.Success);
      expect(report.results.length).toBe(0);
      expect(stdout.text).toContain('"results": []');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runScan — dirty config', () => {
  it('exits 1 when high-severity finding present at default floor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'dirty.json');
      writeFileSync(cfg, DIRTY_CONFIG);
      const stdout = captureStream();
      const { exitCode, report } = await runScan({
        config: cfg,
        format: 'json',
        stdout,
      });
      expect(report.results.length).toBeGreaterThan(0);
      expect(exitCode).toBe(ExitCode.FindingsExceedThreshold);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 when finding is below configured fail-on-severity floor', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'dirty.json');
      writeFileSync(cfg, DIRTY_CONFIG);
      const stdout = captureStream();
      const { exitCode } = await runScan({
        config: cfg,
        format: 'json',
        stdout,
        failOnSeverity: 'critical',
      });
      expect(exitCode).toBe(ExitCode.Success);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runScan — format dispatch', () => {
  it('writes SARIF to --output path when format=sarif', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'clean.json');
      const out = join(dir, 'report.sarif');
      writeFileSync(cfg, CLEAN_CONFIG);
      const stdout = captureStream();
      await runScan({ config: cfg, format: 'sarif', output: out, stdout });
      const sarif = JSON.parse(readFileSync(out, 'utf-8'));
      expect(sarif.version).toBe('2.1.0');
      expect(stdout.text).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes JSON to stdout when format=json + no --output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'clean.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const stdout = captureStream();
      await runScan({ config: cfg, format: 'json', stdout });
      const parsed = JSON.parse(stdout.text);
      expect(parsed.schemaVersion).toBe('1.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('default format=console emits human-readable to stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-scan-'));
    try {
      const cfg = join(dir, 'clean.json');
      writeFileSync(cfg, CLEAN_CONFIG);
      const stdout = captureStream();
      await runScan({ config: cfg, stdout });
      expect(stdout.text.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
