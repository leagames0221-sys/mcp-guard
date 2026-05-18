// `mcp-guard suggest <report.json>` subcommand (T-29, AC-003-4).
// Reads a prior scan report from disk, runs remediation against its
// `results[]` (template-only by default, LLM-enriched when a provider
// is supplied + healthy), and emits the remediation list to stdout
// as JSON.
//
// Error mapping mirrors T-14 parser:
//   filesystem failure         → IoError (exit 74)
//   malformed JSON             → DataFormatError (exit 65)
//   non-object / wrong schema  → InvalidInputError (exit 2)

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataFormatError, InvalidInputError, IoError } from '../errors/index.js';
import type { Finding, ScanReport } from '../io/emitters/json.js';
import type { LlmProvider } from '../providers/llm/types.js';
import { enrichFindings } from '../remediation/index.js';
import type { Remediation } from '../remediation/index.js';

export interface SuggestOptions {
  reportPath: string;
  provider?: LlmProvider;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  signal?: AbortSignal;
}

export interface SuggestResult {
  remediations: Remediation[];
  usedLlm: boolean;
}

const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);

function isFindingShape(v: unknown): v is Finding {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.ruleId === 'string' &&
    typeof o.severity === 'string' &&
    ALLOWED_SEVERITY.has(o.severity) &&
    typeof o.message === 'string'
  );
}

function parseReport(raw: string, sourcePath: string): ScanReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DataFormatError(`malformed JSON at ${sourcePath}: ${(err as Error).message}`, {
      sourcePath,
    });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidInputError(`report root must be a JSON object at ${sourcePath}`, {
      sourcePath,
    });
  }
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.results)) {
    throw new InvalidInputError(`report.results must be an array at ${sourcePath}`, {
      sourcePath,
    });
  }
  for (let i = 0; i < root.results.length; i += 1) {
    if (!isFindingShape(root.results[i])) {
      throw new InvalidInputError(`report.results[${i}] is not a Finding shape at ${sourcePath}`, {
        sourcePath,
        index: i,
      });
    }
  }
  return parsed as ScanReport;
}

export async function readReport(filePath: string): Promise<ScanReport> {
  const absolute = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolute, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'IO_ERROR';
    throw new IoError(`failed to read ${absolute}: ${(err as Error).message}`, {
      sourcePath: absolute,
      code,
    });
  }
  return parseReport(raw, absolute);
}

function serializeSuggestOutput(
  remediations: readonly Remediation[],
  usedLlm: boolean,
): string {
  const view = {
    schema: 'mcp-guard-suggest-output@1',
    usedLlm,
    count: remediations.length,
    remediations,
  };
  return `${JSON.stringify(view, null, 2)}\n`;
}

export async function runSuggest(opts: SuggestOptions): Promise<SuggestResult> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const report = await readReport(opts.reportPath);

  const enrichOpts: { stderr: NodeJS.WritableStream; signal?: AbortSignal } = { stderr };
  if (opts.signal !== undefined) enrichOpts.signal = opts.signal;
  const remediations = await enrichFindings(report.results, opts.provider, enrichOpts);
  const usedLlm = remediations.some((r) => r.source === 'llm');
  stdout.write(serializeSuggestOutput(remediations, usedLlm));
  return { remediations, usedLlm };
}
