// L4 Scanner registry. AC-001-1: 4 detector categories (SSRF /
// command-injection / auth-gap / supply-chain-risk). T-18 wires the
// registry shape + no-op stubs; T-19..T-22 each replace one stub
// with a real detector in its own file.

import type { Finding } from '../io/emitters/json.js';
import { type ScanContext, type Scanner } from './types.js';
import { ssrfScanner } from './ssrf.js';
import { commandInjectionScanner } from './command-injection.js';
import { authGapScanner } from './auth-gap.js';
import { supplyChainScanner } from './supply-chain.js';

export { SCANNER_CATEGORIES, makeFindingId } from './types.js';
export type { Scanner, ScanContext, ScannerCategory } from './types.js';
export { ssrfScanner, evaluateSsrfUrl } from './ssrf.js';
export {
  commandInjectionScanner,
  evaluateCommandInjection,
  type CmdInjInput,
} from './command-injection.js';
export {
  authGapScanner,
  evaluateAuthGap,
  evaluateHttpAuthGap,
  evaluateStdioAuthGap,
} from './auth-gap.js';
export {
  supplyChainScanner,
  evaluateStdioSupplyChain,
  evaluateHttpSupplyChain,
  extractPackageSpec,
  parsePackageSpec,
} from './supply-chain.js';

// Returns one Scanner per ScannerCategory in canonical order. The
// returned array is fresh each call so callers may mutate / filter
// without affecting other call sites. All 4 slots are real
// detectors as of T-22 (no stubs remaining).
export function createScannerRegistry(): Scanner[] {
  return [
    ssrfScanner,
    commandInjectionScanner,
    authGapScanner,
    supplyChainScanner,
  ];
}

// Convenience: invoke every registered scanner against `ctx` and
// flatten the findings. Each scanner is invoked exactly once; an
// individual scanner returning [] contributes nothing.
export function runAllScanners(ctx: ScanContext, scanners?: Scanner[]): Finding[] {
  const registry = scanners ?? createScannerRegistry();
  const out: Finding[] = [];
  for (const scanner of registry) {
    for (const finding of scanner.scan(ctx)) {
      out.push(finding);
    }
  }
  return out;
}
