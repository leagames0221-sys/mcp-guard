// LlmProvider — D-004 minimal contract for the 4 concrete impls
// (mock / ollama / anthropic / openai). No abstract class, no adapter
// layer: waste-zero, 4 explicit impls beat a class hierarchy.

import type { LlmProviderName } from '../../types/index.js';

export interface LlmGenerateOptions {
  // Bounded randomness; provider may clamp or ignore.
  temperature?: number;
  // Hard upper bound on completion tokens, when supported.
  maxTokens?: number;
  // Cooperative cancellation.
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  generate(prompt: string, opts?: LlmGenerateOptions): Promise<string>;
  // Cheap reachability probe. Must not invoke generate(). Returns false on
  // any failure (network / auth / not-installed) without throwing.
  health(): Promise<boolean>;
}
