// Anthropic paid-API LLM provider. Constructor enforces AC-NF-1 at the
// instance boundary — both `ANTHROPIC_API_KEY` and an explicit
// `MCP_GUARD_LLM_PROVIDER=anthropic` must be present, otherwise the
// constructor throws `ConfigError` before any network call can occur.
// This is layered defense on top of the config-layer gate (T-08).
//
// AC-NF-3 + cross-PJ Anthropic API auto-call ban: this file never invokes
// fetch unless the harness explicitly constructs an instance — tests stub
// `globalThis.fetch` to keep CI traffic at zero.

import { ConfigError } from '../../errors/index.js';
import type { LlmGenerateOptions, LlmProvider } from './types.js';

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-6';
export const ANTHROPIC_API_VERSION = '2023-06-01';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  providerFlag?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: unknown;
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
}

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  readonly #apiKey: string;

  constructor(opts: AnthropicProviderOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    const providerFlag = opts.providerFlag ?? env.MCP_GUARD_LLM_PROVIDER;
    const apiKey = opts.apiKey ?? env.ANTHROPIC_API_KEY;

    const flagOk = providerFlag === 'anthropic';
    const keyOk = typeof apiKey === 'string' && apiKey.length > 0;

    if (!flagOk && !keyOk) {
      throw new ConfigError(
        "paid API gate: both ANTHROPIC_API_KEY and MCP_GUARD_LLM_PROVIDER='anthropic' are required (AC-NF-1)",
        { gate: 'AC-NF-1', missing: 'both' },
      );
    }
    if (!flagOk) {
      throw new ConfigError(
        "paid API gate: MCP_GUARD_LLM_PROVIDER must be explicitly set to 'anthropic' (AC-NF-1)",
        { gate: 'AC-NF-1', missing: 'provider_flag' },
      );
    }
    if (!keyOk) {
      throw new ConfigError(
        'paid API gate: ANTHROPIC_API_KEY env var is required (AC-NF-1)',
        { gate: 'AC-NF-1', missing: 'api_key' },
      );
    }

    this.#apiKey = apiKey as string;
    this.model = opts.model ?? ANTHROPIC_DEFAULT_MODEL;
  }

  // Anthropic does not expose a cheap liveness probe and any call is
  // billable. Constructor success implies the gate passed; the harness
  // treats true here as 'configured' rather than as a network probe.
  async health(): Promise<boolean> {
    return true;
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: opts?.maxTokens ?? 1024,
      messages: [{ role: 'user', content: prompt }],
    };
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;

    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.#apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(body),
    };
    if (opts?.signal) init.signal = opts.signal;

    const res = await fetch(ANTHROPIC_API_URL, init);
    if (!res.ok) {
      // The key is never echoed into the error string — only HTTP context.
      throw new Error(`anthropic: HTTP ${res.status} ${res.statusText}`);
    }
    const parsed = (await res.json()) as AnthropicMessagesResponse;
    const first = parsed.content?.[0];
    if (!first || first.type !== 'text' || typeof first.text !== 'string') {
      throw new Error('anthropic: malformed response — missing text content block');
    }
    return first.text;
  }
}
