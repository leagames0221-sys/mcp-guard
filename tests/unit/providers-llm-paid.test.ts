import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  AnthropicLlmProvider,
  ANTHROPIC_API_URL,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_API_VERSION,
  OpenAiLlmProvider,
  OPENAI_API_URL,
  OPENAI_DEFAULT_MODEL,
  PaidApiBudget,
  type LlmProvider,
} from '../../src/providers/llm/index.js';
import { ConfigError } from '../../src/errors/index.js';

// T-13 (AC-NF-1 paid-API gate + AC-NF-3 no auto-call in CI): both providers
// must throw ConfigError at construction unless BOTH the API key env var AND
// MCP_GUARD_LLM_PROVIDER=<name> are present. No real API call ever happens —
// fetch is stubbed for every test that exercises generate().

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

function stubFetch(impl: FetchStub) {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => {
    throw new Error('test bug: fetch was called without a stub (would violate AC-NF-3)');
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------- AnthropicLlmProvider gate ----------

describe('AnthropicLlmProvider — AC-NF-1 gate', () => {
  it('throws ConfigError when neither env var is set', () => {
    expect(() => new AnthropicLlmProvider({}, {})).toThrow(ConfigError);
    try {
      new AnthropicLlmProvider({}, {});
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).details).toMatchObject({ gate: 'AC-NF-1', missing: 'both' });
    }
  });

  it('throws ConfigError when only API key is set (provider flag missing)', () => {
    expect(() =>
      new AnthropicLlmProvider({}, { ANTHROPIC_API_KEY: 'sk-test-secret' }),
    ).toThrow(/provider/i);
    try {
      new AnthropicLlmProvider({}, { ANTHROPIC_API_KEY: 'sk-test-secret' });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).details).toMatchObject({ missing: 'provider_flag' });
      expect((err as Error).message).not.toContain('sk-test-secret');
    }
  });

  it('throws ConfigError when only provider flag is set (API key missing)', () => {
    expect(() =>
      new AnthropicLlmProvider({}, { MCP_GUARD_LLM_PROVIDER: 'anthropic' }),
    ).toThrow(/API_KEY/);
    try {
      new AnthropicLlmProvider({}, { MCP_GUARD_LLM_PROVIDER: 'anthropic' });
    } catch (err) {
      expect((err as ConfigError).details).toMatchObject({ missing: 'api_key' });
    }
  });

  it('throws when provider flag is set to a different provider value', () => {
    expect(
      () =>
        new AnthropicLlmProvider(
          {},
          { ANTHROPIC_API_KEY: 'sk-x', MCP_GUARD_LLM_PROVIDER: 'openai' },
        ),
    ).toThrow(/provider/i);
  });

  it('constructs successfully when both env vars are set', () => {
    const p = new AnthropicLlmProvider(
      {},
      { ANTHROPIC_API_KEY: 'sk-test', MCP_GUARD_LLM_PROVIDER: 'anthropic' },
    );
    const _typed: LlmProvider = p;
    expect(_typed.name).toBe('anthropic');
    expect(p.model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(p.budget).toBeInstanceOf(PaidApiBudget);
  });

  it('opts override env (test ergonomics — explicit > env)', () => {
    const p = new AnthropicLlmProvider({
      apiKey: 'sk-opts',
      providerFlag: 'anthropic',
      model: 'claude-opus-4-7',
    });
    expect(p.model).toBe('claude-opus-4-7');
  });
});

