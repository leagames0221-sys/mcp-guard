import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReport,
  buildSarifLog,
  emitSarifReport,
  serializeSarifLog,
  severityToSarifLevel,
  pathToSarifUri,
  SARIF_VERSION,
  SARIF_SCHEMA,
  TOOL_INFORMATION_URI,
  TOOL_NAME,
  type Finding,
  type SarifLog,
  type SarifResult,
} from '../../src/io/emitters/index.js';

// T-16 / AC-001-3 (SARIF v2.1.0 + GitHub code scanning compatibility) +
// D-003 (hand-rolled, no external SARIF lib). Schema-vendored end-to-end
// validation is deferred to T-39; this suite covers SARIF spec required
// fields + GitHub UI required fields + the severity / location /
// fingerprint / rules-dedup mappings.

function f(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    ruleId: 'LLM01-prompt-injection',
    severity: 'high',
    source: 'static',
    message: 'sample',
    ...overrides,
  };
}

describe('severityToSarifLevel mapping', () => {
  it('low → note, medium → warning, high → error, critical → error', () => {
    expect(severityToSarifLevel('low')).toBe('note');
    expect(severityToSarifLevel('medium')).toBe('warning');
    expect(severityToSarifLevel('high')).toBe('error');
    expect(severityToSarifLevel('critical')).toBe('error');
  });
});

describe('pathToSarifUri', () => {
  it('normalizes Windows backslashes to forward slashes', () => {
    expect(pathToSarifUri('C:\\repo\\src\\file.ts')).toBe('C:/repo/src/file.ts');
  });

  it('passes already-forward-slashed paths through', () => {
    expect(pathToSarifUri('src/file.ts')).toBe('src/file.ts');
  });
});

describe('buildSarifLog — spec required fields', () => {
  it('emits $schema + version + runs[] at the top level', () => {
    const report = buildReport({ target: '/x' });
    const log = buildSarifLog(report);
    expect(log.$schema).toBe(SARIF_SCHEMA);
    expect(log.version).toBe(SARIF_VERSION);
    expect(log.version).toBe('2.1.0');
    expect(Array.isArray(log.runs)).toBe(true);
    expect(log.runs).toHaveLength(1);
  });

  it('runs[0].tool.driver carries name + version + informationUri + rules', () => {
    const report = buildReport({ target: '/x', toolVersion: '1.2.3' });
    const driver = buildSarifLog(report).runs[0]!.tool.driver;
    expect(driver.name).toBe(TOOL_NAME);
    expect(driver.version).toBe('1.2.3');
    expect(driver.informationUri).toBe(TOOL_INFORMATION_URI);
    expect(Array.isArray(driver.rules)).toBe(true);
  });

  it('a clean report emits runs[0].results: [] (AC-001-4 preserved through SARIF)', () => {
    const report = buildReport({ target: '/x' });
    const log = buildSarifLog(report);
    expect(log.runs[0]!.results).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(log.runs[0]!, 'results')).toBe(true);
    expect(log.runs[0]!.tool.driver.rules).toEqual([]);
  });
});

describe('buildSarifLog — result mapping', () => {
  it('emits ruleId + level + message.text for every finding', () => {
    const findings = [f({ id: 'F-1', message: 'first issue' })];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const r = log.runs[0]!.results[0]!;
    expect(r.ruleId).toBe('LLM01-prompt-injection');
    expect(r.level).toBe('error');
    expect(r.message.text).toBe('first issue');
  });

  it('emits partialFingerprints.mcpGuardFindingId for GitHub UI de-dup', () => {
    const findings = [f({ id: 'F-42' })];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    expect(log.runs[0]!.results[0]!.partialFingerprints).toEqual({
      mcpGuardFindingId: 'F-42',
    });
  });

  it('emits locations[].physicalLocation when finding has a path', () => {
    const findings = [f({ path: 'src\\evil.ts', line: 10, col: 5 })];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const loc = log.runs[0]!.results[0]!.locations![0]!;
    expect(loc.physicalLocation.artifactLocation.uri).toBe('src/evil.ts');
    expect(loc.physicalLocation.region).toEqual({ startLine: 10, startColumn: 5 });
  });

  it('emits region.startLine alone when col is absent', () => {
    const findings = [f({ path: 'src/x.ts', line: 7 })];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const region = log.runs[0]!.results[0]!.locations![0]!.physicalLocation.region!;
    expect(region.startLine).toBe(7);
    expect(region.startColumn).toBeUndefined();
  });

  it('omits region entirely when neither line nor col is present', () => {
    const findings = [f({ path: 'src/x.ts' })];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const physical = log.runs[0]!.results[0]!.locations![0]!.physicalLocation;
    expect(physical.region).toBeUndefined();
  });

  it('omits locations entirely when finding has no path', () => {
    const findings = [f({})];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    expect(log.runs[0]!.results[0]!.locations).toBeUndefined();
  });
});

