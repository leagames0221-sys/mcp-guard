// OpenAI paid-API LLM provider. Same instance-boundary gate as
// AnthropicLlmProvider: constructor throws `ConfigError` unless both
// `OPENAI_API_KEY` and an explicit `MCP_GUARD_LLM_PROVIDER=openai` are
// present (AC-NF-1). AC-NF-3 + zero auto-call in CI is preserved by
// stubbing fetch in tests.

import { ConfigError } from '../../errors/index.js';
import { PaidApiBudget } from './budget.js';
import type { LlmGenerateOptions, LlmProvider } from './types.js';

export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
export const OPENAI_DEFAULT_MAX_TOKENS = 1024;

export interface OpenAiProviderOptions {
  apiKey?: string;
  model?: string;
  providerFlag?: string;
  budget?: PaidApiBudget;
}

interface OpenAiChatChoice {
  message?: { content?: unknown };
}

interface OpenAiChatResponse {
  choices?: OpenAiChatChoice[];
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  readonly budget: PaidApiBudget;
  readonly #apiKey: string;

  constructor(opts: OpenAiProviderOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    const providerFlag = opts.providerFlag ?? env.MCP_GUARD_LLM_PROVIDER;
    const apiKey = opts.apiKey ?? env.OPENAI_API_KEY;

    const flagOk = providerFlag === 'openai';
    const keyOk = typeof apiKey === 'string' && apiKey.length > 0;

    if (!flagOk && !keyOk) {
      throw new ConfigError(
        "paid API gate: both OPENAI_API_KEY and MCP_GUARD_LLM_PROVIDER='openai' are required (AC-NF-1)",
        { gate: 'AC-NF-1', missing: 'both' },
      );
    }
    if (!flagOk) {
      throw new ConfigError(
        "paid API gate: MCP_GUARD_LLM_PROVIDER must be explicitly set to 'openai' (AC-NF-1)",
        { gate: 'AC-NF-1', missing: 'provider_flag' },
      );
    }
    if (!keyOk) {
      throw new ConfigError(
        'paid API gate: OPENAI_API_KEY env var is required (AC-NF-1)',
        { gate: 'AC-NF-1', missing: 'api_key' },
      );
    }

    this.#apiKey = apiKey as string;
    this.model = opts.model ?? OPENAI_DEFAULT_MODEL;
    this.budget = opts.budget ?? new PaidApiBudget({}, env);
  }

  async health(): Promise<boolean> {
    return true;
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<string> {
    const maxTokens = opts?.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS;
    this.budget.reserve(maxTokens);

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    };
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify(body),
    };
    if (opts?.signal) init.signal = opts.signal;

    const res = await fetch(OPENAI_API_URL, init);
    if (!res.ok) {
      throw new Error(`openai: HTTP ${res.status} ${res.statusText}`);
    }
    const parsed = (await res.json()) as OpenAiChatResponse;
    const first = parsed.choices?.[0];
    const content = first?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('openai: malformed response — missing message.content');
    }
    return content;
  }
}