describe('AnthropicLlmProvider — generate() (stubbed fetch)', () => {
  function build(budget?: PaidApiBudget): AnthropicLlmProvider {
    const opts: ConstructorParameters<typeof AnthropicLlmProvider>[0] = {
      apiKey: 'sk-test',
      providerFlag: 'anthropic',
    };
    if (budget) opts.budget = budget;
    return new AnthropicLlmProvider(opts);
  }

  it('health() resolves true (configured = ready, no live probe)', async () => {
    await expect(build().health()).resolves.toBe(true);
  });

  it('POSTs the messages endpoint with correct headers + body shape', async () => {
    let seenUrl: string | undefined;
    let seenInit: RequestInit | undefined;
    stubFetch(async (input, init) => {
      seenUrl = input.toString();
      seenInit = init;
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'pong' }] }),
        { status: 200 },
      );
    });

    const out = await build().generate('ping');
    expect(out).toBe('pong');
    expect(seenUrl).toBe(ANTHROPIC_API_URL);
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_API_VERSION);
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(String(seenInit?.body));
    expect(body.model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.max_tokens).toBe(1024);
  });

  it('forwards temperature + maxTokens', async () => {
    let body: { temperature?: number; max_tokens?: number } = {};
    stubFetch(async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }] }), {
        status: 200,
      });
    });
    await build().generate('hi', { temperature: 0.3, maxTokens: 256 });
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(256);
  });

  it('forwards AbortSignal', async () => {
    let seenSignal: AbortSignal | null | undefined;
    stubFetch(async (_input, init) => {
      seenSignal = init?.signal;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }] }), {
        status: 200,
      });
    });
    const ctl = new AbortController();
    await build().generate('hi', { signal: ctl.signal });
    expect(seenSignal).toBe(ctl.signal);
  });

  it('throws on non-2xx without leaking the API key', async () => {
    stubFetch(async () => new Response('forbidden', { status: 401, statusText: 'Unauthorized' }));
    try {
      await build().generate('x');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/anthropic: HTTP 401/);
      expect((err as Error).message).not.toContain('sk-test');
    }
  });

  it('throws on malformed response', async () => {
    stubFetch(async () => new Response(JSON.stringify({ content: [{ type: 'image' }] }), { status: 200 }));
    await expect(build().generate('x')).rejects.toThrow(/malformed response/);
  });

  it('reserves budget before fetch — exhausted budget blocks fetch (AC-NF-8)', async () => {
    let fetchCalls = 0;
    stubFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }] }), { status: 200 });
    });
    // 1-call budget. The first generate consumes it; the second must throw
    // BEFORE fetch is reached.
    const budget = new PaidApiBudget({ maxCalls: 1, maxTokensPerCall: 1024, maxTokensPerRun: 99_999 });
    const p = build(budget);
    await p.generate('first');
    expect(fetchCalls).toBe(1);
    await expect(p.generate('second')).rejects.toThrow(/per-process call ceiling/);
    expect(fetchCalls).toBe(1); // still 1 — fetch was never called the 2nd time
  });

  it('per-call token ceiling rejects oversized maxTokens before fetch', async () => {
    let fetchCalls = 0;
    stubFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }] }), { status: 200 });
    });
    const budget = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 100, maxTokensPerRun: 99_999 });
    const p = build(budget);
    await expect(p.generate('hi', { maxTokens: 500 })).rejects.toThrow(/per-call token ceiling/);
    expect(fetchCalls).toBe(0);
  });
});

// ---------- OpenAiLlmProvider gate ----------

