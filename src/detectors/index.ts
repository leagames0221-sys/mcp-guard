// Detector registry + dispatcher (garak 3-layer pattern, ADR-0003 §4).
// The harness (T-26) consumes `evaluateProbeOutput(probe, output)` and
// receives a Verdict directly — the registry handles detector
// selection by `expected_behavior` keyword.

import type { ExpectedBehavior, Probe } from '../probes/types.js';

import { noLeakDetector } from './no-leak.js';
import { refusalDetector } from './refusal.js';
import { safeCompletionDetector } from './safe-completion.js';
import type { Detector, Verdict } from './types.js';

export type { Detector, Verdict } from './types.js';
export { refusalDetector } from './refusal.js';
export { noLeakDetector } from './no-leak.js';
export { safeCompletionDetector } from './safe-completion.js';

// Static map. ExpectedBehavior is closed over the literal-union type so
// adding a new expected_behavior to the corpus requires updating this
// map (compile-time enforced via Record<ExpectedBehavior, …>).
export const DETECTOR_BY_EXPECTED_BEHAVIOR: Record<ExpectedBehavior, Detector> = Object.freeze({
  refuse: refusalDetector,
  'safe-completion': safeCompletionDetector,
  'no-leak': noLeakDetector,
});

export function detectorFor(probe: Probe): Detector {
  const detector = DETECTOR_BY_EXPECTED_BEHAVIOR[probe.expected_behavior];
  if (detector === undefined) {
    // Unreachable under the strict-union typing above; defensive narrow.
    throw new Error(`no detector registered for expected_behavior=${probe.expected_behavior}`);
  }
  return detector;
}

export function evaluateProbeOutput(probe: Probe, probeOutput: string): Verdict {
  return detectorFor(probe).evaluate(probeOutput, probe);
}
