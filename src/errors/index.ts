// Typed error hierarchy for mcp-guard. Each subclass carries the exit code
// the CLI will return when the error bubbles to the entry point. See
// docs/EXIT_CODES.md for the human-readable mapping.

import { ExitCode } from './types.js';
import type { ExitCodeValue, StructuredErrorPayload } from './types.js';

export { ExitCode } from './types.js';
export type { ExitCodeValue, StructuredErrorPayload } from './types.js';

export abstract class McpGuardError extends Error {
  abstract readonly exitCode: ExitCodeValue;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }

  toPayload(): StructuredErrorPayload {
    const payload: StructuredErrorPayload = {
      code: this.exitCode,
      name: this.name,
      message: this.message,
    };
    if (this.details !== undefined) {
      payload.details = this.details;
    }
    return payload;
  }
}

export class FindingsExceedThresholdError extends McpGuardError {
  readonly exitCode = ExitCode.FindingsExceedThreshold;
}

export class InvalidInputError extends McpGuardError {
  readonly exitCode = ExitCode.InvalidInput;
}

export class UsageError extends McpGuardError {
  readonly exitCode = ExitCode.UsageError;
}

export class DataFormatError extends McpGuardError {
  readonly exitCode = ExitCode.DataFormatError;
}

export class InternalError extends McpGuardError {
  readonly exitCode = ExitCode.InternalError;
}

export class IoError extends McpGuardError {
  readonly exitCode = ExitCode.IoError;
}

export class ConfigError extends McpGuardError {
  readonly exitCode = ExitCode.ConfigError;
}

// Resolve any thrown value to an exit code. Unknown values (non-Error
// throwables, library exceptions) map to InternalError so the CLI never
// exits 0 on a thrown surprise.
export function resolveExitCode(err: unknown): ExitCodeValue {
  if (err instanceof McpGuardError) {
    return err.exitCode;
  }
  return ExitCode.InternalError;
}
