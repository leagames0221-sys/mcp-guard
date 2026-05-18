// Node runtime gate (T-32, AC-005-5 + AC-005-6). Runs as the first
// executable statement in src/cli/index.ts so users on a too-old
// runtime get an actionable error before commander even loads.
//
// "Too old" = major < MIN_NODE_MAJOR. We do not look at minor/patch
// because Node's API + ESM behaviour we depend on (top-level await,
// fetch, AbortSignal, performance.now) all stabilized at 20.0 LTS.

import { ExitCode } from '../errors/index.js';
import type { ExitCodeValue } from '../errors/index.js';

export const MIN_NODE_MAJOR = 20;

export interface NodeVersionCheckResult {
  ok: boolean;
  observed: string;
  observedMajor: number;
  exitCode: ExitCodeValue;
  message?: string;
}

// Parse `vMAJOR.MINOR.PATCH` (the form process.version returns) into
// its major component. Defensive — process.version is always set by
// Node, but a hostile / unusual embedder could in principle return
// something else.
export function parseMajor(versionString: string): number {
  const m = versionString.match(/^v?(\d+)\./);
  return m !== null ? Number.parseInt(m[1]!, 10) : Number.NaN;
}

export function checkNodeVersion(versionString: string): NodeVersionCheckResult {
  const major = parseMajor(versionString);
  if (!Number.isFinite(major)) {
    return {
      ok: false,
      observed: versionString,
      observedMajor: Number.NaN,
      exitCode: ExitCode.ConfigError,
      message:
        `Could not parse Node.js version string "${versionString}". ` +
        `mcp-guard requires Node.js ${MIN_NODE_MAJOR} or newer. ` +
        `Install from https://nodejs.org/ and re-run.`,
    };
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      ok: false,
      observed: versionString,
      observedMajor: major,
      exitCode: ExitCode.ConfigError,
      message:
        `mcp-guard requires Node.js ${MIN_NODE_MAJOR} or newer; observed ${versionString}. ` +
        `Install Node.js ${MIN_NODE_MAJOR} LTS from https://nodejs.org/ and re-run.`,
    };
  }
  return { ok: true, observed: versionString, observedMajor: major, exitCode: ExitCode.Success };
}

// Convenience wrapper invoked from src/cli/index.ts entry point. Writes
// the message to stderr + returns the exit code so the caller can
// process.exit(...) at the literal entry point boundary.
export function enforceNodeVersion(
  versionString: string,
  stderr: NodeJS.WritableStream = process.stderr,
): NodeVersionCheckResult {
  const result = checkNodeVersion(versionString);
  if (!result.ok && result.message !== undefined) {
    stderr.write(`${result.message}\n`);
  }
  return result;
}
