import { describe, it, expect } from 'vitest';

import { ExitCode } from '../../src/errors/index.js';
import {
  MIN_NODE_MAJOR,
  checkNodeVersion,
  enforceNodeVersion,
  parseMajor,
} from '../../src/cli/node-version-check.js';

function captureStream(): NodeJS.WritableStream & { readonly text: string } {
  const chunks: string[] = [];
  const sink = {
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    },
  } as unknown as { -readonly [K in keyof (NodeJS.WritableStream & { text: string })]: (NodeJS.WritableStream & { text: string })[K] };
  Object.defineProperty(sink, 'text', { get: () => chunks.join('') });
  return sink as NodeJS.WritableStream & { readonly text: string };
}

describe('parseMajor', () => {
  it('parses canonical vMAJOR.MINOR.PATCH', () => {
    expect(parseMajor('v20.10.0')).toBe(20);
    expect(parseMajor('v22.1.0')).toBe(22);
  });

  it('parses without leading v', () => {
    expect(parseMajor('21.4.0')).toBe(21);
  });

  it('returns NaN on garbage input', () => {
    expect(Number.isNaN(parseMajor('not-a-version'))).toBe(true);
    expect(Number.isNaN(parseMajor(''))).toBe(true);
  });
});

describe('checkNodeVersion (AC-005-5)', () => {
  it('passes on Node 20', () => {
    const r = checkNodeVersion('v20.0.0');
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(ExitCode.Success);
  });

  it('passes on Node 22', () => {
    expect(checkNodeVersion('v22.10.0').ok).toBe(true);
  });

  it('fails on Node 18 with ConfigError exit', () => {
    const r = checkNodeVersion('v18.19.0');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(ExitCode.ConfigError);
    expect(r.message).toContain(String(MIN_NODE_MAJOR));
  });

  it('fails on Node 16', () => {
    expect(checkNodeVersion('v16.20.0').ok).toBe(false);
  });

  it('actionable error names a path to fix it', () => {
    const r = checkNodeVersion('v18.0.0');
    expect(r.message).toContain('nodejs.org');
  });

  it('fails closed on unparseable input', () => {
    const r = checkNodeVersion('???');
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(ExitCode.ConfigError);
  });
});

describe('enforceNodeVersion', () => {
  it('writes the error message to stderr on failure', () => {
    const stderr = captureStream();
    const r = enforceNodeVersion('v18.0.0', stderr);
    expect(r.ok).toBe(false);
    expect(stderr.text).toContain(String(MIN_NODE_MAJOR));
  });

  it('does not write to stderr on success', () => {
    const stderr = captureStream();
    enforceNodeVersion('v20.10.0', stderr);
    expect(stderr.text).toBe('');
  });
});
