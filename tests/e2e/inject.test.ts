// F-002 e2e — load the real OWASP corpus under `src/probes/owasp/`,
// drive the harness against MockLlmProvider (the only safe e2e
// provider — AC-NF-3 forbids network in CI), and assert the summary
// report's spec-mandated shape.
//
// Asserts:
//   AC-002-1  ≥ 30 probes executed + all 10 OWASP categories covered
//   AC-002-2  mock provider is the autoselected fallback
//   AC-002-3  stderr emits `[N/M] <probeId>` progress for every probe
//   AC-002-4  severity-floor gate field is present + boolean-typed
//   AC-002-5  summary report is JSON-parseable + per-probe verdict
//             + totals (overall + per-category)
//
// Determinism: mock provider is sha256-keyed over the probe prompt,
// so the same corpus yields the same report on any machine.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

import {
  runHarness,
  serializeHarnessReport,
  CATEGORY_SEVERITY,
} from '../../src/harness/index.js';
import { loadProbeDirectory } from '../../src/probes/loader.js';
import { OWASP_CATEGORIES } from '../../src/probes/types.js';
import { MockLlmProvider } from '../../src/providers/llm/mock.js';

const CORPUS_DIR = join(process.cwd(), 'src', 'probes', 'owasp');

// Minimal capture sink used in place of process.stderr so the e2e
// can assert against emitted progress lines without polluting test
// output.
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

describe('F-002 e2e — OWASP corpus harness pass', () => {
  it('AC-002-1: loads ≥ 30 probes spanning all 10 OWASP categories', async () => {
    const probes = await loadProbeDirectory(CORPUS_DIR);
    expect(probes.length).toBeGreaterThanOrEqual(30);
    const cats = new Set(probes.map((p) => p.probe.owasp_category));
    for (const cat of OWASP_CATEGORIES) {
      expect(cats, `missing category ${cat}`).toContain(cat);
    }
  });

  it('AC-002-2 + 3 + 5: full harness pass produces well-formed report', async () => {
    const probes = await loadProbeDirectory(CORPUS_DIR);
    const stderr = captureStream();
    const t0 = Date.now();
    const report = await runHarness(probes, {
      provider: new MockLlmProvider(),
      stderr,
    });
    const elapsed = Date.now() - t0;

    // AC-002-2 — caller-supplied healthy mock used, no fallback.
    expect(report.providerUsed).toBe('mock');
    expect(report.fallbackToMock).toBe(false);

    // Sanity: in-process mock + sequential harness must complete the
    // entire corpus in well under the F-001 60s budget. Generous
    // ceiling here so the test stays green on slow CI hardware.
    expect(elapsed).toBeLessThan(10_000);

    // AC-002-3 — every probe produces an [N/M] progress line in order.
    for (let i = 1; i <= probes.length; i += 1) {
      expect(stderr.text).toContain(`[${i}/${probes.length}]`);
    }

    // AC-002-5 — summary totals + per-probe verdicts present.
    expect(report.totals.total).toBe(probes.length);
    expect(report.totals.passed + report.totals.failed).toBe(probes.length);
    expect(report.results.length).toBe(probes.length);

    for (const r of report.results) {
      expect(typeof r.probeId).toBe('string');
      expect(r.probeId.length).toBeGreaterThan(0);
      expect(typeof r.verdict.pass).toBe('boolean');
      expect(typeof r.verdict.score).toBe('number');
      expect(r.verdict.score).toBeGreaterThanOrEqual(0);
      expect(r.verdict.score).toBeLessThanOrEqual(1);
      expect(typeof r.verdict.reason).toBe('string');
      expect(r.severity).toBe(CATEGORY_SEVERITY[r.owaspCategory]);
    }

    // AC-002-5 — byCategory totals reconcile against per-result aggregation.
    for (const cat of OWASP_CATEGORIES) {
      const cell = report.totals.byCategory[cat];
      const expected = report.results.filter((r) => r.owaspCategory === cat);
      const expectedPassed = expected.filter((r) => r.verdict.pass).length;
      expect(cell.total).toBe(expected.length);
      expect(cell.passed).toBe(expectedPassed);
      expect(cell.failed).toBe(expected.length - expectedPassed);
    }
  });

  it('AC-002-4: severity-floor gate field present and well-typed', async () => {
    const probes = await loadProbeDirectory(CORPUS_DIR);
    const stderr = captureStream();
    const report = await runHarness(probes, {
      provider: new MockLlmProvider(),
      stderr,
      severityFloor: 'critical',
    });
    expect(report.severityFloor).toBe('critical');
    expect(typeof report.shouldExitNonZero).toBe('boolean');
  });

  it('AC-002-5: serializeHarnessReport produces JSON-parseable schema', async () => {
    const probes = await loadProbeDirectory(CORPUS_DIR);
    const stderr = captureStream();
    const report = await runHarness(probes, {
      provider: new MockLlmProvider(),
      stderr,
    });

    const text = serializeHarnessReport(report);
    expect(text.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(text);
    expect(parsed.schema).toBe('mcp-guard-harness-report@1');
    expect(parsed.providerUsed).toBe('mock');
    expect(parsed.fallbackToMock).toBe(false);
    expect(parsed.severityFloor).toBe('high');
    expect(typeof parsed.shouldExitNonZero).toBe('boolean');
    expect(parsed.totals.total).toBe(probes.length);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBe(probes.length);

    for (const r of parsed.results) {
      expect(typeof r.probeId).toBe('string');
      expect(typeof r.owaspCategory).toBe('string');
      expect(typeof r.severity).toBe('string');
      expect(typeof r.providerName).toBe('string');
      expect(typeof r.durationMs).toBe('number');
      expect(typeof r.pass).toBe('boolean');
      expect(typeof r.score).toBe('number');
      expect(typeof r.reason).toBe('string');
      // Source path stripped from serialized view (caller-local data).
      expect(Object.keys(r)).not.toContain('sourcePath');
    }
  });

  it('AC-002-2: mock fallback path autoselected when no provider supplied', async () => {
    // Smoke just the first 3 probes so the unit-level fallback contract
    // is also exercised in the e2e suite end-to-end with the real corpus.
    const probes = (await loadProbeDirectory(CORPUS_DIR)).slice(0, 3);
    const stderr = captureStream();
    const report = await runHarness(probes, { stderr });
    expect(report.providerUsed).toBe('mock');
    expect(report.fallbackToMock).toBe(true);
    expect(stderr.text).toContain('no provider supplied');
  });

  it('determinism: identical input corpus → identical report (hash match)', async () => {
    const probes = await loadProbeDirectory(CORPUS_DIR);
    const stderr1 = captureStream();
    const stderr2 = captureStream();
    const a = await runHarness(probes, { provider: new MockLlmProvider(), stderr: stderr1 });
    const b = await runHarness(probes, { provider: new MockLlmProvider(), stderr: stderr2 });
    // durationMs varies across runs; compare everything else.
    const project = (r: typeof a): unknown => ({
      providerUsed: r.providerUsed,
      fallbackToMock: r.fallbackToMock,
      severityFloor: r.severityFloor,
      shouldExitNonZero: r.shouldExitNonZero,
      totals: r.totals,
      verdicts: r.results.map((x) => ({
        probeId: x.probeId,
        owaspCategory: x.owaspCategory,
        severity: x.severity,
        pass: x.verdict.pass,
        score: x.verdict.score,
        reason: x.verdict.reason,
      })),
    });
    expect(project(a)).toEqual(project(b));
  });
});
