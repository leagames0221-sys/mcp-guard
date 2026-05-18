import { describe, it, expect } from 'vitest';
import { readFile, stat, writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  readMcpConfig,
  locateJsonError,
} from '../../src/io/parsers/index.js';
import {
  DataFormatError,
  InvalidInputError,
  IoError,
} from '../../src/errors/index.js';

const FIXTURES = resolve(__dirname, '../fixtures/mcp');

// T-14 (AC-001-2 error mapping + AC-001-5 input never modified):
// `readMcpConfig` reads .mcp.json off disk, hands the raw text to the
// T-09 zod validator, and never writes back. Structural failures (bad
// JSON / non-object root) become DataFormatError (exit 65); schema
// failures become InvalidInputError (exit 2); I/O failures become
// IoError (exit 74).

describe('readMcpConfig — valid fixtures round-trip', () => {
  it('parses valid-stdio.json and returns absolute path', async () => {
    const result = await readMcpConfig(join(FIXTURES, 'valid-stdio.json'));
    expect(result.path).toBe(resolve(FIXTURES, 'valid-stdio.json'));
    expect(result.config.mcpServers.filesystem).toMatchObject({
      command: 'npx',
    });
  });

  it('parses valid-http.json with sse transport', async () => {
    const result = await readMcpConfig(join(FIXTURES, 'valid-http.json'));
    const server = result.config.mcpServers['remote-api']!;
    expect(server).toMatchObject({
      url: 'https://example.invalid/sse',
      transport: 'sse',
    });
  });

  it('parses valid-mixed.json (stdio + http in one file)', async () => {
    const result = await readMcpConfig(join(FIXTURES, 'valid-mixed.json'));
    expect(Object.keys(result.config.mcpServers).sort()).toEqual([
      'local-fs',
      'remote-sse',
    ]);
  });

  it('accepts relative paths and resolves them to absolute', async () => {
    // Resolve via cwd-independent construction
    const rel = `./${join('tests', 'fixtures', 'mcp', 'valid-stdio.json')}`;
    const result = await readMcpConfig(rel);
    expect(result.path).toBe(resolve(rel));
  });
});

describe('readMcpConfig — AC-001-5 (input file never modified)', () => {
  it('leaves file content + mtime unchanged across read', async () => {
    const target = join(FIXTURES, 'valid-stdio.json');
    const before = await readFile(target, 'utf-8');
    const beforeStat = await stat(target);

    await readMcpConfig(target);

    const after = await readFile(target, 'utf-8');
    const afterStat = await stat(target);

    expect(after).toBe(before);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    expect(afterStat.size).toBe(beforeStat.size);
  });

  it('does not write to the input path even when parse fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-input-immut-'));
    const target = join(dir, 'broken.json');
    const original = '{ "mcpServers": { "x": }';
    await writeFile(target, original, 'utf-8');
    const beforeStat = await stat(target);

    await expect(readMcpConfig(target)).rejects.toBeInstanceOf(DataFormatError);

    const after = await readFile(target, 'utf-8');
    const afterStat = await stat(target);
    expect(after).toBe(original);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);

    await unlink(target);
  });
});

describe('readMcpConfig — AC-001-2 error mapping', () => {
  it('IoError on missing file with code ENOENT in details', async () => {
    try {
      await readMcpConfig(join(FIXTURES, 'does-not-exist.json'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IoError);
      expect((err as IoError).details).toMatchObject({ code: 'ENOENT' });
    }
  });

  it('DataFormatError on malformed JSON (trailing comma fixture)', async () => {
    try {
      await readMcpConfig(join(FIXTURES, 'invalid-trailing-comma.json'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataFormatError);
      expect((err as DataFormatError).details).toMatchObject({
        path: resolve(FIXTURES, 'invalid-trailing-comma.json'),
      });
    }
  });

  it('DataFormatError on non-object root (array fixture)', async () => {
    try {
      await readMcpConfig(join(FIXTURES, 'invalid-root-array.json'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataFormatError);
      expect((err as Error).message).toMatch(/root must be a JSON object/);
    }
  });

  it('InvalidInputError on schema violation (missing required command field)', async () => {
    try {
      await readMcpConfig(join(FIXTURES, 'invalid-schema-missing-command.json'));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidInputError);
      const details = (err as InvalidInputError).details ?? {};
      expect(details.path).toBe(resolve(FIXTURES, 'invalid-schema-missing-command.json'));
      expect(Array.isArray(details.issues)).toBe(true);
    }
  });

  it('enriches DataFormatError with line/col when JSON parser supplies position', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-guard-linecol-'));
    const target = join(dir, 'pos.json');
    await writeFile(target, '{\n  "mcpServers": {\n    "x": }\n}\n', 'utf-8');

    try {
      await readMcpConfig(target);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataFormatError);
      const details = (err as DataFormatError).details ?? {};
      // Position information may or may not be present depending on the
      // Node JSON.parse error string format; if present, line/col must
      // be positive integers pointing into the file.
      if (details.line !== undefined) {
        expect(Number.isInteger(details.line)).toBe(true);
        expect(details.line).toBeGreaterThan(0);
        expect(Number.isInteger(details.col)).toBe(true);
        expect(details.col).toBeGreaterThan(0);
      }
    } finally {
      await unlink(target);
    }
  });
});

describe('locateJsonError — coordinate extraction', () => {
  it('extracts line/col from "at position N" form (V8 classic)', () => {
    // raw layout (0-indexed):
    //   line 1 (cols 1..5): a a a a \n   → chars 0..4
    //   line 2 (cols 1..3): b b \n       → chars 5..7
    //   line 3 (cols 1..4): c c c c      → chars 8..11
    // position 7 → line 2, col 3 (the trailing newline of line 2)
    const raw = 'aaaa\nbb\ncccc';
    const lc = locateJsonError(raw, 'Unexpected token X in JSON at position 7');
    expect(lc).toEqual({ line: 2, col: 3 });
  });

  it('extracts line/col from explicit "line L column C" form (V8 modern)', () => {
    const raw = 'irrelevant';
    const lc = locateJsonError(raw, 'Unexpected token } at line 4 column 12');
    expect(lc).toEqual({ line: 4, col: 12 });
  });

  it('returns undefined when neither pattern matches', () => {
    expect(locateJsonError('abc', 'nothing here')).toBeUndefined();
  });

  it('returns undefined when position overshoots the buffer', () => {
    expect(locateJsonError('abc', 'at position 9999')).toBeUndefined();
  });

  it('handles position 0 (first character)', () => {
    const lc = locateJsonError('xyz', 'at position 0');
    expect(lc).toEqual({ line: 1, col: 1 });
  });
});
