// Minimal level-filtered logger (~50 LOC per D-011). All emission goes to
// stderr so structured machine-readable output on stdout stays clean.
// User-supplied content is sanitized for ANSI + control chars per AC-NF-4.

import { sanitize } from './sanitize.js';

export { sanitize, stripAnsi, stripControlChars } from './sanitize.js';

export const LogLevel = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
} as const;

export type LogLevelName = keyof typeof LogLevel;

export interface LoggerOptions {
  level: LogLevelName;
  stream?: NodeJS.WritableStream;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  progress(current: number, total: number, name: string): void;
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LogLevel[options.level];
  const stream = options.stream ?? process.stderr;

  function emit(level: LogLevelName, message: string): void {
    if (LogLevel[level] < threshold) return;
    stream.write(`[${level}] ${sanitize(message)}\n`);
  }

  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
    // Progress format mandated by AC-002-3: `[N/M] <probe-name>`, stderr,
    // sanitized to prevent terminal injection by hostile probe names.
    progress: (current, total, name) => {
      if (LogLevel.info < threshold) return;
      stream.write(`[${current}/${total}] ${sanitize(name)}\n`);
    },
  };
}
