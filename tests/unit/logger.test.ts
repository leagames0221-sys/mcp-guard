import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';

import { createLogger, LogLevel } from '../../src/logger/index.js';

function collectStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('LogLevel', () => {
  it('defines a strictly increasing order', () => {
    expect(LogLevel.debug).toBeLessThan(LogLevel.info);
    expect(LogLevel.info).toBeLessThan(LogLevel.warn);
    expect(LogLevel.warn).toBeLessThan(LogLevel.error);
    expect(LogLevel.error).toBeLessThan(LogLevel.silent);
  });
});

describe('createLogger level filtering', () => {
  it('emits only at-or-above the configured level', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'warn', stream });
    log.debug('hidden-debug');
    log.info('hidden-info');
    log.warn('visible-warn');
    log.error('visible-error');
    const text = output();
    expect(text).not.toContain('hidden-debug');
    expect(text).not.toContain('hidden-info');
    expect(text).toContain('[warn] visible-warn');
    expect(text).toContain('[error] visible-error');
  });

  it('silent level suppresses everything', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'silent', stream });
    log.debug('x');
    log.info('x');
    log.warn('x');
    log.error('x');
    log.progress(1, 2, 'probe');
    expect(output()).toBe('');
  });

  it('debug level emits all', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'debug', stream });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(output().split('\n').filter(Boolean)).toHaveLength(4);
  });
});

describe('createLogger output sanitization', () => {
  it('strips ANSI from emitted messages', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'info', stream });
    log.info('\x1b[31mred\x1b[0m');
    expect(output()).toBe('[info] red\n');
  });

  it('strips control chars from emitted messages', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'info', stream });
    log.info('a\x00b\x07c');
    expect(output()).toBe('[info] abc\n');
  });
});

describe('createLogger progress (AC-002-3)', () => {
  it('emits [N/M] <name> format on the configured stream', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'info', stream });
    log.progress(3, 10, 'probe-name');
    expect(output()).toBe('[3/10] probe-name\n');
  });

  it('sanitizes probe names to prevent terminal injection', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'info', stream });
    log.progress(1, 2, '\x1b[2Jevil\x00name');
    expect(output()).toBe('[1/2] evilname\n');
  });

  it('progress respects info threshold (suppressed at warn or above)', () => {
    const { stream, output } = collectStream();
    const log = createLogger({ level: 'warn', stream });
    log.progress(1, 2, 'probe');
    expect(output()).toBe('');
  });
});
