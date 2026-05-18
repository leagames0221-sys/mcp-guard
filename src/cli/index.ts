#!/usr/bin/env node
// CLI entry point. Wires three subcommands (scan / inject / suggest)
// via commander (D-001) and routes thrown errors to the sysexits-
// aligned exit-code table from src/errors/types.ts.
//
// Layer responsibilities (T-30/31/32):
//   - First executable line  → enforceNodeVersion (AC-005-5 + AC-005-6)
//   - commander Program       → 3 subcommands + descriptions + examples
//                               + --version sourced from package.json
//                               (AC-005-1/2/4 + D-001)
//   - showSuggestionAfterError → did-you-mean for unknown subcommands
//                               (AC-005-3 ≤ 3 distance, D-001)
//   - try/catch boundary      → exit-code mapping per docs/EXIT_CODES.md
//
// Paid-API 6-layer defense preserved: this entry point NEVER constructs
// a paid provider; provider construction is gated to opt-in flags that
// require the user to type the provider name + carry env credentials,
// composing with T-13 constructor gate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Command } from 'commander';

import { ExitCode, McpGuardError, resolveExitCode } from '../errors/index.js';
import { runInject } from './inject.js';
import { runScan } from './scan.js';
import { runSuggest } from './suggest.js';
import { enforceNodeVersion } from './node-version-check.js';
import type { SeverityLevel } from '../types/index.js';

const ALLOWED_SEVERITY: readonly SeverityLevel[] = ['low', 'medium', 'high', 'critical'];

function parseSeverity(value: string): SeverityLevel {
  if ((ALLOWED_SEVERITY as readonly string[]).includes(value)) {
    return value as SeverityLevel;
  }
  throw new Error(`severity must be one of: ${ALLOWED_SEVERITY.join(', ')} (got "${value}")`);
}

// Resolve package.json relative to the compiled CLI entry (dist/cli/
// index.js → dist/../package.json). Synchronous read is acceptable
// here — this runs once at startup and the file is local.
function loadPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/cli/index.js → dist/cli → dist → repo root → package.json
    const candidates = [
      join(here, '..', '..', 'package.json'),
      join(here, '..', 'package.json'),
    ];
    for (const candidate of candidates) {
      try {
        const text = readFileSync(candidate, 'utf-8');
        const pkg = JSON.parse(text) as { version?: string };
        if (typeof pkg.version === 'string') return pkg.version;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

export function buildProgram(version: string): Command {
  const program = new Command();
  program
    .name('mcp-guard')
    .description(
      'Defensive-first CLI for MCP server config scanning and LLM prompt-injection red-team harness.',
    )
    .version(version, '-V, --version', 'Print mcp-guard version and exit.')
    .showSuggestionAfterError(true) // T-31, AC-005-3 — commander's built-in
    .showHelpAfterError(false)
    .configureOutput({
      writeErr: (str) => process.stderr.write(str),
      writeOut: (str) => process.stdout.write(str),
    });

  // ── scan subcommand ────────────────────────────────────────────
  program
    .command('scan')
    .description('Scan a .mcp.json config file for SSRF, command-injection, auth-gap, and supply-chain risks.')
    .argument('<config>', 'Path to .mcp.json (or compatible MCP server config).')
    .option(
      '-f, --format <format>',
      'Output format: console | json | sarif.',
      'console',
    )
    .option('-o, --output <path>', 'Write JSON or SARIF output to a file path. Console format ignores this.')
    .option(
      '--fail-on-severity <level>',
      `Minimum severity that causes a non-zero exit. One of: ${ALLOWED_SEVERITY.join(' | ')}.`,
      'high',
    )
    .addHelpText(
      'after',
      `\nExamples:\n  $ mcp-guard scan .mcp.json\n  $ mcp-guard scan .mcp.json --format json --output report.json\n  $ mcp-guard scan .mcp.json --fail-on-severity medium\n`,
    )
    .action(async (configPath: string, rawOpts: { format?: string; output?: string; failOnSeverity?: string }) => {
      const fmt = (rawOpts.format ?? 'console') as 'console' | 'json' | 'sarif';
      if (!['console', 'json', 'sarif'].includes(fmt)) {
        throw new Error(`--format must be console, json, or sarif (got "${fmt}")`);
      }
      const sev = parseSeverity(rawOpts.failOnSeverity ?? 'high');
      const opts: Parameters<typeof runScan>[0] = {
        config: configPath,
        format: fmt,
        failOnSeverity: sev,
        toolVersion: version,
      };
      if (rawOpts.output !== undefined) opts.output = rawOpts.output;
      const { exitCode } = await runScan(opts);
      process.exitCode = exitCode;
    });

  // ── inject subcommand ──────────────────────────────────────────
  program
    .command('inject')
    .description('Run the OWASP LLM Top 10 prompt-injection harness against a registered LLM provider (default: mock).')
    .option('--corpus <dir>', 'Probe corpus directory (defaults to bundled src/probes/owasp).')
    .option(
      '--severity-floor <level>',
      `Minimum severity that causes a non-zero exit. One of: ${ALLOWED_SEVERITY.join(' | ')}.`,
      'high',
    )
    .addHelpText(
      'after',
      `\nExamples:\n  $ mcp-guard inject\n  $ mcp-guard inject --severity-floor critical\n  $ mcp-guard inject --corpus ./my-probes\n`,
    )
    .action(async (rawOpts: { corpus?: string; severityFloor?: string }) => {
      const sev = parseSeverity(rawOpts.severityFloor ?? 'high');
      const opts: Parameters<typeof runInject>[0] = { severityFloor: sev };
      if (rawOpts.corpus !== undefined) opts.corpusDir = rawOpts.corpus;
      const { exitCode } = await runInject(opts);
      process.exitCode = exitCode;
    });

  // ── suggest subcommand ─────────────────────────────────────────
  program
    .command('suggest')
    .description('Read a prior scan report.json and emit per-finding remediation suggestions.')
    .argument('<report>', 'Path to a prior scan output (JSON format).')
    .addHelpText(
      'after',
      `\nExamples:\n  $ mcp-guard scan .mcp.json --format json --output scan.json\n  $ mcp-guard suggest scan.json\n`,
    )
    .action(async (reportPath: string) => {
      await runSuggest({ reportPath });
      // suggest does not gate exit on findings — operator runs it for
      // guidance, not for CI pass/fail.
      process.exitCode = ExitCode.Success;
    });

  return program;
}

// `main` is the actual process entry. Kept separate from buildProgram
// so tests can construct + drive the program without invoking
// process.exit / process.argv coupling.
export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const versionCheck = enforceNodeVersion(process.version);
  if (!versionCheck.ok) return versionCheck.exitCode;

  const program = buildProgram(loadPackageVersion());

  try {
    await program.parseAsync([...argv]);
    return process.exitCode === undefined ? ExitCode.Success : (process.exitCode as number);
  } catch (err) {
    if (err instanceof McpGuardError) {
      process.stderr.write(`${err.name}: ${err.message}\n`);
      return err.exitCode;
    }
    // commander's CommanderError surfaces parser failures via this
    // path; respect its exitCode hint where present, else fall back
    // to the InternalError code.
    const exitField = (err as { exitCode?: number }).exitCode;
    if (typeof exitField === 'number') {
      process.stderr.write(`${(err as Error).message}\n`);
      return exitField;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return resolveExitCode(err);
  }
}

// Process entry — only run main() when this file is the direct
// invocation target (not when imported by tests).
const isDirect = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isDirect) {
  main().then((code) => {
    process.exit(code);
  });
}
