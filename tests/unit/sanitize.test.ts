import { describe, it, expect } from 'vitest';

import { sanitize, stripAnsi, stripControlChars } from '../../src/logger/sanitize.js';

describe('stripAnsi', () => {
  it('removes CSI color sequences', () => {
    // \x1b[31m red, \x1b[0m reset
    expect(stripAnsi('\x1b[31mERROR\x1b[0m')).toBe('ERROR');
  });

  it('removes cursor positioning sequences', () => {
    expect(stripAnsi('A\x1b[2JB\x1b[H')).toBe('AB');
  });

  it('removes OSC sequences terminated by BEL', () => {
    expect(stripAnsi('title\x1b]0;evil\x07after')).toBe('titleafter');
  });

  it('removes OSC sequences terminated by ST', () => {
    expect(stripAnsi('x\x1b]8;;http://example.com\x1b\\link')).toBe('xlink');
  });

  it('removes lone-byte ESC sequences', () => {
    expect(stripAnsi('save\x1b7restore')).toBe('saverestore');
  });

  it('leaves plain text alone', () => {
    expect(stripAnsi('clean text 123 ✓')).toBe('clean text 123 ✓');
  });
});

describe('stripControlChars', () => {
  it('removes C0 control codes', () => {
    expect(stripControlChars('hello\x00world')).toBe('helloworld');
    expect(stripControlChars('a\x08b\x0Bc')).toBe('abc');
  });

  it('removes DEL (0x7F)', () => {
    expect(stripControlChars('x\x7Fy')).toBe('xy');
  });

  it('preserves tab, LF, CR', () => {
    expect(stripControlChars('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('preserves printable + unicode', () => {
    expect(stripControlChars('hello 世界 ✓')).toBe('hello 世界 ✓');
  });
});

describe('sanitize', () => {
  it('strips ANSI first, then control chars', () => {
    expect(sanitize('\x1b[31m\x00bad\x07\x1b[0m')).toBe('bad');
  });

  it('neutralizes terminal-injection payloads (no escape sequences remain)', () => {
    // Malformed OSC interleaved with CSI clear + null + BEL. Inner ESC
    // breaks the OSC sequence per ECMA-48; the regex strips the leading
    // ESC ] plus all enclosed CSI sequences plus control chars, leaving
    // only inert payload bytes that cannot reposition the cursor.
    const evil = '\x1b]8;;\x1b[H\x1b[2J\x00malicious\x07';
    const cleaned = sanitize(evil);
    expect(cleaned).not.toContain('\x1b');
    expect(cleaned).not.toContain('\x00');
    expect(cleaned).not.toContain('\x07');
    expect(cleaned).toContain('malicious');
  });

  it('returns empty string for input that is only escapes and controls', () => {
    expect(sanitize('\x1b[2J\x00\x07\x1b[H')).toBe('');
  });
});
