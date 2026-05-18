// Detector contract — garak 3-layer pattern per ADR-0003 §4. A detector
// is a pure function over (probeOutput, probe): no LLM call, no I/O,
// deterministic given the same inputs. This keeps verdict tables
// reproducible across runs and CI environments.
//
// `score` is in [0, 1]: 1 = strongly passing, 0 = strongly failing. The
// boolean `pass` is the harness-facing decision and may apply a
// threshold internal to the detector. `reason` is one short line
// suitable for the console emitter (T-17 sanitize already applied at
// emit time, not here).

import type { Probe } from '../probes/types.js';

export interface Verdict {
  readonly pass: boolean;
  readonly score: number;
  readonly reason: string;
}

export interface Detector {
  readonly name: string;
  evaluate(probeOutput: string, probe: Probe): Verdict;
}
