// Sequential harness runner. Owns:
//   - provider health probe + mock fallback (AC-002-2)
//   - per-probe stderr progress in `[N/M]` form (AC-002-3)
//   - detector dispatch (T-25)
//   - severity-floor exit gate (AC-002-4)
//   - JSON-friendly HarnessReport (T-27 e2e consumes serialized form)
//
// Paid-API defense (load-bearing): the runner NEVER instantiates a
// paid provider; the caller passes one explicitly or the runner
// falls back to mock. This composes with T-13 constructor gate +
// T-13b budget guard so no code path can route to a paid provider
// without explicit user intent.

import { performance } from 'node:perf_hooks';

import { evaluateProbeOutput } from '../detectors/index.js';
import { sanitize } from '../logger/sanitize.js';
import { MockLlmProvider } from '../providers/llm/mock.js';
import type { LlmProvider } from '../providers/llm/types.js';
import type { LoadedProbe, OwaspCategory } from '../probes/types.js';
import type { SeverityLevel } from '../types/index.js';

import {
  CATEGORY_SEVERITY,
  SEVERITY_ORDER,
  type CategoryTotals,
  type HarnessOptions,
  type HarnessReport,
  type ProbeResult,
} from './types.js';

const ALL_CATEGORIES: readonly OwaspCategory[] = [
  'LLM01', 'LLM02', 'LLM03', 'LLM04', 'LLM05',
  'LLM06', 'LLM07', 'LLM08', 'LLM09', 'LLM10',
];

function writeProgress(
  stream: NodeJS.WritableStream,
  n: number,
  total: number,
  probeId: string,
): void {
  // Sanitize probe id before write (AC-NF-4 + defense-in-depth — the id
  // is loader-validated to /^[a-z0-9][a-z0-9-]*$/ so the ANSI strip is
  // belt-and-suspenders, but the contract is uniform across surfaces).
  const line = `[${n}/${total}] ${sanitize(probeId)}\n`;
  stream.write(line);
}

async function probeProviderHealth(
  provider: LlmProvider,
): Promise<boolean> {
  try {
    return await provider.health();
  } catch {
    // health() contract says no-throw; defense-in-depth narrow.
    return false;
  }
}

function emptyCategoryTotals(): Record<OwaspCategory, CategoryTotals> {
  const out = {} as Record<OwaspCategory, CategoryTotals>;
  for (const cat of ALL_CATEGORIES) {
    out[cat] = { total: 0, passed: 0, failed: 0 };
  }
  return out;
}

export async function runHarness(
  probes: readonly LoadedProbe[],
  opts: HarnessOptions = {},
): Promise<HarnessReport> {
  const stderr = opts.stderr ?? process.stderr;
  const severityFloor: SeverityLevel = opts.severityFloor ?? 'high';
  const floorRank = SEVERITY_ORDER[severityFloor];
  const now = opts.now ?? (() => performance.now());

  // Provider resolution: explicit caller provider when healthy, else
  // mock fallback. Mock is the only auto-selection path; paid swap is
  // structurally impossible from inside the harness.
  let provider: LlmProvider;
  let fallbackToMock = false;
  if (opts.provider === undefined) {
    provider = new MockLlmProvider();
    fallbackToMock = true;
    stderr.write('[harness] no provider supplied — using mock provider\n');
  } else {
    const healthy = await probeProviderHealth(opts.provider);
    if (!healthy) {
      provider = new MockLlmProvider();
      fallbackToMock = true;
      stderr.write(
        `[harness] provider "${sanitize(opts.provider.name)}" unhealthy — falling back to mock\n`,
      );
    } else {
      provider = opts.provider;
    }
  }

  const results: ProbeResult[] = [];
  const byCategory = emptyCategoryTotals();
  let passed = 0;
  let failed = 0;
  let anyFailAtOrAboveFloor = false;

  // D-006 sequential. Iteration uses for-of so AbortSignal propagation
  // remains visible in the body (early break on opts.signal.aborted).
  let i = 0;
  for (const { probe, sourcePath } of probes) {
    i += 1;
    writeProgress(stderr, i, probes.length, probe.id);

    if (opts.signal?.aborted === true) {
      stderr.write('[harness] aborted before completion\n');
      break;
    }

    const t0 = now();
    let output: string;
    try {
      const genOpts: { signal?: AbortSignal } = {};
      if (opts.signal !== undefined) genOpts.signal = opts.signal;
      output = await provider.generate(probe.prompt, genOpts);
    } catch (err) {
      // Provider failure is captured as an empty output + auto-fail
      // verdict so the run can continue — a single flaky provider call
      // must not abort an entire corpus pass.
      output = '';
      stderr.write(
        `[harness] provider error on ${sanitize(probe.id)}: ${sanitize((err as Error).message)}\n`,
      );
    }
    const t1 = now();

    const verdict = evaluateProbeOutput(probe, output);
    const severity = CATEGORY_SEVERITY[probe.owasp_category];

    const result: ProbeResult = {
      probeId: probe.id,
      owaspCategory: probe.owasp_category,
      severity,
      verdict,
      providerName: provider.name,
      durationMs: Math.max(0, t1 - t0),
      sourcePath,
    };
    results.push(result);

    const cat = byCategory[probe.owasp_category];
    byCategory[probe.owasp_category] = {
      total: cat.total + 1,
      passed: cat.passed + (verdict.pass ? 1 : 0),
      failed: cat.failed + (verdict.pass ? 0 : 1),
    };

    if (verdict.pass) {
      passed += 1;
    } else {
      failed += 1;
      if (SEVERITY_ORDER[severity] >= floorRank) {
        anyFailAtOrAboveFloor = true;
      }
    }
  }

  return {
    results,
    totals: {
      total: results.length,
      passed,
      failed,
      byCategory,
    },
    providerUsed: provider.name,
    fallbackToMock,
    severityFloor,
    shouldExitNonZero: anyFailAtOrAboveFloor,
  };
}

// Serializable view for `--format json` consumption (T-27 e2e + L7
// CLI). Strips the sourcePath (caller-local) and verdict.reason (free-
// form, leak-prone) is preserved but sanitized.
export function serializeHarnessReport(report: HarnessReport): string {
  const view = {
    schema: 'mcp-guard-harness-report@1',
    providerUsed: report.providerUsed,
    fallbackToMock: report.fallbackToMock,
    severityFloor: report.severityFloor,
    shouldExitNonZero: report.shouldExitNonZero,
    totals: report.totals,
    results: report.results.map((r) => ({
      probeId: r.probeId,
      owaspCategory: r.owaspCategory,
      severity: r.severity,
      providerName: r.providerName,
      durationMs: r.durationMs,
      pass: r.verdict.pass,
      score: r.verdict.score,
      reason: sanitize(r.verdict.reason),
    })),
  };
  return `${JSON.stringify(view, null, 2)}\n`;
}