describe('buildSarifLog — rules deduplication + ruleIndex', () => {
  it('deduplicates rules by id and assigns stable ruleIndex by first-appearance', () => {
    const findings = [
      f({ id: 'F-1', ruleId: 'rule-A', severity: 'high' }),
      f({ id: 'F-2', ruleId: 'rule-B', severity: 'medium' }),
      f({ id: 'F-3', ruleId: 'rule-A', severity: 'low' }), // dup
      f({ id: 'F-4', ruleId: 'rule-C', severity: 'critical' }),
    ];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const driver = log.runs[0]!.tool.driver;
    expect(driver.rules.map((r) => r.id)).toEqual(['rule-A', 'rule-B', 'rule-C']);
    expect(log.runs[0]!.results.map((r: SarifResult) => r.ruleIndex)).toEqual([0, 1, 0, 2]);
  });

  it('rules[].defaultConfiguration.level matches first-appearance severity', () => {
    const findings = [
      f({ id: 'F-1', ruleId: 'rule-A', severity: 'high' }),
      f({ id: 'F-2', ruleId: 'rule-A', severity: 'low' }),
    ];
    const driver = buildSarifLog(buildReport({ target: '/x', findings })).runs[0]!.tool.driver;
    expect(driver.rules[0]!.defaultConfiguration?.level).toBe('error');
  });

  it('rules[] also carries name + shortDescription.text', () => {
    const findings = [f({ ruleId: 'rule-X' })];
    const rules = buildSarifLog(buildReport({ target: '/x', findings })).runs[0]!.tool.driver.rules;
    expect(rules[0]!.name).toBe('rule-X');
    expect(rules[0]!.shortDescription?.text).toBe('rule-X');
  });
});

describe('serializeSarifLog', () => {
  it('produces pretty-printed JSON with a trailing newline', () => {
    const log = buildSarifLog(buildReport({ target: '/x' }));
    const text = serializeSarifLog(log);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toMatch(/^\{\n {2}"\$schema": /);
  });

  it('round-trips through JSON.parse without loss', () => {
    const findings = [
      f({ id: 'F-1', path: 'a.ts', line: 1, col: 1, severity: 'critical' }),
      f({ id: 'F-2', message: 'second', severity: 'low' }),
    ];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    const round = JSON.parse(serializeSarifLog(log)) as SarifLog;
    expect(round).toEqual(log);
  });
});

describe('emitSarifReport — atomic write integration', () => {
  it('writes the SARIF document to the target path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-sarif-'));
    try {
      const target = join(dir, 'out.sarif.json');
      const findings = [f({ id: 'F-1', path: 'src/x.ts', line: 3 })];
      const report = buildReport({ target: '/scanned/.mcp.json', findings, toolVersion: '0.1.0' });

      await emitSarifReport(report, target);

      const round = JSON.parse(await readFile(target, 'utf-8')) as SarifLog;
      expect(round.version).toBe(SARIF_VERSION);
      expect(round.$schema).toBe(SARIF_SCHEMA);
      expect(round.runs[0]!.tool.driver.version).toBe('0.1.0');
      expect(round.runs[0]!.results).toHaveLength(1);
      expect(round.runs[0]!.results[0]!.ruleId).toBe('LLM01-prompt-injection');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits a valid clean SARIF document (results: [], rules: [])', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-sarif-clean-'));
    try {
      const target = join(dir, 'clean.sarif.json');
      await emitSarifReport(buildReport({ target: '/x' }), target);
      const round = JSON.parse(await readFile(target, 'utf-8')) as SarifLog;
      expect(round.runs[0]!.results).toEqual([]);
      expect(round.runs[0]!.tool.driver.rules).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('GitHub code scanning compatibility surface', () => {
  it('every result carries the four GitHub-required fields: ruleId + ruleIndex + level + message.text', () => {
    const findings = [
      f({ id: 'F-1', path: 'a.ts', line: 1 }),
      f({ id: 'F-2', ruleId: 'rule-B', severity: 'medium' }),
    ];
    const log = buildSarifLog(buildReport({ target: '/x', findings }));
    for (const r of log.runs[0]!.results) {
      expect(typeof r.ruleId).toBe('string');
      expect(typeof r.ruleIndex).toBe('number');
      expect(['none', 'note', 'warning', 'error']).toContain(r.level);
      expect(typeof r.message.text).toBe('string');
    }
  });

  it('every rule carries id + name + defaultConfiguration.level', () => {
    const findings = [f({ ruleId: 'rule-X' })];
    const rule = buildSarifLog(buildReport({ target: '/x', findings })).runs[0]!.tool.driver.rules[0]!;
    expect(rule.id).toBe('rule-X');
    expect(rule.name).toBe('rule-X');
    expect(['none', 'note', 'warning', 'error']).toContain(rule.defaultConfiguration!.level);
  });
});
