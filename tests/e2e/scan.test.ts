// F-001 e2e — synthetic 50-server `.mcp.json` scan path, exercising
// the full T-14 (parser) → T-18..T-22 (scanners) → T-15/T-16
// (JSON/SARIF emitter) pipeline.
//
// Asserts:
//   AC-001-1  scan completes in < 60s for 50 server entries
//   AC-001-3  SARIF output is v2.1.0-shaped and GitHub-ingestible
//   AC-001-4  clean report = `results: []` (present, not omitted)
//   AC-001-5  input file content + mtime + size unchanged pre/post

import { describe, it, expect } from 'vitest';
import {
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMcpConfig } from '../../src/io/parsers/index.js';
import { runAllScanners } from '../../src/scanners/index.js';
import {
  buildReport,
  buildSarifLog,
  isCleanReport,
  SARIF_SCHEMA,
  SARIF_VERSION,
  serializeReport,
  serializeSarifLog,
} from '../../src/io/emitters/index.js';

const PERF_BUDGET_MS = 60_000;
const SERVER_COUNT = 50;

interface SyntheticConfig {
  mcpServers: Record<string, unknown>;
}

function makeCleanSyntheticConfig(n: number): SyntheticConfig {
  const servers: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      servers[`http-${i}`] = {
        url: `https://mcp-${i}.example.com/sse`,
        transport: 'sse',
        headers: { authorization: 'Bearer redacted-fixture-token' },
      };
    } else {
      servers[`stdio-${i}`] = {
        command: 'npx',
        args: ['-y', `@example-org/mcp-tool-${i}@1.0.${i}`],
        env: { LOG_LEVEL: 'info' },
      };
    }
  }
  return { mcpServers: servers };
}

function makeDirtySyntheticConfig(n: number): SyntheticConfig {
  // Every 5th entry is intentionally risky so we exercise the
  // emitter's finding-present path. Findings are deterministic so
  // the assertions below stay stable.
  const servers: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) {
      servers[`risky-http-${i}`] = {
        url: `https://app-pr-${i}.vercel.app/sse`,
        transport: 'sse',
      };
    } else if (i % 5 === 1) {
      servers[`risky-stdio-${i}`] = {
        command: 'npx',
        args: ['-y', `unscoped-pkg-${i}`],
      };
    } else if (i % 2 === 0) {
      servers[`clean-http-${i}`] = {
        url: `https://mcp-${i}.example.com/`,
        headers: { authorization: 'Bearer redacted-fixture-token' },
      };
    } else {
      servers[`clean-stdio-${i}`] = {
        command: 'npx',
        args: ['-y', `@example-org/pkg-${i}@1.0.0`],
      };
    }
  }
  return { mcpServers: servers };
}

async function hashAndStat(path: string): Promise<{
  sha256: string;
  size: number;
  mtimeMs: number;
}> {
  const buf = await readFile(path);
  const st = await stat(path);
  return {
    sha256: createHash('sha256').update(buf).digest('hex'),
    size: st.size,
    mtimeMs: st.mtimeMs,
  };
}

describe('F-001 e2e — synthetic 50-server scan', () => {
  it('clean config: completes < 60s, SARIF v2.1.0 valid, clean report, input untouched (AC-001-1/3/4/5)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-e2e-clean-'));
    const configPath = join(dir, '.mcp.json');
    await writeFile(
      configPath,
      JSON.stringify(makeCleanSyntheticConfig(SERVER_COUNT), null, 2),
    );

    const before = await hashAndStat(configPath);

    const start = Date.now();
    const { path, config } = await readMcpConfig(configPath);
    const findings = runAllScanners({ config, target: path });
    const report = buildReport({
      target: path,
      findings,
      toolVersion: '0.0.0-e2e',
    });
    const sarif = buildSarifLog(report);
    const elapsedMs = Date.now() - start;

    // AC-001-1 perf budget
    expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);

    // AC-001-4 clean report invariant
    expect(isCleanReport(report)).toBe(true);
    expect(report.results).toEqual([]);

    // AC-001-3 SARIF shape — version + schema + tool driver + results
    // field present even when empty
    expect(sarif.version).toBe(SARIF_VERSION);
    expect(sarif.$schema).toBe(SARIF_SCHEMA);
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0]!.tool.driver.name).toBe('mcp-guard');
    expect(sarif.runs[0]!.tool.driver.version).toBe('0.0.0-e2e');
    expect(Array.isArray(sarif.runs[0]!.tool.driver.rules)).toBe(true);
    expect(sarif.runs[0]!.results).toEqual([]);

    // Serializers also produce well-formed JSON for both formats.
    expect(() => JSON.parse(serializeReport(report))).not.toThrow();
    expect(() => JSON.parse(serializeSarifLog(sarif))).not.toThrow();

    // AC-001-5 input file untouched
    const after = await hashAndStat(configPath);
    expect(after.sha256).toBe(before.sha256);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('dirty config: emits findings with SARIF rules de-duped, perf budget intact, input untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-e2e-dirty-'));
    const configPath = join(dir, '.mcp.json');
    await writeFile(
      configPath,
      JSON.stringify(makeDirtySyntheticConfig(SERVER_COUNT), null, 2),
    );

    const before = await hashAndStat(configPath);

    const start = Date.now();
    const { path, config } = await readMcpConfig(configPath);
    const findings = runAllScanners({ config, target: path });
    const report = buildReport({
      target: path,
      findings,
      toolVersion: '0.0.0-e2e',
    });
    const sarif = buildSarifLog(report);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);

    // 50 servers / 5 = 10 risky-http EPHEMERAL hits + 10 risky-http
    // NO-AUTHORIZATION hits, plus 10 risky-stdio UNSCOPED + 10
    // risky-stdio UNPINNED. Clean http (20) and clean stdio (10)
    // emit zero. Total >= 40.
    expect(report.results.length).toBeGreaterThanOrEqual(40);

    // AC-001-3: every result's ruleId is referenced in the rules[]
    // dedup table, and ruleIndex points at the right entry.
    const rules = sarif.runs[0]!.tool.driver.rules!;
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const result of sarif.runs[0]!.results) {
      expect(ruleIds.has(result.ruleId)).toBe(true);
      const expected = rules.findIndex((r) => r.id === result.ruleId);
      expect(result.ruleIndex).toBe(expected);
      expect(result.partialFingerprints?.['mcpGuardFindingId']).toMatch(
        /^[0-9a-f]{16}$/,
      );
    }

    // Each rules[] entry appears exactly once (de-duped).
    expect(rules.length).toBe(ruleIds.size);

    // Severity / level mapping: rules with `high` findings must have
    // defaultConfiguration.level === 'error', `medium` → 'warning'.
    for (const rule of rules) {
      const sample = report.results.find((f) => f.ruleId === rule.id)!;
      const expectedLevel =
        sample.severity === 'critical' || sample.severity === 'high'
          ? 'error'
          : sample.severity === 'medium'
            ? 'warning'
            : 'note';
      expect(rule.defaultConfiguration?.level).toBe(expectedLevel);
    }

    // AC-001-5: input file unchanged regardless of finding count.
    const after = await hashAndStat(configPath);
    expect(after.sha256).toBe(before.sha256);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
