import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractMaskTokens,
  scanDiff,
  evaluate,
} from '../../scripts/precommit_mask_check.js';

describe('extractMaskTokens', () => {
  it('extracts back-ticked tokens from markdown', () => {
    const md = 'Forbidden: `HIVE`, `D-WASTE-ZERO`, `tier-reviewer`.';
    expect(extractMaskTokens(md)).toEqual(['HIVE', 'D-WASTE-ZERO', 'tier-reviewer']);
  });

  it('deduplicates repeated tokens', () => {
    const md = '`foo` and `foo` again.';
    expect(extractMaskTokens(md)).toEqual(['foo']);
  });

  it('skips over-long tokens', () => {
    const md = `\`${'a'.repeat(81)}\` \`ok\``;
    expect(extractMaskTokens(md)).toEqual(['ok']);
  });
});

describe('scanDiff', () => {
  const tokens = ['HIVE', 'D-WASTE-ZERO'];

  it('returns no hits on clean diff', () => {
    const diff = ['+ added a benign line', '- removed a HIVE reference'].join('\n');
    expect(scanDiff(diff, tokens)).toEqual([]);
  });

  it('detects added-line hit (case-insensitive)', () => {
    const diff = '+ talks about hive cluster';
    const hits = scanDiff(diff, tokens);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.token).toBe('HIVE');
  });

  it('ignores +++ header lines', () => {
    const diff = '+++ b/HIVE.md\n+ benign change';
    expect(scanDiff(diff, tokens)).toEqual([]);
  });

  it('reports at most one hit per token', () => {
    const diff = '+ first HIVE mention\n+ second HIVE mention';
    expect(scanDiff(diff, tokens)).toHaveLength(1);
  });
});

describe('evaluate', () => {
  it('returns 0 with skip message when diff is empty', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcp-guard-mask-'));
    const maskPath = join(tmp, 'internal_notes.md');
    writeFileSync(maskPath, '`HIVE`');
    const result = evaluate(maskPath, '');
    expect(result.code).toBe(0);
    expect(result.message).toContain('No staged changes');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 0 with pass message on clean diff', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcp-guard-mask-'));
    const maskPath = join(tmp, 'internal_notes.md');
    writeFileSync(maskPath, '`HIVE`, `D-WASTE-ZERO`');
    const result = evaluate(maskPath, '+ added benign line');
    expect(result.code).toBe(0);
    expect(result.message).toContain('PASS');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 1 with blocked message when forbidden token detected', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mcp-guard-mask-'));
    const maskPath = join(tmp, 'internal_notes.md');
    writeFileSync(maskPath, '`HIVE`');
    const result = evaluate(maskPath, '+ this mentions HIVE in added text');
    expect(result.code).toBe(1);
    expect(result.message).toContain('BLOCKED');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.token).toBe('HIVE');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 2 with fail-closed message when mask list missing', () => {
    const missingPath = join(tmpdir(), 'definitely-does-not-exist-12345.md');
    const result = evaluate(missingPath, '+ any diff');
    expect(result.code).toBe(2);
    expect(result.message).toContain('FAIL CLOSED');
  });
});
