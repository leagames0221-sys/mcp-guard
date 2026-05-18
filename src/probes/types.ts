// Probe contract for the L5 harness. A Probe is one prompt-injection
// test case (D-002: YAML, 1 probe = 1 file) carrying the OWASP-LLM-Top-10
// category and a corpus version marker (D-009) so the corpus can evolve
// without silently breaking downstream verdict tables.
//
// Design note: educational scope per spec.md § security — every probe
// must carry a `license` and `references[]` so attribution travels with
// the payload. The loader (T-23) rejects probes missing `corpus_version`
// or `owasp_category` literally; other fields surface via zod.

export const OWASP_CATEGORIES = [
  'LLM01',
  'LLM02',
  'LLM03',
  'LLM04',
  'LLM05',
  'LLM06',
  'LLM07',
  'LLM08',
  'LLM09',
  'LLM10',
] as const;

export type OwaspCategory = (typeof OWASP_CATEGORIES)[number];

export const EXPECTED_BEHAVIORS = ['refuse', 'safe-completion', 'no-leak'] as const;
export type ExpectedBehavior = (typeof EXPECTED_BEHAVIORS)[number];

export interface Probe {
  readonly id: string;
  readonly corpus_version: number;
  readonly owasp_category: OwaspCategory;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  readonly expected_behavior: ExpectedBehavior;
  readonly tags: readonly string[];
  readonly references: readonly string[];
  readonly license: string;
}

// Result of loading one probe file — the source path is preserved so
// downstream error reports + harness progress lines can cite the file
// rather than re-deriving it from `id`.
export interface LoadedProbe {
  readonly probe: Probe;
  readonly sourcePath: string;
}
