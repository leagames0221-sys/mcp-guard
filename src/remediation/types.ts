// Remediation contract — output shape for F-003 remediation engine.
// AC-003-1: per-finding {severity, category, suggested_patch,
// references[]}. AC-003-3: `source: 'template'` when no LLM ran.
// AC-003-2: `source: 'llm'` when an LLM provider enriched the output.

import type { ScannerCategory } from '../scanners/types.js';
import type { SeverityLevel } from '../types/index.js';

export type RemediationSource = 'template' | 'llm';

export interface Remediation {
  readonly findingId: string;
  readonly ruleId: string;
  readonly category: ScannerCategory;
  readonly severity: SeverityLevel;
  readonly suggested_patch: string;
  readonly references: readonly string[];
  readonly source: RemediationSource;
}

// Static template body — the per-ruleId payload before per-finding
// fields (findingId / severity from the finding itself) are spliced in.
export interface RemediationTemplate {
  readonly category: ScannerCategory;
  readonly suggested_patch: string;
  readonly references: readonly string[];
}
