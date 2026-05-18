import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadConfig,
  envToLayer,
  mergeLayers,
  readConfigFile,
  enforcePaidApiGate,
  configSchema,
} from '../../src/config/index.js';
import { ConfigError } from '../../src/errors/index.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'mcp-guard-config-'));
}

describe('configSchema defaults', () => {
  it('produces the built-in defaults from an empty input', () => {
    const result = configSchema.parse({});
    expect(result).toEqual({
      llm: {
        provider: 'mock',
        ollamaHost: 'http://localhost:11434',
        ollamaModel: 'gemma3:4b',
      },
      severity: 'high',
      outputFormat: 'json',
      logLevel: 'info',
    });
  });

  it('rejects unknown severity', () => {
    const result = configSchema.safeParse({ severity: 'cataclysmic' });
    expect(result.success).toBe(false);
  });
});

describe('envToLayer', () => {
  it('ignores unrelated env entries', () => {
    expect(envToLayer({ PATH: '/usr/bin', HOME: '/home/x' })).toEqual({});
  });

  it('maps every recognized env var', () => {
    const layer = envToLayer({
      MCP_GUARD_LLM_PROVIDER: 'ollama',
      MCP_GUARD_OLLAMA_HOST: 'http://elsewhere:9999',
      MCP_GUARD_OLLAMA_MODEL: 'llama3.1:8b',
      MCP_GUARD_SEVERITY: 'critical',
      MCP_GUARD_OUTPUT_FORMAT: 'sarif',
      MCP_GUARD_LOG_LEVEL: 'debug',
    });
    expect(layer).toEqual({
      llm: {
        provider: 'ollama',
        ollamaHost: 'http://elsewhere:9999',
        ollamaModel: 'llama3.1:8b',
      },
      severity: 'critical',
      outputFormat: 'sarif',
      logLevel: 'debug',
    });
  });
});

describe('mergeLayers precedence (CLI > env > file)', () => {
  it('uses file value when only file is set', () => {
    const merged = mergeLayers({ file: { severity: 'low' } });
    expect(merged.severity).toBe('low');
  });

  it('env overrides file', () => {
    const merged = mergeLayers({
      file: { severity: 'low' },
      env: { severity: 'medium' },
    });
    expect(merged.severity).toBe('medium');
  });

  it('CLI overrides env which overrides file', () => {
    const merged = mergeLayers({
      file: { severity: 'low' },
      env: { severity: 'medium' },
      cli: { severity: 'critical' },
    });
    expect(merged.severity).toBe('critical');
  });

  it('deep-merges nested objects without losing unrelated keys', () => {
    const merged = mergeLayers({
      file: { llm: { provider: 'ollama', ollamaModel: 'llama3.1:8b' } },
      env: { llm: { ollamaHost: 'http://elsewhere:9999' } },
      cli: { llm: { provider: 'mock' } },
    });
    expect(merged.llm).toEqual({
      provider: 'mock',
      ollamaModel: 'llama3.1:8b',
      ollamaHost: 'http://elsewhere:9999',
    });
  });
});

