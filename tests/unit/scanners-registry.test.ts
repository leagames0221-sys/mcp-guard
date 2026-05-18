import { describe, it, expect } from 'vitest';

import {
  createScannerRegistry,
  makeFindingId,
  runAllScanners,
  SCANNER_CATEGORIES,
  type ScanContext,
  type Scanner,
  type ScannerCategory,
} from '../../src/scanners/index.js';
import type { McpConfig } from '../../src/scanners/mcp-schema/validator.js';

// T-18 (AC-001-1): the registry contract — 4 detector instances, one
// per canonical ScannerCategory, each implementing `{ category, scan }`.
// T-19..T-22 will replace the stubbed scan() bodies with real logic in
// their own files; the contract verified here is what those tasks must
// preserve.

const EMPTY_CONFIG: McpConfig = { mcpServers: {} };

function makeCtx(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    config: overrides.config ?? EMPTY_CONFIG,
    target: overrides.target ?? '/abs/path/.mcp.json',
  };
}

describe('SCANNER_CATEGORIES (AC-001-1, canonical order)', () => {
  it('contains the 4 spec-mandated categories', () => {
    expect(SCANNER_CATEGORIES).toEqual([
      'ssrf',
      'command-injection',
      'auth-gap',
      'supply-chain-risk',
    ]);
  });

  it('is frozen at the type level (readonly array)', () => {
    const sample: readonly ScannerCategory[] = SCANNER_CATEGORIES;
    expect(sample.length).toBe(4);
  });
});

describe('createScannerRegistry()', () => {
  it('returns one Scanner per category, in canonical order', () => {
    const registry = createScannerRegistry();
    expect(registry).toHaveLength(SCANNER_CATEGORIES.length);
    expect(registry.map((s) => s.category)).toEqual([...SCANNER_CATEGORIES]);
  });

  it('every registry entry implements the Scanner contract', () => {
    for (const scanner of createScannerRegistry()) {
      expect(typeof scanner.category).toBe('string');
      expect(typeof scanner.scan).toBe('function');
      const out = scanner.scan(makeCtx());
      expect(Array.isArray(out)).toBe(true);
    }
  });

  it('returns a fresh array each invocation (caller-safe to mutate)', () => {
    const a = createScannerRegistry();
    const b = createScannerRegistry();
    expect(a).not.toBe(b);
    a.length = 0;
    expect(b).toHaveLength(SCANNER_CATEGORIES.length);
  });

  it('all 4 stubs currently produce zero findings against an empty config', () => {
    // Stubs are placeholders; T-19..T-22 each light up real logic.
    // The empty-config-on-stubs invariant is what makes T-19..T-22
    // refactor-safe: each detector enables itself for its own fixtures
    // without changing the registry slot order.
    const findings = runAllScanners(makeCtx());
    expect(findings).toEqual([]);
  });
});

describe('runAllScanners(ctx, scanners?)', () => {
  it('flattens findings from every scanner exactly once', () => {
    const cat: ScannerCategory = 'ssrf';
    const fixedScanner: Scanner = {
      category: cat,
      scan: () => [
        {
          id: 'fixed-1',
          ruleId: 'TEST',
          severity: 'low',
          source: 'static',
          message: 'one',
        },
        {
          id: 'fixed-2',
          ruleId: 'TEST',
          severity: 'medium',
          source: 'static',
          message: 'two',
        },
      ],
    };
    const out = runAllScanners(makeCtx(), [fixedScanner, fixedScanner]);
    expect(out).toHaveLength(4);
    expect(out.map((f) => f.id)).toEqual([
      'fixed-1',
      'fixed-2',
      'fixed-1',
      'fixed-2',
    ]);
  });

  it('returns empty when given an empty registry', () => {
    expect(runAllScanners(makeCtx(), [])).toEqual([]);
  });
});

describe('makeFindingId()', () => {
  it('produces a 16-char lowercase hex string', () => {
    const id = makeFindingId({
      category: 'ssrf',
      ruleId: 'SSRF-LOCALHOST',
      target: '/abs/path/.mcp.json',
      locator: 'mcpServers.demo.url',
    });
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for identical input', () => {
    const a = makeFindingId({
      category: 'ssrf',
      ruleId: 'R',
      target: '/t',
      locator: 'L',
    });
    const b = makeFindingId({
      category: 'ssrf',
      ruleId: 'R',
      target: '/t',
      locator: 'L',
    });
    expect(a).toBe(b);
  });

  it('changes when any single input field changes', () => {
    const base = {
      category: 'ssrf' as ScannerCategory,
      ruleId: 'R',
      target: '/t',
      locator: 'L',
    };
    const baseId = makeFindingId(base);
    expect(makeFindingId({ ...base, category: 'auth-gap' })).not.toBe(baseId);
    expect(makeFindingId({ ...base, ruleId: 'R2' })).not.toBe(baseId);
    expect(makeFindingId({ ...base, target: '/t2' })).not.toBe(baseId);
    expect(makeFindingId({ ...base, locator: 'L2' })).not.toBe(baseId);
  });
});
