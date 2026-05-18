// Shared types used across config, providers, scanners, and harness.

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type OutputFormat = 'json' | 'sarif' | 'console';

export type LlmProviderName = 'mock' | 'ollama' | 'anthropic' | 'openai';

export type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'silent';
