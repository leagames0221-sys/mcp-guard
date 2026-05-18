// Config schema for mcp-guard. Source of truth: this file. Defaults
// flow through here so every consumer sees the same baseline regardless
// of input layer (CLI flag, env var, config file).

import { z } from 'zod';

export const llmConfigSchema = z.object({
  provider: z.enum(['mock', 'ollama', 'anthropic', 'openai']),
  ollamaHost: z.string().url().default('http://localhost:11434'),
  ollamaModel: z.string().min(1).default('gemma3:4b'),
});

export const configSchema = z.object({
  llm: llmConfigSchema.default({ provider: 'mock' }),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  outputFormat: z.enum(['json', 'sarif', 'console']).default('json'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export type Config = z.infer<typeof configSchema>;
export type PartialConfigInput = z.input<typeof configSchema>;
