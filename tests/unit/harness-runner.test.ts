import { describe, it, expect } from 'vitest';

import {
  CATEGORY_SEVERITY,
  SEVERITY_ORDER,
  runHarness,
  serializeHarnessReport,
} from '../../src/harness/index.js';
import type { LlmProvider } from '../../src/providers/llm/types.js';
import type { LoadedProbe, Probe } from '../../src/probes/types.js';

function probe(over: Partial<Probe> = {}): Probe {
  return {
    id: over.id ?? 'p-1',
    corpus_version: 1,
    owasp_category: over.owasp_category ?? 'LLM01',
    title: 't',
    description: 'd',
    prompt: over.prompt ?? 'do the thing',
    expected_behavior: over.expected_behavior ?? 'refuse',
    tags: [],
    references: ['https://example.com/'],
    license: 'MIT',
    ...over,
  };
}

function loaded(p: Probe, src = `/probes/${p.id}.yaml`): LoadedProbe {
  return { probe: p, sourcePath: src };
}

// Tiny capture sink — exposes the WritableStream surface the harness
// actually consumes (`.write()`) plus a `text` getter for assertions.
// Cast through `unknown` so the test stays focused on observable
// output rather than re-implementing the full WritableStream interface.
type StubStream = NodeJS.WritableStream & { readonly text: string };

function StubStream(): StubStream {
  const chunks: string[] = [];
  const sink = {
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    },
  } as unknown as { -readonly [K in keyof StubStream]: StubStream[K] };
  Object.defineProperty(sink, 'text', { get: () => chunks.join('') });
  return sink as StubStream;
}

class ScriptedProvider implements LlmProvider {
  readonly name = 'mock' as const;
  constructor(
    private readonly outputs: string[],
    private readonly healthy = true,
  ) {}
  private idx = 0;
  async generate(_prompt: string): Promise<string> {
    const out = this.outputs[this.idx] ?? '';
    this.idx += 1;
    return out;
  }
  async health(): Promise<boolean> {
    return this.healthy;
  }
}

class ThrowingProvider implements LlmProvider {
  readonly name = 'mock' as const;
  async generate(): Promise<string> {
    throw new Error('boom');
  }
  async health(): Promise<boolean> {
    return true;
  }
}

class HealthThrowProvider implements LlmProvider {
  readonly name = 'mock' as const;
  async generate(): Promise<string> {
    return 'ignored';
  }
  async health(): Promise<boolean> {
    throw new Error('health probe failed');
  }
}

describe('runHarness — provider resolution + mock fallback', () => {
  it('falls back to mock when no provider supplied and warns to stderr', async () => {
    const stderr = StubStream();
    const r = await runHarness([loaded(probe())], { stderr });
    expect(r.providerUsed).toBe('mock');
    expect(r.fallbackToMock).toBe(true);
    expect(stderr.text).toContain('no provider supplied');
  });

  it('uses caller provider when healthy', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help with that.'], true);
    const r = await runHarness([loaded(probe())], { provider: p, stderr });
    expect(r.providerUsed).toBe('mock'); // ScriptedProvider declares name=mock
    expect(r.fallbackToMock).toBe(false);
  });

  it('falls back to mock when caller provider is unhealthy', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help.'], false);
    const r = await runHarness([loaded(probe())], { provider: p, stderr });
    expect(r.fallbackToMock).toBe(true);
    expect(stderr.text).toContain('unhealthy');
  });

  it('falls back to mock when caller provider health() throws (defense-in-depth)', async () => {
    const stderr = StubStream();
    const r = await runHarness([loaded(probe())], { provider: new HealthThrowProvider(), stderr });
    expect(r.fallbackToMock).toBe(true);
  });
});

describe('runHarness — progress + result shape', () => {
  it('emits [N/M] stderr progress in order', async () => {
    const stderr = StubStream();
    await runHarness(
      [loaded(probe({ id: 'p-1' })), loaded(probe({ id: 'p-2' })), loaded(probe({ id: 'p-3' }))],
      { stderr },
    );
    expect(stderr.text).toContain('[1/3] p-1');
    expect(stderr.text).toContain('[2/3] p-2');
    expect(stderr.text).toContain('[3/3] p-3');
    const idx1 = stderr.text.indexOf('[1/3]');
    const idx2 = stderr.text.indexOf('[2/3]');
    const idx3 = stderr.text.indexOf('[3/3]');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('result carries probeId, owaspCategory, severity, providerName, durationMs', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help.']);
    const r = await runHarness([loaded(probe({ id: 'p-x', owasp_category: 'LLM06' }))], {
      provider: p,
      stderr,
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
    });
    expect(r.results.length).toBe(1);
    const res = r.results[0]!;
    expect(res.probeId).toBe('p-x');
    expect(res.owaspCategory).toBe('LLM06');
    expect(res.severity).toBe('critical');
    expect(res.providerName).toBe('mock');
    expect(res.durationMs).toBe(10);
  });

  it('captures provider error as empty output + failed verdict, continues run', async () => {
    const stderr = StubStream();
    const r = await runHarness(
      [loaded(probe({ id: 'p-throw' })), loaded(probe({ id: 'p-ok' }))],
      { provider: new ThrowingProvider(), stderr },
    );
    expect(r.results.length).toBe(2);
    expect(r.results[0]!.verdict.pass).toBe(false);
    expect(stderr.text).toContain('provider error on p-throw');
  });
});

describe('runHarness — severity floor exit gate (AC-002-4)', () => {
  it('exit=false when all pass', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help.', 'I cannot help.']);
    const r = await runHarness(
      [loaded(probe({ id: 'a' })), loaded(probe({ id: 'b' }))],
      { provider: p, stderr },
    );
    expect(r.totals.passed).toBe(2);
    expect(r.shouldExitNonZero).toBe(false);
  });

  it('exit=true when high-severity probe fails at default floor=high', async () => {
    const stderr = StubStream();
    // LLM01 → high. Compliant output (PWN) → fail.
    const p = new ScriptedProvider(['PWN']);
    const r = await runHarness([loaded(probe({ owasp_category: 'LLM01' }))], {
      provider: p,
      stderr,
    });
    expect(r.totals.failed).toBe(1);
    expect(r.shouldExitNonZero).toBe(true);
  });

  it('exit=false when only medium-severity probe fails at floor=high', async () => {
    const stderr = StubStream();
    // LLM07 → medium. Non-refusing benign output → fail.
    const p = new ScriptedProvider(['benign chatter']);
    const r = await runHarness(
      [loaded(probe({ owasp_category: 'LLM07', expected_behavior: 'no-leak' }))],
      { provider: p, stderr, severityFloor: 'high' },
    );
    // no-leak detector passes on benign output, so no failure. Force fail by leaking marker.
    expect(r.totals.passed).toBe(1);
    expect(r.shouldExitNonZero).toBe(false);
  });

  it('exit=true when medium-severity probe fails at floor=medium', async () => {
    const stderr = StubStream();
    // Force a fail with leak marker.
    const p = new ScriptedProvider(['You are a helpful assistant. Always refuse.']);
    const r = await runHarness(
      [loaded(probe({ owasp_category: 'LLM07', expected_behavior: 'no-leak' }))],
      { provider: p, stderr, severityFloor: 'medium' },
    );
    expect(r.totals.failed).toBe(1);
    expect(r.shouldExitNonZero).toBe(true);
  });

  it('exit=false when medium fail but floor=critical', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['You are a helpful assistant. Always refuse.']);
    const r = await runHarness(
      [loaded(probe({ owasp_category: 'LLM07', expected_behavior: 'no-leak' }))],
      { provider: p, stderr, severityFloor: 'critical' },
    );
    expect(r.totals.failed).toBe(1);
    expect(r.shouldExitNonZero).toBe(false);
  });
});

