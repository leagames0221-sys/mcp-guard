// Read + parse a .mcp.json file from disk. Thin I/O wrapper around the
// T-09 zod validator: this module owns the filesystem interaction, the
// validator owns the schema interpretation. AC-001-5: the input file is
// never modified — only opened for reading.
//
// Error mapping (AC-001-2):
//   - filesystem failure (ENOENT, EACCES, ...) → IoError (exit 74)
//   - malformed JSON / non-object root         → DataFormatError (exit 65)
//   - schema validation failure                → InvalidInputError (exit 2)

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataFormatError, IoError } from '../../errors/index.js';
import { parseMcpConfig } from '../../scanners/mcp-schema/validator.js';
import type { McpConfig } from '../../scanners/mcp-schema/validator.js';

export interface ReadMcpConfigResult {
  path: string;
  config: McpConfig;
}

export async function readMcpConfig(filePath: string): Promise<ReadMcpConfigResult> {
  const absolute = resolve(filePath);

  let raw: string;
  try {
    raw = await readFile(absolute, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'IO_ERROR';
    throw new IoError(`failed to read ${absolute}: ${(err as Error).message}`, {
      path: absolute,
      code,
    });
  }

  try {
    const { config } = parseMcpConfig(raw, absolute);
    return { path: absolute, config };
  } catch (err) {
    if (err instanceof DataFormatError) {
      const lineCol = locateJsonError(raw, err.message);
      if (lineCol) {
        throw new DataFormatError(err.message, {
          ...(err.details ?? {}),
          line: lineCol.line,
          col: lineCol.col,
        });
      }
    }
    throw err;
  }
}

// JSON.parse error messages from V8 carry a byte position; Node 22+ also
// carries human-readable "(line L column C)" in some shapes. Be tolerant
// of both, return undefined when neither resolves so callers don't
// fabricate coordinates.
export function locateJsonError(
  raw: string,
  message: string,
): { line: number; col: number } | undefined {
  const explicit = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (explicit) {
    const line = Number.parseInt(explicit[1] ?? '', 10);
    const col = Number.parseInt(explicit[2] ?? '', 10);
    if (Number.isFinite(line) && Number.isFinite(col)) return { line, col };
  }

  const position = message.match(/at position\s+(\d+)/i);
  if (!position) return undefined;
  const pos = Number.parseInt(position[1] ?? '', 10);
  if (!Number.isFinite(pos) || pos < 0 || pos > raw.length) return undefined;

  let line = 1;
  let col = 1;
  const cap = Math.min(pos, raw.length);
  for (let i = 0; i < cap; i++) {
    if (raw[i] === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}
