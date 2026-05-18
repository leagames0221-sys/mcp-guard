// Config loader for mcp-guard.
//
// Per AC-NF-2 the loader NEVER reads .env or other credential files. It
// only consults: (a) explicitly-passed CLI flags, (b) the process env
// dictionary the caller passes in, (c) a config file at an explicit
// path. Auto-discovery of dotfiles is disallowed by design.
//
// Per AC-NF-1 paid LLM providers (anthropic / openai) are gated by
// requiring both the matching env var AND an explicit provider
// selection. The gate is enforced after merging + parsing, so a
// missing env var rejects with a typed ConfigError.

import { readFileSync, existsSync } from 'node:fs';

import { ConfigError } from '../errors/index.js';
import { configSchema, type Config, type PartialConfigInput } from './schema.js';
import { mergeLayers, type ConfigLayer, type ConfigLayers } from './precedence.js';

export { configSchema, llmConfigSchema } from './schema.js';
export type { Config, PartialConfigInput } from './schema.js';
export { mergeLayers } from './precedence.js';
export type { ConfigLayer, ConfigLayers } from './precedence.js';

const FORBIDDEN_FILE_BASENAMES = new Set(['.env', '.envrc', '.netrc']);

export interface LoadConfigInput {
  cli?: ConfigLayer;
  env: NodeJS.ProcessEnv;
  configFilePath?: string;
}

// Translate the subset of process.env that mcp-guard understands into a
// ConfigLayer. Unrelated env entries are ignored.
export function envToLayer(env: NodeJS.ProcessEnv): ConfigLayer {
  const layer: ConfigLayer = {};
  type LlmProvider = NonNullable<NonNullable<PartialConfigInput['llm']>['provider']>;
  const provider = env['MCP_GUARD_LLM_PROVIDER'];
  if (provider) {
    layer.llm = { provider: provider as LlmProvider };
  }
  const ollamaHost = env['MCP_GUARD_OLLAMA_HOST'];
  if (ollamaHost) {
    layer.llm = { ...(layer.llm ?? {}), ollamaHost };
  }
  const ollamaModel = env['MCP_GUARD_OLLAMA_MODEL'];
  if (ollamaModel) {
    layer.llm = { ...(layer.llm ?? {}), ollamaModel };
  }
  const severity = env['MCP_GUARD_SEVERITY'];
  if (severity) {
    layer.severity = severity as PartialConfigInput['severity'];
  }
  const outputFormat = env['MCP_GUARD_OUTPUT_FORMAT'];
  if (outputFormat) {
    layer.outputFormat = outputFormat as PartialConfigInput['outputFormat'];
  }
  const logLevel = env['MCP_GUARD_LOG_LEVEL'];
  if (logLevel) {
    layer.logLevel = logLevel as PartialConfigInput['logLevel'];
  }
  return layer;
}

// Read + parse an explicit config file path. The path must be passed
// in; auto-discovery is intentionally not supported.
export function readConfigFile(path: string): ConfigLayer {
  const basename = path.split(/[/\\]/).pop() ?? '';
  if (FORBIDDEN_FILE_BASENAMES.has(basename)) {
    throw new ConfigError(`config file basename '${basename}' is reserved for credentials`, {
      path,
    });
  }
  if (!existsSync(path)) {
    throw new ConfigError(`config file not found: ${path}`, { path });
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new ConfigError(`failed to read config file: ${(err as Error).message}`, { path });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`config file is not valid JSON: ${(err as Error).message}`, {
      path,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError('config file must contain a JSON object at the root', { path });
  }
  return parsed as ConfigLayer;
}

// Enforce AC-NF-1: paid LLM providers require both an explicit
// provider selection AND a non-empty matching env var.
export function enforcePaidApiGate(config: Config, env: NodeJS.ProcessEnv): void {
  const provider = config.llm.provider;
  if (provider === 'anthropic') {
    if (!env['ANTHROPIC_API_KEY']?.trim()) {
      throw new ConfigError(
        'provider=anthropic requires ANTHROPIC_API_KEY environment variable',
        { provider },
      );
    }
  } else if (provider === 'openai') {
    if (!env['OPENAI_API_KEY']?.trim()) {
      throw new ConfigError('provider=openai requires OPENAI_API_KEY environment variable', {
        provider,
      });
    }
  }
}

export function loadConfig(input: LoadConfigInput): Config {
  const layers: ConfigLayers = { env: envToLayer(input.env) };
  if (input.cli) layers.cli = input.cli;
  if (input.configFilePath) layers.file = readConfigFile(input.configFilePath);

  const merged = mergeLayers(layers);
  const parsed = configSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError(`invalid configuration: ${parsed.error.message}`, {
      issues: parsed.error.issues,
    });
  }
  enforcePaidApiGate(parsed.data, input.env);
  return parsed.data;
}
