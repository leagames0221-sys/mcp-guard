// Ollama LLM provider — local-first, stdlib `fetch` only, no Ollama SDK npm
// dependency (D-WASTE-ZERO). AC-NF-5 host containment is enforced upstream
// by the config layer (only `MCP_GUARD_OLLAMA_HOST` may override the
// localhost default); this provider trusts the constructed host string.
//
// API surface targeted: `/api/tags` for liveness + `/api/generate` for
// completions (non-streaming). See Ollama docs.

import type { LlmGenerateOptions, LlmProvider } from './types.js';

export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'gemma3:4b';

export interface OllamaProviderOptions {
  host?: string;
  model?: string;
}

interface OllamaGenerateResponse {
  response?: unknown;
}

export class OllamaLlmProvider implements LlmProvider {
  readonly name = 'ollama' as const;
  readonly host: string;
  readonly model: string;

  constructor(opts?: OllamaProviderOptions) {
    this.host = opts?.host ?? DEFAULT_OLLAMA_HOST;
    this.model = opts?.model ?? DEFAULT_OLLAMA_MODEL;
  }

  // Cheap liveness check. Returns false on any failure (network refused,
  // non-2xx, malformed reply) without throwing. Must not invoke generate().
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
    };
    const tuning: Record<string, unknown> = {};
    if (opts?.temperature !== undefined) tuning.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) tuning.num_predict = opts.maxTokens;
    if (Object.keys(tuning).length > 0) body.options = tuning;

    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };
    if (opts?.signal) init.signal = opts.signal;

    const res = await fetch(`${this.host}/api/generate`, init);
    if (!res.ok) {
      throw new Error(`ollama: HTTP ${res.status} ${res.statusText}`);
    }
    const parsed = (await res.json()) as OllamaGenerateResponse;
    if (typeof parsed.response !== 'string') {
      throw new Error('ollama: malformed response — missing string `response` field');
    }
    return parsed.response;
  }
}
