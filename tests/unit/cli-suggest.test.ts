import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { runSuggest, readReport } from '../../src/cli/suggest.js';
import { DataFormatError, InvalidInputError, IoError } from '../../src/errors/index.js';
import type { Finding } from '../../src/io/emitters/json.js';
import type { LlmProvider } from '../../src/providers/llm/types.js';

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

function writeReport(dir: string, findings: Finding[], extras: Record<string, unknown> = {}): string {
  const path = join(dir, 'report.json');
  const body = {
    schemaVersion: '1.0',
    generatedAt: '2026-05-19T00:00:00.000Z',
    tool: { name: 'mcp-guard', version: '0.0.0' },
    target: '/abs/.mcp.json',
    results: findings,
    ...extras,
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}

function mkFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'f-1',
    ruleId: over.ruleId ?? 'SSRF-LOOPBACK',
    severity: over.severity ?? 'high',
    source: 'static',
    message: 'sample',
    ...over,
  };
}

class ScriptedProvider implements LlmProvider {
  readonly name = 'mock' as const;
  constructor(private readonly outputs: string[] = [], private readonly healthy = true) {}
  private idx = 0;
  async generate(): Promise<string> {
    const out = this.outputs[this.idx] ?? '';
    this.idx += 1;
    return out;
  }
  async health(): Promise<boolean> {
    return this.healthy;
  }
}

describe('readReport — error mapping', () => {
  it('maps ENOENT to IoError (exit 74)', async () => {
    await expect(readReport(join(tmpdir(), 'mcp-guard-suggest-missing.json'))).rejects.toThrow(IoError);
  });

  it('maps malformed JSON to DataFormatError (exit 65)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = join(dir, 'bad.json');
      writeFileSync(path, '{not valid json');
      await expect(readReport(path)).rejects.toThrow(DataFormatError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-object JSON root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = join(dir, 'arr.json');
      writeFileSync(path, '[]');
      await expect(readReport(path)).rejects.toThrow(InvalidInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects report missing results array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = join(dir, 'noresults.json');
      writeFileSync(path, '{"schemaVersion":"1.0"}');
      await expect(readReport(path)).rejects.toThrow(InvalidInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects report whose results[i] is not a Finding shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = join(dir, 'badfinding.json');
      writeFileSync(
        path,
        JSON.stringify({
          schemaVersion: '1.0',
          results: [{ id: 'x' }],
        }),
      );
      await expect(readReport(path)).rejects.toThrow(InvalidInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects severity outside the allowed enum', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = join(dir, 'badsev.json');
      writeFileSync(
        path,
        JSON.stringify({
          schemaVersion: '1.0',
          results: [{ id: 'f', ruleId: 'SSRF-LOOPBACK', severity: 'urgent', source: 'static', message: 'x' }],
        }),
      );
      await expect(readReport(path)).rejects.toThrow(InvalidInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a valid clean report (results: [])', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const path = writeReport(dir, []);
      const r = await readReport(path);
      expect(r.results).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runSuggest — AC-003-4 (suggest <report.json>)', () => {
  it('emits JSON-parseable output with schema marker on stdout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const reportPath = writeReport(dir, [mkFinding({ id: 'f-1', ruleId: 'SSRF-LOOPBACK' })]);
      const stdout = captureStream();
      const stderr = captureStream();
      const result = await runSuggest({ reportPath, stdout, stderr });
      const parsed = JSON.parse(stdout.text);
      expect(parsed.schema).toBe('mcp-guard-suggest-output@1');
      expect(parsed.count).toBe(1);
      expect(parsed.remediations[0].findingId).toBe('f-1');
      expect(parsed.remediations[0].source).toBe('template');
      expect(result.usedLlm).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs against multiple findings preserving order', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const reportPath = writeReport(dir, [
        mkFinding({ id: 'a', ruleId: 'SSRF-LOOPBACK' }),
        mkFinding({ id: 'b', ruleId: 'CMDINJ-SHELL-METACHAR' }),
        mkFinding({ id: 'c', ruleId: 'AUTH-GAP-WEAK-BEARER' }),
      ]);
      const stdout = captureStream();
      const stderr = captureStream();
      const r = await runSuggest({ reportPath, stdout, stderr });
      expect(r.remediations.map((x) => x.findingId)).toEqual(['a', 'b', 'c']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flips usedLlm=true when provider supplied + healthy + produces output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const reportPath = writeReport(dir, [mkFinding()]);
      const stdout = captureStream();
      const stderr = captureStream();
      const p = new ScriptedProvider(['enriched body']);
      const r = await runSuggest({ reportPath, provider: p, stdout, stderr });
      expect(r.usedLlm).toBe(true);
      expect(r.remediations[0]!.source).toBe('llm');
      expect(r.remediations[0]!.suggested_patch).toBe('enriched body');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to all-template when provider unhealthy + warns to stderr', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const reportPath = writeReport(dir, [mkFinding()]);
      const stdout = captureStream();
      const stderr = captureStream();
      const r = await runSuggest({ reportPath, provider: new ScriptedProvider([], false), stdout, stderr });
      expect(r.usedLlm).toBe(false);
      expect(r.remediations[0]!.source).toBe('template');
      expect(stderr.text).toContain('unhealthy');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles a clean report (results: []) with empty remediations output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      const reportPath = writeReport(dir, []);
      const stdout = captureStream();
      const stderr = captureStream();
      const r = await runSuggest({ reportPath, stdout, stderr });
      expect(r.remediations).toEqual([]);
      const parsed = JSON.parse(stdout.text);
      expect(parsed.count).toBe(0);
      expect(parsed.remediations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT re-run detection — reads remediations from disk findings only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-guard-suggest-'));
    try {
      // Synthetic ruleId outside the prefix set forces fallback path.
      const reportPath = writeReport(dir, [mkFinding({ ruleId: 'SSRF-CLOUD-METADATA' })]);
      const stdout = captureStream();
      const stderr = captureStream();
      await runSuggest({ reportPath, stdout, stderr });
      const parsed = JSON.parse(stdout.text);
      // AC-003-4 invariant: input ruleId is preserved as-is.
      expect(parsed.remediations[0].ruleId).toBe('SSRF-CLOUD-METADATA');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
