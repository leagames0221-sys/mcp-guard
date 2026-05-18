import { describe, it, expect } from 'vitest';

import {
  PaidApiBudget,
  DEFAULT_MAX_CALLS_PER_RUN,
  DEFAULT_MAX_TOKENS_PER_CALL,
  DEFAULT_MAX_TOKENS_PER_RUN,
} from '../../src/providers/llm/index.js';
import { ConfigError } from '../../src/errors/index.js';

// T-13b / AC-NF-8: PaidApiBudget pre-flight reserve. Three ceilings,
// any-fire poisons the budget. No I/O — purely arithmetic.

describe('PaidApiBudget — defaults and env', () => {
  it('uses doc-canonical defaults when env is empty', () => {
    const b = new PaidApiBudget({}, {});
    expect(b.maxCalls).toBe(DEFAULT_MAX_CALLS_PER_RUN);
    expect(b.maxCalls).toBe(50);
    expect(b.maxTokensPerCall).toBe(DEFAULT_MAX_TOKENS_PER_CALL);
    expect(b.maxTokensPerCall).toBe(1024);
    expect(b.maxTokensPerRun).toBe(DEFAULT_MAX_TOKENS_PER_RUN);
    expect(b.maxTokensPerRun).toBe(50_000);
  });

  it('honours env overrides for all three ceilings', () => {
    const b = new PaidApiBudget(
      {},
      {
        MCP_GUARD_LLM_MAX_CALLS_PER_RUN: '10',
        MCP_GUARD_LLM_MAX_TOKENS_PER_CALL: '256',
        MCP_GUARD_LLM_MAX_TOKENS_PER_RUN: '5000',
      },
    );
    expect(b.maxCalls).toBe(10);
    expect(b.maxTokensPerCall).toBe(256);
    expect(b.maxTokensPerRun).toBe(5000);
  });

  it('rejects negative / zero / non-integer env values with ConfigError', () => {
    expect(() => new PaidApiBudget({}, { MCP_GUARD_LLM_MAX_CALLS_PER_RUN: '0' })).toThrow(ConfigError);
    expect(() => new PaidApiBudget({}, { MCP_GUARD_LLM_MAX_CALLS_PER_RUN: '-1' })).toThrow(ConfigError);
    expect(() => new PaidApiBudget({}, { MCP_GUARD_LLM_MAX_TOKENS_PER_CALL: 'abc' })).toThrow(ConfigError);
    expect(() => new PaidApiBudget({}, { MCP_GUARD_LLM_MAX_TOKENS_PER_RUN: '1.5' })).toThrow(ConfigError);
  });

  it('opts override env (test ergonomics)', () => {
    const b = new PaidApiBudget(
      { maxCalls: 3, maxTokensPerCall: 128, maxTokensPerRun: 1000 },
      { MCP_GUARD_LLM_MAX_CALLS_PER_RUN: '999' },
    );
    expect(b.maxCalls).toBe(3);
    expect(b.maxTokensPerCall).toBe(128);
    expect(b.maxTokensPerRun).toBe(1000);
  });
});

describe('PaidApiBudget — reserve happy path', () => {
  it('accepts calls within all ceilings and tracks state', () => {
    const b = new PaidApiBudget({ maxCalls: 5, maxTokensPerCall: 100, maxTokensPerRun: 400 });
    b.reserve(100);
    b.reserve(100);
    b.reserve(100);
    expect(b.snapshot()).toMatchObject({
      calls: 3,
      tokensReserved: 300,
      poisoned: false,
    });
  });

  it('rejects non-positive-integer token requests', () => {
    const b = new PaidApiBudget({});
    expect(() => b.reserve(0)).toThrow(ConfigError);
    expect(() => b.reserve(-1)).toThrow(ConfigError);
    expect(() => b.reserve(1.5)).toThrow(ConfigError);
    expect(() => b.reserve(Number.NaN)).toThrow(ConfigError);
  });
});

describe('PaidApiBudget — per-call ceiling', () => {
  it('throws when a single call exceeds maxTokensPerCall and poisons the budget', () => {
    const b = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 100, maxTokensPerRun: 99_999 });
    expect(() => b.reserve(101)).toThrow(/per-call token ceiling/);
    expect(b.snapshot().poisoned).toBe(true);
    // even a tiny subsequent call cannot recover
    expect(() => b.reserve(1)).toThrow(/poisoned/);
  });
});

describe('PaidApiBudget — per-run call ceiling', () => {
  it('throws on the (maxCalls + 1)th call and poisons', () => {
    const b = new PaidApiBudget({ maxCalls: 3, maxTokensPerCall: 1000, maxTokensPerRun: 99_999 });
    b.reserve(10);
    b.reserve(10);
    b.reserve(10);
    expect(() => b.reserve(10)).toThrow(/per-process call ceiling/);
    expect(b.snapshot().poisoned).toBe(true);
  });
});

describe('PaidApiBudget — per-run token ceiling', () => {
  it('throws when cumulative tokens would exceed maxTokensPerRun and poisons', () => {
    const b = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 1000, maxTokensPerRun: 250 });
    b.reserve(100);
    b.reserve(100);
    expect(() => b.reserve(100)).toThrow(/per-process token ceiling/);
    expect(b.snapshot().poisoned).toBe(true);
  });

  it('the cumulative ceiling pays attention to *exact* threshold (=== passes, > fails)', () => {
    const b = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 1000, maxTokensPerRun: 200 });
    b.reserve(100);
    b.reserve(100); // exactly at ceiling
    expect(b.snapshot().tokensReserved).toBe(200);
    expect(() => b.reserve(1)).toThrow(/per-process token ceiling/);
  });
});

describe('PaidApiBudget — ConfigError shape', () => {
  it('carries gate=AC-NF-8 + ceiling tag in details', () => {
    const b = new PaidApiBudget({ maxCalls: 99, maxTokensPerCall: 100, maxTokensPerRun: 99_999 });
    try {
      b.reserve(200);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).details).toMatchObject({
        gate: 'AC-NF-8',
        ceiling: 'per_call_tokens',
        requested: 200,
        observed: 100,
      });
    }
  });
});
