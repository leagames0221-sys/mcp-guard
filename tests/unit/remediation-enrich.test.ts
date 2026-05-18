import { describe, it, expect } from 'vitest';

import {
  enrichFindings,
  enrichRemediation,
  templateRemediationFor,
} from '../../src/remediation/index.js';
import type { Finding } from '../../src/io/emitters/json.js';
import type { LlmProvider } from '../../src/providers/llm/types.js';

function mkFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'f-1',
    ruleId: over.ruleId ?? 'SSRF-LOOPBACK',
    severity: over.severity ?? 'high',
    source: 'static',
    message: over.message ?? 'localhost target',
    ...over,
  };
}

class ScriptedProvider implements LlmProvider {
  readonly name = 'mock' as const;
  public lastPrompt = '';
  public lastMaxTokens: number | undefined = undefined;
  constructor(
    private readonly outputs: string[] = ['ENRICHED PATCH BODY'],
    private readonly healthy = true,
  ) {}
  private idx = 0;
  async generate(prompt: string, opts?: { maxTokens?: number }): Promise<string> {
    this.lastPrompt = prompt;
    this.lastMaxTokens = opts?.maxTokens;
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
    throw new Error('budget exhausted');
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
    throw new Error('boom');
  }
}

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

describe('enrichRemediation — AC-003-2', () => {
  it('uses provider output as suggested_patch and labels source=llm', async () => {
    const p = new ScriptedProvider(['Pin loopback hosts at the parser layer.']);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.source).toBe('llm');
    expect(r.suggested_patch).toBe('Pin loopback hosts at the parser layer.');
  });

  it('preserves findingId / ruleId / category / severity / references from template', async () => {
    const p = new ScriptedProvider(['enriched body']);
    const r = await enrichRemediation(
      mkFinding({ id: 'f-7', ruleId: 'AUTH-GAP-WEAK-BEARER', severity: 'high' }),
      p,
    );
    expect(r.findingId).toBe('f-7');
    expect(r.ruleId).toBe('AUTH-GAP-WEAK-BEARER');
    expect(r.category).toBe('auth-gap');
    expect(r.severity).toBe('high');
    expect(r.references.length).toBeGreaterThan(0);
  });

  it('passes maxTokens=256 by default to provider', async () => {
    const p = new ScriptedProvider();
    await enrichRemediation(mkFinding(), p);
    expect(p.lastMaxTokens).toBe(256);
  });

  it('honors maxTokens override via opts', async () => {
    const p = new ScriptedProvider();
    await enrichRemediation(mkFinding(), p, { maxTokens: 64 });
    expect(p.lastMaxTokens).toBe(64);
  });

  it('embeds sanitized finding fields in the prompt', async () => {
    const p = new ScriptedProvider();
    await enrichRemediation(
      mkFinding({ ruleId: 'CMDINJ-SHELL-METACHAR', message: 'metacharacter | found' }),
      p,
    );
    expect(p.lastPrompt).toContain('CMDINJ-SHELL-METACHAR');
    expect(p.lastPrompt).toContain('metacharacter | found');
  });

  it('falls back to template when provider.generate throws', async () => {
    const r = await enrichRemediation(mkFinding(), new ThrowingProvider());
    expect(r.source).toBe('template');
    const base = templateRemediationFor(mkFinding());
    expect(r.suggested_patch).toBe(base.suggested_patch);
  });

  it('falls back to template when provider returns empty string', async () => {
    const p = new ScriptedProvider(['']);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.source).toBe('template');
  });

  it('falls back to template when provider returns whitespace only', async () => {
    const p = new ScriptedProvider(['   \n  \t  ']);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.source).toBe('template');
  });

  it('strips a leading "Concrete remediation:" echo from the output', async () => {
    const p = new ScriptedProvider(['Concrete remediation: pin the host.']);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.suggested_patch).toBe('pin the host.');
  });

  it('caps enriched output at 1024 chars', async () => {
    const long = 'A'.repeat(2000);
    const p = new ScriptedProvider([long]);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.suggested_patch.length).toBeLessThanOrEqual(1024);
  });

  it('sanitizes ANSI control sequences out of the enriched body', async () => {
    const p = new ScriptedProvider(['[31mpatch text[0m']);
    const r = await enrichRemediation(mkFinding(), p);
    expect(r.suggested_patch).toBe('patch text');
  });
});

describe('enrichFindings — bulk + provider gate (AC-003-2 + AC-003-3)', () => {
  it('returns all-template when provider is undefined', async () => {
    const stderr = captureStream();
    const findings = [
      mkFinding({ id: 'a', ruleId: 'SSRF-LOOPBACK' }),
      mkFinding({ id: 'b', ruleId: 'CMDINJ-SHELL-METACHAR' }),
    ];
    const out = await enrichFindings(findings, undefined, { stderr });
    expect(out.every((r) => r.source === 'template')).toBe(true);
    expect(out.map((r) => r.findingId)).toEqual(['a', 'b']);
  });

  it('returns all-template + stderr warning when provider unhealthy', async () => {
    const stderr = captureStream();
    const out = await enrichFindings([mkFinding()], new ScriptedProvider([], false), { stderr });
    expect(out[0]!.source).toBe('template');
    expect(stderr.text).toContain('unhealthy');
  });

  it('returns all-template when provider.health() throws', async () => {
    const stderr = captureStream();
    const out = await enrichFindings([mkFinding()], new HealthThrowProvider(), { stderr });
    expect(out[0]!.source).toBe('template');
    expect(stderr.text).toContain('unhealthy');
  });

  it('enriches each finding when provider healthy', async () => {
    const stderr = captureStream();
    const p = new ScriptedProvider(['patch A', 'patch B']);
    const findings = [
      mkFinding({ id: 'a', ruleId: 'SSRF-LOOPBACK' }),
      mkFinding({ id: 'b', ruleId: 'AUTH-GAP-WEAK-BEARER' }),
    ];
    const out = await enrichFindings(findings, p, { stderr });
    expect(out.map((r) => r.source)).toEqual(['llm', 'llm']);
    expect(out.map((r) => r.suggested_patch)).toEqual(['patch A', 'patch B']);
  });

  it('preserves input order even with mixed enrichment outcomes', async () => {
    const stderr = captureStream();
    // First call returns text, second is empty (template fallback), third returns text.
    const p = new ScriptedProvider(['patch one', '', 'patch three']);
    const findings = [
      mkFinding({ id: '1', ruleId: 'SSRF-LOOPBACK' }),
      mkFinding({ id: '2', ruleId: 'CMDINJ-SHELL-METACHAR' }),
      mkFinding({ id: '3', ruleId: 'AUTH-GAP-WEAK-BEARER' }),
    ];
    const out = await enrichFindings(findings, p, { stderr });
    expect(out.map((r) => r.findingId)).toEqual(['1', '2', '3']);
    expect(out[0]!.source).toBe('llm');
    expect(out[1]!.source).toBe('template');
    expect(out[2]!.source).toBe('llm');
  });

  it('returns [] on empty input regardless of provider', async () => {
    const stderr = captureStream();
    const p = new ScriptedProvider();
    expect(await enrichFindings([], p, { stderr })).toEqual([]);
    expect(await enrichFindings([], undefined, { stderr })).toEqual([]);
  });
});
