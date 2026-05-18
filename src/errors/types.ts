// Exit code constants aligned with POSIX sysexits.h (per ADR-0003 §6 +
// AC-005-6). docs/EXIT_CODES.md is the human-readable mirror of this table.

export const ExitCode = {
  Success: 0,
  FindingsExceedThreshold: 1,
  InvalidInput: 2,
  UsageError: 64,
  DataFormatError: 65,
  InternalError: 70,
  IoError: 74,
  ConfigError: 78,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface StructuredErrorPayload {
  code: ExitCodeValue;
  name: string;
  message: string;
  details?: Record<string, unknown>;
}
