import { describe, it, expectTypeOf } from 'vitest';

import type {
  LlmProvider,
  LlmGenerateOptions,
} from '../../src/providers/llm/index.js';
import type { LlmProviderName } from '../../src/types/index.js';

// T-10 (D-004): LlmProvider is a minimal structural contract — name +
// generate + health. No abstract class, no adapter. The tests below are
// compile-time gates: they fail tsc / vitest typecheck if the interface
// drifts from the spec.md AC.

describe('LlmProvider interface (T-10, D-004)', () => {
  it('exposes the 3-member contract', () => {
    expectTypeOf<LlmProvider>().toHaveProperty('name');
    expectTypeOf<LlmProvider>().toHaveProperty('generate');
    expectTypeOf<LlmProvider>().toHaveProperty('health');
  });

  it('typed name field equals LlmProviderName union', () => {
    expectTypeOf<LlmProvider['name']>().toEqualTypeOf<LlmProviderName>();
  });

  it('generate returns Promise<string>', () => {
    expectTypeOf<LlmProvider['generate']>().returns.toEqualTypeOf<
      Promise<string>
    >();
  });

  it('generate accepts (prompt, opts?) with opts optional', () => {
    expectTypeOf<LlmProvider['generate']>().parameters.toEqualTypeOf<
      [prompt: string, opts?: LlmGenerateOptions | undefined]
    >();
  });

  it('health returns Promise<boolean>', () => {
    expectTypeOf<LlmProvider['health']>().returns.toEqualTypeOf<
      Promise<boolean>
    >();
  });

  it('health takes zero arguments', () => {
    expectTypeOf<LlmProvider['health']>().parameters.toEqualTypeOf<[]>();
  });

  it('a structural implementation type-checks (4 names accepted)', () => {
    const sample: LlmProvider = {
      name: 'mock',
      async generate(prompt: string, _opts?: LlmGenerateOptions) {
        return prompt;
      },
      async health() {
        return true;
      },
    };
    expectTypeOf(sample).toMatchTypeOf<LlmProvider>();
    expectTypeOf<LlmProviderName>().toEqualTypeOf<
      'mock' | 'ollama' | 'anthropic' | 'openai'
    >();
  });
});

describe('LlmGenerateOptions shape', () => {
  it('all 3 fields are optional', () => {
    const empty: LlmGenerateOptions = {};
    expectTypeOf(empty).toMatchTypeOf<LlmGenerateOptions>();
  });

  it('temperature is number when present', () => {
    expectTypeOf<LlmGenerateOptions['temperature']>().toEqualTypeOf<
      number | undefined
    >();
  });

  it('maxTokens is number when present', () => {
    expectTypeOf<LlmGenerateOptions['maxTokens']>().toEqualTypeOf<
      number | undefined
    >();
  });

  it('signal is AbortSignal when present', () => {
    expectTypeOf<LlmGenerateOptions['signal']>().toEqualTypeOf<
      AbortSignal | undefined
    >();
  });
});
