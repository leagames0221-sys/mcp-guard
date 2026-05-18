// Console emitter — renders a ScanReport as human-readable terminal text.
// All hostile-content surfaces (target path, finding message, ruleId,
// finding path) are run through `sanitize` (T-07) before they touch the
// stream, so a probe can never inject ANSI cursor moves or control bytes
// into the operator's terminal (AC-NF-4).
//
// Colour is applied only when the operator opts in or when the stream is
// a TTY; the no-color.org convention is honoured via the NO_COLOR env
// var (any non-empty value disables colour).
//
// Progress reporting [N/M] <probe-name> belongs to the logger module
// (AC-002-3, already wired in T-07.progress); this emitter is concerned
// with the final report rendering only.

import { sanitize } from '../../logger/sanitize.js';
import type { Finding, ScanReport } from './json.js';
import type { SeverityLevel } from '../../types/index.js';

export interface ConsoleEmitOptions {
  // Explicit override; if omitted, auto-detect from NO_COLOR + TTY.
  color?: boolean;
  stream?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

const SEVERITY_COLOURS: Record<SeverityLevel, string> = {
  critical: '[1;31m', // bold red
  high: '[31m', // red
  medium: '[33m', // yellow
  low: '[36m', // cyan
};
const GREEN = '[32m';
const RESET = '[0m';

interface ResolvedColour {
  use: boolean;
  stream: NodeJS.WritableStream;
  env: NodeJS.ProcessEnv;
}

function resolveColour(opts: ConsoleEmitOptions): ResolvedColour {
  const stream = opts.stream ?? process.stdout;
  const env = opts.env ?? process.env;
  let use: boolean;
  if (opts.color !== undefined) {
    use = opts.color;
  } else if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    use = false;
  } else {
    use = (stream as NodeJS.WriteStream).isTTY === true;
  }
  return { use, stream, env };
}

function paint(use: boolean, colour: string, text: string): string {
  return use ? `${colour}${text}${RESET}` : text;
}

function countBySeverity(findings: Finding[]): Record<SeverityLevel, number> {
  const counts: Record<SeverityLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function formatLocation(finding: Finding): string {
  if (!finding.path) return '';
  let out = sanitize(finding.path);
  if (finding.line !== undefined) out += `:${finding.line}`;
  if (finding.col !== undefined) out += `:${finding.col}`;
  return out;
}

function formatFinding(finding: Finding, useColour: boolean): string {
  const tag = paint(useColour, SEVERITY_COLOURS[finding.severity], finding.severity.toUpperCase());
  const head = `[${tag}] ${sanitize(finding.ruleId)} (${finding.id})`;
  const body = `  ${sanitize(finding.message)}`;
  const loc = formatLocation(finding);
  return loc ? `${head}\n${body}\n  at ${loc}` : `${head}\n${body}`;
}

export function renderReport(report: ScanReport, opts: ConsoleEmitOptions = {}): string {
  const { use } = resolveColour(opts);
  const lines: string[] = [];

  lines.push(`mcp-guard ${sanitize(report.tool.version)} — target: ${sanitize(report.target)}`);
  lines.push(`generated: ${sanitize(report.generatedAt)}`);

  if (report.results.length === 0) {
    lines.push(paint(use, GREEN, '✓ clean (0 findings)'));
    return `${lines.join('\n')}\n`;
  }

  const counts = countBySeverity(report.results);
  const total = report.results.length;
  const plural = total === 1 ? 'finding' : 'findings';
  lines.push(
    `${total} ${plural} (critical=${counts.critical} high=${counts.high} medium=${counts.medium} low=${counts.low})`,
  );
  lines.push('');

  for (const f of report.results) {
    lines.push(formatFinding(f, use));
  }

  return `${lines.join('\n')}\n`;
}

export function emitConsoleReport(report: ScanReport, opts: ConsoleEmitOptions = {}): void {
  const stream = opts.stream ?? process.stdout;
  stream.write(renderReport(report, opts));
}
