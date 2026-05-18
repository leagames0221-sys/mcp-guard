// `mcp-guard inject [corpus]` subcommand body. Composes T-23 loader
// + T-25 detectors + T-26 harness into one end-to-end invocation.
// Returns `{exitCode, report}` so the commander wrapper at T-30 can
// map shouldExitNonZero → exit 1.
//
// Paid-API 6-layer defense: this subcommand NEVER instantiates a paid
// provider. opts.provider is the only escape; default = no provider →
// harness auto-falls-back to MockLlmProvider (AC-002-2).

import { join } from 'node:path';

import { runHarness, serializeHarnessReport, type HarnessReport } from '../harness/index.js';
import { loadProbeDirectory } from '../probes/loader.js';
import type { LlmProvider } from '../providers/llm/types.js';
import type { SeverityLevel } from '../types/index.js';
import { ExitCode } from '../errors/index.js';
import type { ExitCodeValue } from '../errors/index.js';

export interface InjectCliOptions {
  corpusDir?: string;
  provider?: LlmProvider;
  severityFloor?: SeverityLevel;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  signal?: AbortSignal;
}

export interface InjectCliResult {
  exitCode: ExitCodeValue;
  report: HarnessReport;
}

export async function runInject(opts: InjectCliOptions = {}): Promise<InjectCliResult> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const corpus = opts.corpusDir ?? join(process.cwd(), 'src', 'probes', 'owasp');

  const probes = await loadProbeDirectory(corpus);

  const harnessOpts: {
    provider?: LlmProvider;
    severityFloor?: SeverityLevel;
    stderr: NodeJS.WritableStream;
    signal?: AbortSignal;
  } = { stderr };
  if (opts.provider !== undefined) harnessOpts.provider = opts.provider;
  if (opts.severityFloor !== undefined) harnessOpts.severityFloor = opts.severityFloor;
  if (opts.signal !== undefined) harnessOpts.signal = opts.signal;

  const report = await runHarness(probes, harnessOpts);

  stdout.write(serializeHarnessReport(report));

  const exitCode: ExitCodeValue = report.shouldExitNonZero
    ? ExitCode.FindingsExceedThreshold
    : ExitCode.Success;
  return { exitCode, report };
}
