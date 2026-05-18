import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReport,
  emitJsonReport,
  isCleanReport,
  serializeReport,
  REPORT_SCHEMA_VERSION,
  TOOL_NAME,
  type Finding,
  type ScanReport,
} from '../../src/io/emitters/index.js';

// T-15 / AC-001-4: a clean report is the *presence* of an empty array,
// not the absence of the field. `results: []` is the canonical positive
// signal. buildReport + serializeReport are pure; emitJsonReport
// delegates the write to writeAtomic.

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    ruleId: 'LLM01-prompt-injection',
    severity: 'high',
    source: 'static',
    message: 'sample finding',
    ...overrides,
  };
}

describe('buildReport — shape + defaults', () => {
  it('produces an empty results array by default (clean report shape)', () => {
    const r = buildReport({ target: '/path/.mcp.json' });
    expect(r.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(r.tool.name).toBe(TOOL_NAME);
    expect(r.tool.version).toBe('0.0.0');
    expect(r.target).toBe('/path/.mcp.json');
    expect(r.results).toEqual([]);
  });

  it('honours toolVersion + generatedAt overrides', () => {
    const r = buildReport({
      target: '/x',
      toolVersion: '1.2.3',
      generatedAt: '2026-05-18T00:00:00.000Z',
    });
    expect(r.tool.version).toBe('1.2.3');
    expect(r.generatedAt).toBe('2026-05-18T00:00:00.000Z');
  });

  it('defaults generatedAt to ISO-8601 UTC string', () => {
    const r = buildReport({ target: '/x' });
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('passes findings through preserving order', () => {
    const findings = [
      sampleFinding({ id: 'F-1' }),
      sampleFinding({ id: 'F-2', severity: 'critical' }),
      sampleFinding({ id: 'F-3', severity: 'low' }),
    ];
    const r = buildReport({ target: '/x', findings });
    expect(r.results.map((f) => f.id)).toEqual(['F-1', 'F-2', 'F-3']);
    expect(r.results[1]!.severity).toBe('critical');
  });
});

describe('isCleanReport (AC-001-4)', () => {
  it('returns true for an empty results[]', () => {
    expect(isCleanReport(buildReport({ target: '/x' }))).toBe(true);
  });

  it('returns false when any finding is present', () => {
    const r = buildReport({ target: '/x', findings: [sampleFinding()] });
    expect(isCleanReport(r)).toBe(false);
  });

  it('a clean report still serializes to a present empty array, not undefined', () => {
    const r = buildReport({ target: '/x' });
    const parsed = JSON.parse(serializeReport(r)) as ScanReport;
    expect(parsed.results).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'results')).toBe(true);
  });
});

describe('serializeReport', () => {
  it('produces pretty-printed JSON with trailing newline', () => {
    const r = buildReport({ target: '/x' });
    const text = serializeReport(r);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toMatch(/\n {2}"schemaVersion": "1.0",/);
  });

  it('is round-trippable through JSON.parse', () => {
    const findings = [sampleFinding({ id: 'F-1', path: '/etc/x.json', line: 10, col: 5 })];
    const r = buildReport({ target: '/y', findings });
    const round = JSON.parse(serializeReport(r)) as ScanReport;
    expect(round).toEqual(r);
  });
});

describe('emitJsonReport (atomic write integration)', () => {
  it('writes the serialized report to the target path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-emit-'));
    try {
      const target = join(dir, 'report.json');
      const r = buildReport({
        target: '/scanned/.mcp.json',
        findings: [sampleFinding()],
        generatedAt: '2026-05-18T00:00:00.000Z',
        toolVersion: '0.1.0',
      });

      await emitJsonReport(r, target);

      const text = await readFile(target, 'utf-8');
      const round = JSON.parse(text) as ScanReport;
      expect(round.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
      expect(round.tool.name).toBe(TOOL_NAME);
      expect(round.tool.version).toBe('0.1.0');
      expect(round.results.length).toBe(1);
      expect(round.results[0]!.id).toBe('F-0001');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clean-report emission yields readable JSON with results: []', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-emit-clean-'));
    try {
      const target = join(dir, 'clean.json');
      const r = buildReport({ target: '/scanned/.mcp.json' });
      await emitJsonReport(r, target);

      const round = JSON.parse(await readFile(target, 'utf-8')) as ScanReport;
      expect(round.results).toEqual([]);
      expect(isCleanReport(round)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
