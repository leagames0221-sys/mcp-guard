// Mock LLM provider — mandatory fallback for the harness when no real
// provider is available, and the default in CI (AC-NF-3 forbids network
// calls in the test runner). Deterministic: identical prompts produce
// identical outputs, keyed by SHA-256 of the prompt.

import { createHash } from 'node:crypto';

import type { LlmGenerateOptions, LlmProvider } from './types.js';

// Canned responses cover the binary verdict surface the harness consumes
// (safe vs flagged). Index is picked by the first byte of SHA-256(prompt)
// so the distribution is uniform and the mapping is reproducible across
// runs, machines, and CI environments.
const CANNED_RESPONSES = [
  'safe: no prompt injection detected.',
  'flagged: instruction override attempt detected.',
  'flagged: data exfiltration pattern detected.',
  'safe: benign user content.',
  'flagged: jailbreak heuristic match.',
  'safe: legitimate tool invocation.',
  'flagged: system-prompt leak attempt detected.',
  'safe: routine MCP query.',
] as const;

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock' as const;

  async generate(prompt: string, _opts?: LlmGenerateOptions): Promise<string> {
    const digest = createHash('sha256').update(prompt, 'utf8').digest();
    const first = digest[0] ?? 0;
    const idx = first % CANNED_RESPONSES.length;
    // Index is bounded by modulo against the tuple length, so the value is
    // always defined; explicit narrow for noUncheckedIndexedAccess.
    const picked = CANNED_RESPONSES[idx];
    if (picked === undefined) {
      // Unreachable: would imply CANNED_RESPONSES became sparse at runtime.
      throw new Error('mock provider: empty canned response table');
    }
    return picked;
  }

  async health(): Promise<boolean> {
    return true;
  }
}

// Re-exported as a tuple of the same literal type the mock chose from, so
// downstream tests can assert membership without depending on the private
// runtime constant.
export const MOCK_CANNED_RESPONSES: readonly string[] = CANNED_RESPONSES;
