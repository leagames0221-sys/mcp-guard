// Harness contract — sequential executor for the L5 prompt-injection
// pipeline. Per D-006 the harness is strictly serial: no Promise.all,
// no worker pool. This bounds provider load (Ollama on consumer
// hardware) and keeps stderr progress monotonic.
//
// Severity is derived per OWASP category. The detector verdict is
// orthogonal — a probe passes when its detector returns pass=true,
// fails otherwise. A failing probe carries the category's severity
// for the `--severity` exit gate (AC-002-4).

import type { OwaspCategory } from '../probes/types.js';
import type { LlmProviderName, SeverityLevel } from '../types/index.js';
import type { Verdict } from '../detectors/index.js';

// AC-002-4 severity ordering (low < medium < high < critical). Used
// for `--severity` exit gating: if any failed probe's severity is at
// or above the floor, exit non-zero.
export const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// OWASP LLM Top 10 → default severity. Categories where leak / agency
// abuse causes external-facing harm are scored highest. This mapping
// is the only place that opinions about category risk; downstream
// reporting reads it as data.
export const CATEGORY_SEVERITY: Record<OwaspCategory, SeverityLevel> = {
  LLM01: 'high',       // Prompt Injection
  LLM02: 'critical',   // Sensitive Information Disclosure
  LLM03: 'high',       // Supply Chain
  LLM04: 'high',       // Data and Model Poisoning
  LLM05: 'high',       // Improper Output Handling
  LLM06: 'critical',   // Excessive Agency
  LLM07: 'medium',     // System Prompt Leakage
  LLM08: 'medium',     // Vector and Embedding Weaknesses
  LLM09: 'medium',     // Misinformation
  LLM10: 'medium',     // Unbounded Consumption
};

export interface ProbeResult {
  readonly probeId: string;
  readonly owaspCategory: OwaspCategory;
  readonly severity: SeverityLevel;
  readonly verdict: Verdict;
  readonly providerName: LlmProviderName;
  readonly durationMs: number;
  readonly sourcePath: string;
}

export interface CategoryTotals {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
}

export interface HarnessReport {
  readonly results: readonly ProbeResult[];
  readonly totals: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly byCategory: Readonly<Record<OwaspCategory, CategoryTotals>>;
  };
  readonly providerUsed: LlmProviderName;
  readonly fallbackToMock: boolean;
  readonly severityFloor: SeverityLevel;
  readonly shouldExitNonZero: boolean;
}

export interface HarnessOptions {
  // Caller-constructed provider. If omitted OR health() returns false,
  // the harness falls back to the mock provider with a stderr warning
  // (AC-002-2). The harness MUST NEVER instantiate a paid provider on
  // its own — paid-API 6-layer defense lives in the provider
  // constructor gate (T-13 AC-NF-1).
  provider?: import('../providers/llm/types.js').LlmProvider;
  severityFloor?: SeverityLevel;
  stderr?: NodeJS.WritableStream;
  // Cooperative cancellation propagated to the provider.
  signal?: AbortSignal;
  // Test seam: override clock so durationMs is deterministic. Real
  // callers leave this undefined and the harness uses performance.now.
  now?: () => number;
}
