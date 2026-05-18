// L4 Scanner registry. AC-001-1: 4 detector categories (SSRF /
// command-injection / auth-gap / supply-chain-risk). T-18 wires the
// registry shape + no-op stubs; T-19..T-22 each replace one stub
// with a real detector in its own file.

import type { Finding } from '../io/emitters/json.js';
import {
  SCANNER_CATEGORIES,
  type ScanContext,
  type Scanner,
  type ScannerCategory,
} from './types.js';

export { SCANNER_CATEGORIES, makeFindingId } from './types.js';
export type { Scanner, ScanContext, ScannerCategory } from './types.js';

// Stub detector — kept private so the only export surface is the
// registry factory. T-19..T-22 each lift one stub into its own file
// (src/scanners/ssrf.ts etc.) and the registry import is updated.
function makeStubScanner(category: ScannerCategory): Scanner {
  return {
    category,
    scan(_ctx: ScanContext): Finding[] {
      return [];
    },
  };
}

// Returns one Scanner per ScannerCategory in canonical order. The
// returned array is fresh each call so callers may mutate / filter
// without affecting other call sites.
export function createScannerRegistry(): Scanner[] {
  return SCANNER_CATEGORIES.map(makeStubScanner);
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
