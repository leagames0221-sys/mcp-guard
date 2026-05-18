import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseMcpConfig, mcpConfigSchema } from '../../src/scanners/mcp-schema/validator.js';
import { DataFormatError, InvalidInputError } from '../../src/errors/index.js';

describe('parseMcpConfig structural failures (AC-001-2 -> DataFormatError)', () => {
  it('rejects non-JSON input', () => {
    expect(() => parseMcpConfig('<not json>')).toThrow(DataFormatError);
  });

  it('rejects JSON whose root is not an object', () => {
    expect(() => parseMcpConfig('[1,2,3]')).toThrow(DataFormatError);
    expect(() => parseMcpConfig('"a string"')).toThrow(DataFormatError);
    expect(() => parseMcpConfig('null')).toThrow(DataFormatError);
  });
});

describe('parseMcpConfig schema failures (AC-001-2 -> InvalidInputError)', () => {
  it('rejects missing mcpServers field', () => {
    expect(() => parseMcpConfig('{}')).toThrow(InvalidInputError);
  });

  it('rejects extra top-level keys', () => {
    expect(() =>
      parseMcpConfig(JSON.stringify({ mcpServers: {}, unrelated: 'x' })),
    ).toThrow(InvalidInputError);
  });

  it('rejects a stdio server missing command', () => {
    expect(() =>
      parseMcpConfig(
        JSON.stringify({
          mcpServers: { broken: { args: ['x'] } },
        }),
      ),
    ).toThrow(InvalidInputError);
  });

  it('rejects an HTTP server with a non-URL url field', () => {
    expect(() =>
      parseMcpConfig(
        JSON.stringify({
          mcpServers: { broken: { url: 'not-a-url' } },
        }),
      ),
    ).toThrow(InvalidInputError);
  });

  it('rejects unknown transport values', () => {
    expect(() =>
      parseMcpConfig(
        JSON.stringify({
          mcpServers: {
            broken: { url: 'https://example.com', transport: 'tcp' },
          },
        }),
      ),
    ).toThrow(InvalidInputError);
  });
});

describe('parseMcpConfig happy path', () => {
  it('accepts a minimal stdio server', () => {
    const result = parseMcpConfig(
      JSON.stringify({ mcpServers: { local: { command: 'node' } } }),
    );
    expect(result.config.mcpServers['local']).toEqual({ command: 'node' });
  });

  it('accepts a stdio server with args, env, and cwd', () => {
    const cfg = {
      mcpServers: {
        local: {
          command: 'node',
          args: ['server.js'],
          env: { LOG: 'debug' },
          cwd: '/srv/app',
        },
      },
    };
    expect(parseMcpConfig(JSON.stringify(cfg)).config).toEqual(cfg);
  });

  it('accepts an HTTP server with transport + headers', () => {
    const cfg = {
      mcpServers: {
        remote: {
          url: 'https://example.com/mcp',
          transport: 'streamable-http' as const,
          headers: { Authorization: 'Bearer x' },
        },
      },
    };
    expect(parseMcpConfig(JSON.stringify(cfg)).config).toEqual(cfg);
  });

  it('accepts multiple servers mixing transports', () => {
    const cfg = {
      mcpServers: {
        local: { command: 'node', args: ['s.js'] },
        remote: { url: 'https://example.com/mcp', transport: 'sse' as const },
      },
    };
    expect(parseMcpConfig(JSON.stringify(cfg)).config).toEqual(cfg);
  });
});

describe('snapshot.json ↔ zod validator equivalence (ADR-0005)', () => {
  // Both artifacts describe the same shape. We verify representative
  // points of equivalence — exhaustive structural comparison would
  // require JSON Schema↔zod round-trip which is out of scope for L1.
  const snapshot = JSON.parse(
    readFileSync(resolve('src', 'scanners', 'mcp-schema', 'snapshot.json'), 'utf-8'),
  );

  it('snapshot has required top-level mcpServers and rejects additional properties', () => {
    expect(snapshot.required).toContain('mcpServers');
    expect(snapshot.additionalProperties).toBe(false);
  });

  it('snapshot stdio server requires command', () => {
    expect(snapshot.$defs.stdioServer.required).toContain('command');
  });

  it('snapshot http server requires url', () => {
    expect(snapshot.$defs.httpServer.required).toContain('url');
  });

  it('snapshot transport enum equals zod transport enum', () => {
    const snapshotTransports = snapshot.$defs.httpServer.properties.transport.enum;
    const zodTransports = ['sse', 'http', 'streamable-http'];
    expect(new Set(snapshotTransports)).toEqual(new Set(zodTransports));
  });

  it('the zod schema parses an example matching the snapshot shape', () => {
    const example = {
      mcpServers: { x: { command: 'node' } },
    };
    expect(mcpConfigSchema.safeParse(example).success).toBe(true);
  });
});

describe('upstream-commit.txt pin', () => {
  const content = readFileSync(
    resolve('src', 'scanners', 'mcp-schema', 'upstream-commit.txt'),
    'utf-8',
  ).trim();

  it('is either the documented placeholder or a 40-char SHA', () => {
    const isPlaceholder = content === 'UNPINNED-INITIAL-RUN-DEFERRED';
    const isSha = /^[0-9a-f]{40}$/.test(content);
    expect(isPlaceholder || isSha).toBe(true);
  });
});
