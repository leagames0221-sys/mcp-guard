// Canonical JSON report shape + emitter. AC-001-4: a clean report is
// defined by `results.length === 0` (an empty array is the positive
// signal, not absence of the field). AC-NF-7 satisfied by delegating
// the write to writeAtomic.

import { writeAtomic } from './atomic.js';
import type { SeverityLevel } from '../../types/index.js';

export const REPORT_SCHEMA_VERSION = '1.0';
export const TOOL_NAME = 'mcp-guard';

export interface Finding {
  id: string;
  ruleId: string;
  severity: SeverityLevel;
  source: 'static' | 'llm' | 'mock';
  message: string;
  path?: string;
  line?: number;
  col?: number;
  details?: Record<string, unknown>;
}

export interface ScanReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAt: string;
  tool: {
    name: typeof TOOL_NAME;
    version: string;
  };
  target: string;
  results: Finding[];
}

export interface BuildReportOptions {
  target: string;
  findings?: Finding[];
  toolVersion?: string;
  generatedAt?: string;
}

export function buildReport(opts: BuildReportOptions): ScanReport {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    tool: {
      name: TOOL_NAME,
      version: opts.toolVersion ?? '0.0.0',
    },
    target: opts.target,
    results: opts.findings ?? [],
  };
}

export function isCleanReport(report: ScanReport): boolean {
  return report.results.length === 0;
}

export function serializeReport(report: ScanReport): string {
  // Trailing newline keeps POSIX tooling and line-oriented diffs happy.
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function emitJsonReport(
  report: ScanReport,
  outputPath: string,
): Promise<void> {
  await writeAtomic(outputPath, serializeReport(report));
}