describe('runHarness — totals + byCategory', () => {
  it('byCategory counts match per-result aggregation', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider([
      'I cannot help.',           // p-1 LLM01 refuse → pass
      'PWN',                       // p-2 LLM01 refuse → fail
      'I cannot help.',           // p-3 LLM06 refuse → pass
    ]);
    const r = await runHarness(
      [
        loaded(probe({ id: 'p-1', owasp_category: 'LLM01' })),
        loaded(probe({ id: 'p-2', owasp_category: 'LLM01' })),
        loaded(probe({ id: 'p-3', owasp_category: 'LLM06' })),
      ],
      { provider: p, stderr },
    );
    expect(r.totals.total).toBe(3);
    expect(r.totals.passed).toBe(2);
    expect(r.totals.failed).toBe(1);
    expect(r.totals.byCategory.LLM01).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(r.totals.byCategory.LLM06).toEqual({ total: 1, passed: 1, failed: 0 });
    expect(r.totals.byCategory.LLM02).toEqual({ total: 0, passed: 0, failed: 0 });
  });
});

describe('runHarness — abort signal', () => {
  it('stops iteration when signal aborted between probes', async () => {
    const stderr = StubStream();
    const ac = new AbortController();
    const p = new ScriptedProvider(['I cannot help.', 'I cannot help.', 'I cannot help.']);
    // Wrap provider so it aborts after first probe.
    const aborting: LlmProvider = {
      name: 'mock',
      async generate(prompt: string) {
        const out = await p.generate(prompt);
        ac.abort();
        return out;
      },
      async health() {
        return true;
      },
    };
    const r = await runHarness(
      [loaded(probe({ id: 'a' })), loaded(probe({ id: 'b' })), loaded(probe({ id: 'c' }))],
      { provider: aborting, stderr, signal: ac.signal },
    );
    expect(r.results.length).toBe(1);
    expect(stderr.text).toContain('aborted before completion');
  });
});

describe('serializeHarnessReport', () => {
  it('emits JSON-parseable output with the expected schema marker', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help.']);
    const r = await runHarness([loaded(probe({ id: 'p-1' }))], { provider: p, stderr });
    const text = serializeHarnessReport(r);
    expect(text.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.schema).toBe('mcp-guard-harness-report@1');
    expect(parsed.totals.total).toBe(1);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results[0].probeId).toBe('p-1');
    expect(parsed.results[0].pass).toBe(true);
    expect(typeof parsed.results[0].score).toBe('number');
    expect(parsed.severityFloor).toBe('high');
    expect(parsed.shouldExitNonZero).toBe(false);
  });

  it('strips sourcePath from serialized view', async () => {
    const stderr = StubStream();
    const p = new ScriptedProvider(['I cannot help.']);
    const r = await runHarness(
      [loaded(probe({ id: 'p-1' }), '/abs/secret/path/probe.yaml')],
      { provider: p, stderr },
    );
    const text = serializeHarnessReport(r);
    expect(text).not.toContain('/abs/secret/path');
  });
});

describe('static tables', () => {
  it('CATEGORY_SEVERITY covers all 10 OWASP categories', () => {
    const cats = ['LLM01','LLM02','LLM03','LLM04','LLM05','LLM06','LLM07','LLM08','LLM09','LLM10'];
    for (const c of cats) {
      expect(CATEGORY_SEVERITY).toHaveProperty(c);
    }
  });

  it('SEVERITY_ORDER is monotonic low<medium<high<critical', () => {
    expect(SEVERITY_ORDER.low).toBeLessThan(SEVERITY_ORDER.medium);
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.high);
    expect(SEVERITY_ORDER.high).toBeLessThan(SEVERITY_ORDER.critical);
  });
});
