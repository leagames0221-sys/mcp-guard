import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ExitCode,
  McpGuardError,
  FindingsExceedThresholdError,
  InvalidInputError,
  UsageError,
  DataFormatError,
  InternalError,
  IoError,
  ConfigError,
  resolveExitCode,
} from '../../src/errors/index.js';

describe('ExitCode constants', () => {
  it('matches sysexits-aligned table (ADR-0003 §6)', () => {
    expect(ExitCode.Success).toBe(0);
    expect(ExitCode.FindingsExceedThreshold).toBe(1);
    expect(ExitCode.InvalidInput).toBe(2);
    expect(ExitCode.UsageError).toBe(64);
    expect(ExitCode.DataFormatError).toBe(65);
    expect(ExitCode.InternalError).toBe(70);
    expect(ExitCode.IoError).toBe(74);
    expect(ExitCode.ConfigError).toBe(78);
  });

  it('has no duplicate values', () => {
    const values = Object.values(ExitCode);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('McpGuardError subclasses', () => {
  const cases: ReadonlyArray<{
    name: string;
    ctor: new (msg: string, d?: Record<string, unknown>) => McpGuardError;
    code: number;
  }> = [
    { name: 'FindingsExceedThresholdError', ctor: FindingsExceedThresholdError, code: 1 },
    { name: 'InvalidInputError', ctor: InvalidInputError, code: 2 },
    { name: 'UsageError', ctor: UsageError, code: 64 },
    { name: 'DataFormatError', ctor: DataFormatError, code: 65 },
    { name: 'InternalError', ctor: InternalError, code: 70 },
    { name: 'IoError', ctor: IoError, code: 74 },
    { name: 'ConfigError', ctor: ConfigError, code: 78 },
  ];

  for (const { name, ctor, code } of cases) {
    it(`${name} exits with code ${code} and preserves message + name`, () => {
      const err = new ctor('boom');
      expect(err).toBeInstanceOf(McpGuardError);
      expect(err.exitCode).toBe(code);
      expect(err.name).toBe(name);
      expect(err.message).toBe('boom');
    });
  }

  it('preserves optional details', () => {
    const err = new UsageError('bad flag', { flag: '--whatev' });
    expect(err.details).toEqual({ flag: '--whatev' });
  });

  it('toPayload includes details only when present', () => {
    const withDetails = new ConfigError('missing key', { key: 'API_KEY' });
    expect(withDetails.toPayload()).toEqual({
      code: 78,
      name: 'ConfigError',
      message: 'missing key',
      details: { key: 'API_KEY' },
    });
    const withoutDetails = new IoError('ENOSPC');
    expect(withoutDetails.toPayload()).toEqual({
      code: 74,
      name: 'IoError',
      message: 'ENOSPC',
    });
  });
});

describe('resolveExitCode', () => {
  it('returns the typed error code for McpGuardError instances', () => {
    expect(resolveExitCode(new UsageError('x'))).toBe(64);
    expect(resolveExitCode(new IoError('x'))).toBe(74);
  });

  it('maps unknown throwables to InternalError', () => {
    expect(resolveExitCode(new Error('plain'))).toBe(70);
    expect(resolveExitCode('string thrown')).toBe(70);
    expect(resolveExitCode(undefined)).toBe(70);
    expect(resolveExitCode(null)).toBe(70);
    expect(resolveExitCode(42)).toBe(70);
  });
});

describe('docs/EXIT_CODES.md ↔ ExitCode equivalence', () => {
  // The doc table must match the code constants. If you add a new code,
  // update both this assertion and the markdown table.
  const md = readFileSync(resolve('docs', 'EXIT_CODES.md'), 'utf-8');

  const expectations: ReadonlyArray<[string, number]> = [
    ['Success', 0],
    ['FindingsExceedThreshold', 1],
    ['InvalidInput', 2],
    ['UsageError', 64],
    ['DataFormatError', 65],
    ['InternalError', 70],
    ['IoError', 74],
    ['ConfigError', 78],
  ];

  for (const [name, code] of expectations) {
    it(`mentions ${name} with exit code ${code}`, () => {
      // doc rows look like: `|    0 | \`Success\`                  | ...`
      const rowPattern = new RegExp(`\\|\\s*${code}\\s*\\|\\s*\\\`${name}\\\``);
      expect(md).toMatch(rowPattern);
    });
  }
});
