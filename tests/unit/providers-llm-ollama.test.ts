import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  OllamaLlmProvider,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  type LlmProvider,
} from '../../src/providers/llm/index.js';

// T-12 (AC-NF-5 localhost containment + AC-002-2 health-driven fallback):
// the Ollama provider must be honest about reachability (health() false on
// any failure, no throw) and must POST /api/generate with model gemma3:4b
// to the configured host (localhost:11434 by default). Fallback to mock is
// the harness's responsibility, not this provider's.

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

function stubFetch(impl: FetchStub) {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OllamaLlmProvider — surface', () => {
  it('satisfies LlmProvider structurally', () => {
    const p = new OllamaLlmProvider();
    const _typed: LlmProvider = p;
    expect(_typed.name).toBe('ollama');
  });

  it('defaults host to http://localhost:11434 and model to gemma3:4b', () => {
    const p = new OllamaLlmProvider();
    expect(p.host).toBe(DEFAULT_OLLAMA_HOST);
    expect(p.host).toBe('http://localhost:11434');
    expect(p.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(p.model).toBe('gemma3:4b');
  });

  it('accepts host + model overrides', () => {
    const p = new OllamaLlmProvider({ host: 'http://127.0.0.1:9999', model: 'llama3.2:1b' });
    expect(p.host).toBe('http://127.0.0.1:9999');
    expect(p.model).toBe('llama3.2:1b');
  });
});

describe('OllamaLlmProvider — health()', () => {
  it('returns true when /api/tags returns 200', async () => {
    let seenUrl: string | undefined;
    let seenMethod: string | undefined;
    stubFetch(async (input, init) => {
      seenUrl = input.toString();
      seenMethod = init?.method ?? 'GET';
      return new Response('{"models":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const p = new OllamaLlmProvider();
    await expect(p.health()).resolves.toBe(true);
    expect(seenUrl).toBe('http://localhost:11434/api/tags');
    expect(seenMethod).toBe('GET');
  });

  it('returns false on non-2xx response without throwing', async () => {
    stubFetch(async () => new Response('boom', { status: 500 }));
    const p = new OllamaLlmProvider();
    await expect(p.health()).resolves.toBe(false);
  });

  it('returns false on connection refused (fetch throws) without re-throwing', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    });
    const p = new OllamaLlmProvider();
    await expect(p.health()).resolves.toBe(false);
  });

  it('hits the configured host, not the default, when overridden', async () => {
    let seenUrl: string | undefined;
    stubFetch(async (input) => {
      seenUrl = input.toString();
      return new Response('{}', { status: 200 });
    });
    const p = new OllamaLlmProvider({ host: 'http://127.0.0.1:9999' });
    await p.health();
    expect(seenUrl).toBe('http://127.0.0.1:9999/api/tags');
  });
});

describe('OllamaLlmProvider — generate()', () => {
  it('POSTs /api/generate with model = gemma3:4b and stream=false', async () => {
    let seenUrl: string | undefined;
    let seenInit: RequestInit | undefined;
    stubFetch(async (input, init) => {
      seenUrl = input.toString();
      seenInit = init;
      return new Response(JSON.stringify({ response: 'hello world' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const p = new OllamaLlmProvider();
    const out = await p.generate('ping');
    expect(out).toBe('hello world');

    expect(seenUrl).toBe('http://localhost:11434/api/generate');
    expect(seenInit?.method).toBe('POST');
    const body = JSON.parse(String(seenInit?.body));
    expect(body.model).toBe('gemma3:4b');
    expect(body.prompt).toBe('ping');
    expect(body.stream).toBe(false);
    expect(body.options).toBeUndefined();
  });

  it('forwards temperature + maxTokens through Ollama options.num_predict', async () => {
    let seenBody: { options?: { temperature?: number; num_predict?: number } } = {};
    stubFetch(async (_input, init) => {
      seenBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ response: 'ok' }), { status: 200 });
    });

    const p = new OllamaLlmProvider();
    await p.generate('hi', { temperature: 0.2, maxTokens: 128 });
    expect(seenBody.options?.temperature).toBe(0.2);
    expect(seenBody.options?.num_predict).toBe(128);
  });

  it('forwards an AbortSignal through to the fetch init', async () => {
    let seenSignal: AbortSignal | null | undefined;
    stubFetch(async (_input, init) => {
      seenSignal = init?.signal;
      return new Response(JSON.stringify({ response: 'x' }), { status: 200 });
    });

    const ctl = new AbortController();
    const p = new OllamaLlmProvider();
    await p.generate('hi', { signal: ctl.signal });
    expect(seenSignal).toBe(ctl.signal);
  });

  it('throws on non-2xx response with HTTP context', async () => {
    stubFetch(async () => new Response('upstream blew up', { status: 503, statusText: 'Service Unavailable' }));
    const p = new OllamaLlmProvider();
    await expect(p.generate('x')).rejects.toThrow(/ollama: HTTP 503/);
  });

  it('throws on malformed JSON (missing string `response`)', async () => {
    stubFetch(async () => new Response(JSON.stringify({ done: true }), { status: 200 }));
    const p = new OllamaLlmProvider();
    await expect(p.generate('x')).rejects.toThrow(/malformed response/);
  });
});