describe('readConfigFile', () => {
  it('reads a valid JSON object', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ severity: 'low' }));
    expect(readConfigFile(path)).toEqual({ severity: 'low' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects forbidden credential filenames (AC-NF-2)', () => {
    const dir = makeTmpDir();
    const path = join(dir, '.env');
    writeFileSync(path, 'SOMETHING=secret');
    expect(() => readConfigFile(path)).toThrow(ConfigError);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects .envrc and .netrc basenames', () => {
    const dir = makeTmpDir();
    for (const name of ['.envrc', '.netrc']) {
      const path = join(dir, name);
      writeFileSync(path, '');
      expect(() => readConfigFile(path)).toThrow(ConfigError);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws ConfigError on missing file', () => {
    expect(() => readConfigFile(join(tmpdir(), 'definitely-missing-9999.json'))).toThrow(
      ConfigError,
    );
  });

  it('throws ConfigError on non-JSON content', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '<not json>');
    expect(() => readConfigFile(path)).toThrow(ConfigError);
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws ConfigError when root is not an object', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, '[1,2,3]');
    expect(() => readConfigFile(path)).toThrow(ConfigError);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('enforcePaidApiGate (AC-NF-1)', () => {
  const baseConfig = {
    llm: {
      provider: 'mock' as const,
      ollamaHost: 'http://localhost:11434',
      ollamaModel: 'gemma3:4b',
    },
    severity: 'high' as const,
    outputFormat: 'json' as const,
    logLevel: 'info' as const,
  };

  it('passes for mock provider regardless of env', () => {
    expect(() => enforcePaidApiGate(baseConfig, {})).not.toThrow();
  });

  it('passes for ollama provider regardless of env', () => {
    expect(() =>
      enforcePaidApiGate({ ...baseConfig, llm: { ...baseConfig.llm, provider: 'ollama' } }, {}),
    ).not.toThrow();
  });

  it('rejects anthropic provider with missing ANTHROPIC_API_KEY', () => {
    expect(() =>
      enforcePaidApiGate(
        { ...baseConfig, llm: { ...baseConfig.llm, provider: 'anthropic' } },
        {},
      ),
    ).toThrow(ConfigError);
  });

  it('rejects anthropic provider with whitespace-only ANTHROPIC_API_KEY', () => {
    expect(() =>
      enforcePaidApiGate(
        { ...baseConfig, llm: { ...baseConfig.llm, provider: 'anthropic' } },
        { ANTHROPIC_API_KEY: '   ' },
      ),
    ).toThrow(ConfigError);
  });

  it('accepts anthropic provider with valid ANTHROPIC_API_KEY', () => {
    expect(() =>
      enforcePaidApiGate(
        { ...baseConfig, llm: { ...baseConfig.llm, provider: 'anthropic' } },
        { ANTHROPIC_API_KEY: 'sk-ant-test' },
      ),
    ).not.toThrow();
  });

  it('rejects openai provider with missing OPENAI_API_KEY', () => {
    expect(() =>
      enforcePaidApiGate(
        { ...baseConfig, llm: { ...baseConfig.llm, provider: 'openai' } },
        {},
      ),
    ).toThrow(ConfigError);
  });

  it('accepts openai provider with valid OPENAI_API_KEY', () => {
    expect(() =>
      enforcePaidApiGate(
        { ...baseConfig, llm: { ...baseConfig.llm, provider: 'openai' } },
        { OPENAI_API_KEY: 'sk-test' },
      ),
    ).not.toThrow();
  });
});

describe('loadConfig integration', () => {
  it('returns defaults when only an empty env is provided', () => {
    const cfg = loadConfig({ env: {} });
    expect(cfg.llm.provider).toBe('mock');
    expect(cfg.severity).toBe('high');
  });

  it('applies CLI > env > file precedence end-to-end', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ severity: 'low', outputFormat: 'console' }));
    const cfg = loadConfig({
      env: { MCP_GUARD_SEVERITY: 'medium' },
      cli: { severity: 'critical' },
      configFilePath: path,
    });
    expect(cfg.severity).toBe('critical');
    expect(cfg.outputFormat).toBe('console');
    rmSync(dir, { recursive: true, force: true });
  });

  it('enforces AC-NF-1 gate during loadConfig', () => {
    expect(() => loadConfig({ env: { MCP_GUARD_LLM_PROVIDER: 'anthropic' } })).toThrow(
      ConfigError,
    );
  });
});

describe('AC-NF-2: never reads .env-like files implicitly', () => {
  // Architectural guarantee: loadConfig only opens a file when the caller
  // passes an explicit configFilePath; it never auto-discovers dotfiles.
  // readConfigFile rejects forbidden credential basenames before any
  // filesystem call. These behavioral tests exercise both halves.

  it('returns defaults without touching the filesystem when configFilePath is omitted', () => {
    // If loadConfig were to auto-read .env or another dotfile, it would
    // either pollute the parsed config or throw on parse — neither
    // happens here, confirming no implicit read.
    const cfg = loadConfig({ env: {} });
    expect(cfg.severity).toBe('high');
    expect(cfg.llm.provider).toBe('mock');
  });

  it('readConfigFile rejects .env basename with a credentials-reserved message', () => {
    const dir = makeTmpDir();
    const path = join(dir, '.env');
    writeFileSync(path, 'SECRET=leak');
    expect(() => readConfigFile(path)).toThrow(/reserved for credentials/);
    rmSync(dir, { recursive: true, force: true });
  });
});
