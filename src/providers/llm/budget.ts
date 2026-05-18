// Paid-API budget guard. Process-scoped multi-ceiling pre-flight reserve;
// see ADR-0006 and AC-NF-8. Called from every paid LlmProvider before
// `fetch`. Once any ceiling fires the budget is poisoned and every
// subsequent reserve() throws regardless of counter state.

import { ConfigError } from '../../errors/index.js';

export interface PaidApiBudgetOptions {
  maxCalls?: number;
  maxTokensPerCall?: number;
  maxTokensPerRun?: number;
}

export interface PaidApiBudgetSnapshot {
  calls: number;
  tokensReserved: number;
  poisoned: boolean;
  maxCalls: number;
  maxTokensPerCall: number;
  maxTokensPerRun: number;
}

export const DEFAULT_MAX_CALLS_PER_RUN = 50;
export const DEFAULT_MAX_TOKENS_PER_CALL = 1024;
export const DEFAULT_MAX_TOKENS_PER_RUN = 50_000;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  envName: string,
): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== raw.trim()) {
    throw new ConfigError(
      `${envName} must be a positive integer, got ${JSON.stringify(raw)}`,
      { gate: 'AC-NF-8', envName },
    );
  }
  return n;
}

export class PaidApiBudget {
  readonly maxCalls: number;
  readonly maxTokensPerCall: number;
  readonly maxTokensPerRun: number;

  #calls = 0;
  #tokensReserved = 0;
  #poisoned: { reason: string } | null = null;

  constructor(
    opts: PaidApiBudgetOptions = {},
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.maxCalls =
      opts.maxCalls ??
      parsePositiveInt(
        env.MCP_GUARD_LLM_MAX_CALLS_PER_RUN,
        DEFAULT_MAX_CALLS_PER_RUN,
        'MCP_GUARD_LLM_MAX_CALLS_PER_RUN',
      );
    this.maxTokensPerCall =
      opts.maxTokensPerCall ??
      parsePositiveInt(
        env.MCP_GUARD_LLM_MAX_TOKENS_PER_CALL,
        DEFAULT_MAX_TOKENS_PER_CALL,
        'MCP_GUARD_LLM_MAX_TOKENS_PER_CALL',
      );
    this.maxTokensPerRun =
      opts.maxTokensPerRun ??
      parsePositiveInt(
        env.MCP_GUARD_LLM_MAX_TOKENS_PER_RUN,
        DEFAULT_MAX_TOKENS_PER_RUN,
        'MCP_GUARD_LLM_MAX_TOKENS_PER_RUN',
      );

    if (!Number.isInteger(opts.maxCalls) && opts.maxCalls !== undefined) {
      throw new ConfigError('maxCalls must be a positive integer', {
        gate: 'AC-NF-8',
        opt: 'maxCalls',
      });
    }
  }

  reserve(tokensRequested: number): void {
    if (this.#poisoned) {
      throw new ConfigError(
        `budget poisoned: ${this.#poisoned.reason} (no further paid calls)`,
        { gate: 'AC-NF-8', ceiling: 'poisoned' },
      );
    }
    if (!Number.isInteger(tokensRequested) || tokensRequested <= 0) {
      throw new ConfigError('tokensRequested must be a positive integer', {
        gate: 'AC-NF-8',
        ceiling: 'invalid_input',
        requested: tokensRequested,
      });
    }

    if (tokensRequested > this.maxTokensPerCall) {
      const reason = `per-call token ceiling exceeded (${tokensRequested} > ${this.maxTokensPerCall})`;
      this.#poisoned = { reason };
      throw new ConfigError(reason, {
        gate: 'AC-NF-8',
        ceiling: 'per_call_tokens',
        requested: tokensRequested,
        observed: this.maxTokensPerCall,
      });
    }

    const nextCalls = this.#calls + 1;
    if (nextCalls > this.maxCalls) {
      const reason = `per-process call ceiling exceeded (${nextCalls} > ${this.maxCalls})`;
      this.#poisoned = { reason };
      throw new ConfigError(reason, {
        gate: 'AC-NF-8',
        ceiling: 'per_run_calls',
        requested: nextCalls,
        observed: this.maxCalls,
      });
    }

    const nextTokens = this.#tokensReserved + tokensRequested;
    if (nextTokens > this.maxTokensPerRun) {
      const reason = `per-process token ceiling exceeded (${nextTokens} > ${this.maxTokensPerRun})`;
      this.#poisoned = { reason };
      throw new ConfigError(reason, {
        gate: 'AC-NF-8',
        ceiling: 'per_run_tokens',
        requested: nextTokens,
        observed: this.maxTokensPerRun,
      });
    }

    this.#calls = nextCalls;
    this.#tokensReserved = nextTokens;
  }

  snapshot(): PaidApiBudgetSnapshot {
    return {
      calls: this.#calls,
      tokensReserved: this.#tokensReserved,
      poisoned: this.#poisoned !== null,
      maxCalls: this.maxCalls,
      maxTokensPerCall: this.maxTokensPerCall,
      maxTokensPerRun: this.maxTokensPerRun,
    };
  }
}