describe('OpenAiLlmProvider — AC-NF-1 gate', () => {
  it('throws ConfigError when neither env var is set', () => {
    expect(() => new OpenAiLlmProvider({}, {})).toThrow(ConfigError);
    try {
      new OpenAiLlmProvider({}, {});
    } catch (err) {
      expect((err as ConfigError).details).toMatchObject({ gate: 'AC-NF-1', missing: 'both' });
    }
  });

  it('throws ConfigError when only API key is set (provider flag missing)', () => {
    expect(() =>
      new OpenAiLlmProvider({}, { OPENAI_API_KEY: 'sk-openai-secret' }),
    ).toThrow(/provider/i);
    try {
      new OpenAiLlmProvider({}, { OPENAI_API_KEY: 'sk-openai-secret' });
    } catch (err) {
      expect((err as ConfigError).details).toMatchObject({ missing: 'provider_flag' });
      expect((err as Error).message).not.toContain('sk-openai-secret');
    }
  });

  it('throws ConfigError when only provider flag is set (API key missing)', () => {
    expect(() =>
      new OpenAiLlmProvider({}, { MCP_GUARD_LLM_PROVIDER: 'openai' }),
    ).toThrow(/API_KEY/);
  });

  it('throws when provider flag is set to a different provider value', () => {
    expect(
      () =>
        new OpenAiLlmProvider(
          {},
          { OPENAI_API_KEY: 'sk-y', MCP_GUARD_LLM_PROVIDER: 'anthropic' },
        ),
    ).toThrow(/provider/i);
  });

  it('constructs successfully when both env vars are set', () => {
    const p = new OpenAiLlmProvider(
      {},
      { OPENAI_API_KEY: 'sk-test', MCP_GUARD_LLM_PROVIDER: 'openai' },
    );
    const _typed: LlmProvider = p;
    expect(_typed.name).toBe('openai');
    expect(p.model).toBe(OPENAI_DEFAULT_MODEL);
  });
});

describe('OpenAiLlmProvider — generate() (stubbed fetch)', () => {
  function build(budget?: PaidApiBudget): OpenAiLlmProvider {
    const opts: ConstructorParameters<typeof OpenAiLlmProvider>[0] = {
      apiKey: 'sk-test',
      providerFlag: 'openai',
    };
    if (budget) opts.budget = budget;
    return new OpenAiLlmProvider(opts);
  }

  it('health() resolves true (configured = ready)', async () => {
    await expect(build().health()).resolves.toBe(true);
  });

  it('POSTs the chat completions endpoint with Bearer auth + chat body', async () => {
    let seenUrl: string | undefined;
    let seenInit: RequestInit | undefined;
    stubFetch(async (input, init) => {
      seenUrl = input.toString();
      seenInit = init;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'pong' } }] }),
        { status: 200 },
      );
    });

    const out = await build().generate('ping');
    expect(out).toBe('pong');
    expect(seenUrl).toBe(OPENAI_API_URL);
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(String(seenInit?.body));
    expect(body.model).toBe(OPENAI_DEFAULT_MODEL);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('omits temperature + max_tokens when not provided', async () => {
    let body: Record<string, unknown> = {};
    stubFetch(async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
        status: 200,
      });
    });
    await build().generate('hi');
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it('forwards temperature + maxTokens when provided', async () => {
    let body: { temperature?: number; max_tokens?: number } = {};
    stubFetch(async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
        status: 200,
      });
    });
    await build().generate('hi', { temperature: 0.1, maxTokens: 64 });
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(64);
  });

  it('throws on non-2xx without leaking the API key', async () => {
    stubFetch(async () => new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }));
    try {
      await build().generate('x');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/openai: HTTP 429/);
      expect((err as Error).message).not.toContain('sk-test');
    }
  });

  it('throws on malformed response', async () => {
    stubFetch(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(build().generate('x')).rejects.toThrow(/malformed response/);
  });

  it('reserves budget before fetch — exhausted budget blocks fetch (AC-NF-8)', async () => {
    let fetchCalls = 0;
    stubFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 });
    });
    const budget = new PaidApiBudget({ maxCalls: 1, maxTokensPerCall: 1024, maxTokensPerRun: 99_999 });
    const p = build(budget);
    await p.generate('first');
    expect(fetchCalls).toBe(1);
    await expect(p.generate('second')).rejects.toThrow(/per-process call ceiling/);
    expect(fetchCalls).toBe(1);
  });

  it('per-call token ceiling rejects oversized maxTokens before fetch', async () => {
    let fetchCalls = 0;
    stubFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 });
    });
    const budget = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 100, maxTokensPerRun: 99_999 });
    const p = build(budget);
    await expect(p.generate('hi', { maxTokens: 500 })).rejects.toThrow(/per-call token ceiling/);
    expect(fetchCalls).toBe(0);
  });
});
