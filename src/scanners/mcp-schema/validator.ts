// Runtime validator for .mcp.json files. The zod schema below is the
// machine-checkable mirror of snapshot.json (see ADR-0005 for the
// drift policy). A unit test asserts structural equivalence between
// the two so updates land coherently.

import { z } from 'zod';

import { DataFormatError, InvalidInputError } from '../../errors/index.js';

export const stdioServerSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
  })
  .strict();

export const httpServerSchema = z
  .object({
    url: z.string().url(),
    transport: z.enum(['sse', 'http', 'streamable-http']).optional(),
    headers: z.record(z.string()).optional(),
  })
  .strict();

export const serverConfigSchema = z.union([stdioServerSchema, httpServerSchema]);

export const mcpConfigSchema = z
  .object({
    mcpServers: z.record(serverConfigSchema),
  })
  .strict();

export type StdioServer = z.infer<typeof stdioServerSchema>;
export type HttpServer = z.infer<typeof httpServerSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type McpConfig = z.infer<typeof mcpConfigSchema>;

export interface ParseResult {
  config: McpConfig;
}

// Parse raw text into a typed McpConfig. Structural problems (malformed
// JSON, root not an object) surface as DataFormatError so the CLI can
// map them to exit code 65. Semantic schema failures surface as
// InvalidInputError (exit code 2) per AC-001-2.
export function parseMcpConfig(raw: string, sourcePath?: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DataFormatError(`failed to parse .mcp.json: ${(err as Error).message}`, {
      path: sourcePath,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DataFormatError('.mcp.json root must be a JSON object', { path: sourcePath });
  }
  const result = mcpConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidInputError(`.mcp.json failed schema validation`, {
      path: sourcePath,
      issues: result.error.issues,
    });
  }
  return { config: result.data };
}
