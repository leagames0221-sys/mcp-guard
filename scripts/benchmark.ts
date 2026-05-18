// T-38 real-world benchmark (AC-α-5). Drives the F-001 scanner against
// a curated labelled fixture set and reports per-rule TP / FP counts.
//
// Fixture model: each fixture file has a sibling `<name>.expected.json`
// that lists the ruleIds the scanner SHOULD emit. Anything emitted not
// in the expected set counts as a FP; anything in the expected set
// missing counts as a FN. The script does not crash on FN — it reports
// the gap so a reviewer can update the fixture or the scanner.
//
// Output: a text table on stdout suitable for paste into BENCHMARK.md,
// plus an exit code reflecting whether the run is clean
// (FP=0 + FN=0). Non-clean exits with code 1 so a CI gate could be
// added later.
//
// Run: `pnpm exec tsx scripts/benchmark.ts`

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { performance } from 'node:perf_hooks';

import { parseMcpConfig } from '../src/scanners/mcp-schema/validator.js';
import { runAllScanners } from '../src/scanners/index.js';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'benchmark');

interface Expected {
  ruleIds: string[];
  note?: string;
}

interface PerRule {
  rule: string;
  tp: number;
  fp: number;
  fn: number;
}

function readExpected(expectedPath: string): Expected {
  const raw = readFileSync(expectedPath, 'utf-8');
  return JSON.parse(raw) as Expected;
}

function listFixtures(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json') && !n.endsWith('.expected.json'))
    .map((n) => join(dir, n))
    .sort();
}

function summariseTable(perRule: Map<string, PerRule>): string {
  const rows = Array.from(perRule.values()).sort((a, b) => a.rule.localeCompare(b.rule));
  const lines: string[] = [];
  lines.push('| Rule | TP | FP | FN |');
  lines.push('|---|---:|---:|---:|');
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  for (const r of rows) {
    lines.push(`| ${r.rule} | ${r.tp} | ${r.fp} | ${r.fn} |`);
    totalTp += r.tp;
    totalFp += r.fp;
    totalFn += r.fn;
  }
  lines.push(`| **TOTAL** | **${totalTp}** | **${totalFp}** | **${totalFn}** |`);
  return lines.join('\n');
}

async function main(): Promise<number> {
  const fixtures = listFixtures(FIXTURE_DIR);
  if (fixtures.length === 0) {
    console.error(`no fixtures found under ${FIXTURE_DIR}`);
    return 1;
  }

  const perRule = new Map<string, PerRule>();
  function bumpTp(rule: string): void {
    const cur = perRule.get(rule) ?? { rule, tp: 0, fp: 0, fn: 0 };
    cur.tp += 1;
    perRule.set(rule, cur);
  }
  function bumpFp(rule: string): void {
    const cur = perRule.get(rule) ?? { rule, tp: 0, fp: 0, fn: 0 };
    cur.fp += 1;
    perRule.set(rule, cur);
  }
  function bumpFn(rule: string): void {
    const cur = perRule.get(rule) ?? { rule, tp: 0, fp: 0, fn: 0 };
    cur.fn += 1;
    perRule.set(rule, cur);
  }

  let totalFixtures = 0;
  const fixtureSummaries: { name: string; expected: number; emitted: number; elapsedMs: number }[] = [];

  for (const fixturePath of fixtures) {
    totalFixtures += 1;
    const expectedPath = `${fixturePath.replace(/\.json$/, '')}.expected.json`;
    if (!existsSync(expectedPath)) {
      console.error(`SKIP ${fixturePath} — missing ${basename(expectedPath)}`);
      continue;
    }
    const expected = readExpected(expectedPath);
    const expectedSet = new Set(expected.ruleIds);

    const raw = readFileSync(fixturePath, 'utf-8');
    const { config } = parseMcpConfig(raw, fixturePath);

    const t0 = performance.now();
    const findings = runAllScanners({ config, target: fixturePath });
    const elapsed = performance.now() - t0;

    const emittedSet = new Set(findings.map((f) => f.ruleId));
    // Per-rule TP / FP / FN accumulation. Each ruleId counts once per
    // fixture regardless of finding multiplicity — the load-bearing
    // question is "did the rule fire on this fixture or not", not
    // "how many times".
    for (const rid of emittedSet) {
      if (expectedSet.has(rid)) bumpTp(rid);
      else bumpFp(rid);
    }
    for (const rid of expectedSet) {
      if (!emittedSet.has(rid)) bumpFn(rid);
    }
    fixtureSummaries.push({
      name: basename(fixturePath),
      expected: expectedSet.size,
      emitted: emittedSet.size,
      elapsedMs: Math.round(elapsed * 1000) / 1000,
    });
  }

  // Print summary.
  console.log('# mcp-guard benchmark — TP / FP / FN per rule\n');
  console.log(`Fixtures evaluated: ${totalFixtures}`);
  console.log(`Generated at: ${new Date().toISOString()}\n`);
  console.log('## Per-fixture summary\n');
  console.log('| Fixture | Expected rules | Emitted rules | Scan time (ms) |');
  console.log('|---|---:|---:|---:|');
  for (const s of fixtureSummaries) {
    console.log(`| ${s.name} | ${s.expected} | ${s.emitted} | ${s.elapsedMs} |`);
  }
  console.log('\n## Per-rule rollup\n');
  console.log(summariseTable(perRule));

  // Persist to disk so CI / docs/BENCHMARK.md can ingest the latest
  // table without re-running locally.
  const outDir = join(process.cwd(), 'docs');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString();
  const persist = [
    '<!-- generated by scripts/benchmark.ts -->',
    `<!-- generated_at: ${stamp} -->`,
    '',
    '# Benchmark output (auto-generated, do not hand-edit)',
    '',
    `Fixtures evaluated: ${totalFixtures}`,
    '',
    '## Per-fixture summary',
    '',
    '| Fixture | Expected rules | Emitted rules | Scan time (ms) |',
    '|---|---:|---:|---:|',
    ...fixtureSummaries.map((s) => `| ${s.name} | ${s.expected} | ${s.emitted} | ${s.elapsedMs} |`),
    '',
    '## Per-rule rollup',
    '',
    summariseTable(perRule),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'BENCHMARK.generated.md'), persist);

  // Exit non-zero if any FP or FN — reviewer signal for drift.
  let totalFp = 0;
  let totalFn = 0;
  for (const r of perRule.values()) {
    totalFp += r.fp;
    totalFn += r.fn;
  }
  return totalFp === 0 && totalFn === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
