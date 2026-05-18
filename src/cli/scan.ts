// `mcp-guard scan <config>` subcommand body. Composes T-14 parser +
// T-18..T-22 scanners + T-15/T-16/T-17 emitters into one end-to-end
// invocation. Returns a `{exitCode, report}` pair so the commander
// wrapper at T-30 can map it to process.exit() at the entry point.
//
// AC-005-6 + AC-001-2 + AC-001-4 contract:
//   - parser throws  → exit 65 (DataFormatError) / 74 (IoError) / 2
//                       (InvalidInputError)        — handled by caller
//   - findings empty + threshold any → exit 0
//   - findings present + at-or-above threshold → exit 1
//   - --format json|sarif|console picks the emitter
//   - --output <path> writes JSON/SARIF to disk; console emits to stdout

import { readMcpConfig } from '../io/parsers/mcp-config.js';
import { buildReport, emitJsonReport, serializeReport, type ScanReport } from '../io/emitters/json.js';
import { buildSarifLog, serializeSarifLog, emitSarifReport } from '../io/emitters/sarif.js';
import { renderReport } from '../io/emitters/console.js';
import { runAllScanners } from '../scanners/index.js';
import type { SeverityLevel } from '../types/index.js';
import { SEVERITY_ORDER } from '../harness/types.js';
import { ExitCode } from '../errors/index.js';
import type { ExitCodeValue } from '../errors/index.js';

export interface ScanCliOptions {
  config: string;
  format?: 'json' | 'sarif' | 'console';
  output?: string;
  failOnSeverity?: SeverityLevel;
  toolVersion?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export interface ScanCliResult {
  exitCode: ExitCodeValue;
  report: ScanReport;
}

export async function runScan(opts: ScanCliOptions): Promise<ScanCliResult> {
  const stdout = opts.stdout ?? process.stdout;
  const fmt = opts.format ?? 'console';
  const failOn: SeverityLevel = opts.failOnSeverity ?? 'high';
  const floor = SEVERITY_ORDER[failOn];

  const { path: target, config } = await readMcpConfig(opts.config);
  const findings = runAllScanners({ config, target });
  const report = buildReport({
    target,
    findings,
    toolVersion: opts.toolVersion ?? '0.0.0',
  });

  // Threshold gate (AC-005-6): exit 1 if any finding's severity is at
  // or above the configured floor; otherwise exit 0.
  const breachesFloor = findings.some((f) => SEVERITY_ORDER[f.severity] >= floor);
  const exitCode: ExitCodeValue = breachesFloor ? ExitCode.FindingsExceedThreshold : ExitCode.Success;

  // Emit: console → stdout, json/sarif → file when --output set, else
  // serialized text to stdout. AC-NF-7 atomic write only on disk path.
  if (fmt === 'console') {
    stdout.write(renderReport(report));
  } else if (fmt === 'json') {
    if (opts.output !== undefined) {
      await emitJsonReport(report, opts.output);
    } else {
      stdout.write(serializeReport(report));
    }
  } else {
    if (opts.output !== undefined) {
      await emitSarifReport(report, opts.output);
    } else {
      stdout.write(serializeSarifLog(buildSarifLog(report)));
    }
  }

  return { exitCode, report };
}
