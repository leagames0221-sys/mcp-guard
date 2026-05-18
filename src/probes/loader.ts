// Probe corpus loader (T-23, D-002 + D-009). YAML, 1 probe = 1 file.
// Validation gates:
//   - YAML parse failure                                → DataFormatError (exit 65)
//   - missing `corpus_version` or `owasp_category`      → InvalidInputError (exit 2, literal AC)
//   - any other schema mismatch (id/title/prompt/…)     → InvalidInputError (exit 2)
//   - filesystem read failure                           → IoError (exit 74)
//
// The directory loader walks `*.yaml` / `*.yml` recursively, preserves
// the discovery order (sorted lexicographic for cross-OS reproducibility),
// and surfaces per-file errors with the offending source path attached.

import { readFile } from 'node:fs/promises';
import { readdirSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';

import YAML from 'yaml';
import { z } from 'zod';

import { DataFormatError, InvalidInputError, IoError } from '../errors/index.js';
import {
  EXPECTED_BEHAVIORS,
  OWASP_CATEGORIES,
  type LoadedProbe,
  type Probe,
} from './types.js';

const probeSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    corpus_version: z.number().int().positive(),
    owasp_category: z.enum(OWASP_CATEGORIES),
    title: z.string().min(1),
    description: z.string().min(1),
    prompt: z.string().min(1),
    expected_behavior: z.enum(EXPECTED_BEHAVIORS),
    tags: z.array(z.string().min(1)).default([]),
    references: z.array(z.string().url()).min(1),
    license: z.string().min(1),
  })
  .strict();

// Two fields the AC literally names — separate gate so the loader's error
// message is unambiguous about what is missing (and so the test can target
// these two without relying on zod's generic phrasing).
const REQUIRED_METADATA_KEYS = ['corpus_version', 'owasp_category'] as const;

export function parseProbeYaml(yamlText: string, sourcePath: string): Probe {
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlText);
  } catch (err) {
    throw new DataFormatError(`probe YAML parse failed at ${sourcePath}: ${(err as Error).message}`, {
      sourcePath,
    });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DataFormatError(`probe root must be a YAML mapping at ${sourcePath}`, {
      sourcePath,
    });
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_METADATA_KEYS.filter((k) => !(k in record));
  if (missing.length > 0) {
    throw new InvalidInputError(
      `probe at ${sourcePath} is missing required metadata: ${missing.join(', ')}`,
      { sourcePath, missing },
    );
  }

  const result = probeSchema.safeParse(record);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new InvalidInputError(`probe at ${sourcePath} failed schema validation: ${issues.join('; ')}`, {
      sourcePath,
      issues,
    });
  }

  return Object.freeze(result.data) as Probe;
}

export async function loadProbeFile(filePath: string): Promise<LoadedProbe> {
  const absolute = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolute, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'IO_ERROR';
    throw new IoError(`failed to read probe ${absolute}: ${(err as Error).message}`, {
      sourcePath: absolute,
      code,
    });
  }
  const probe = parseProbeYaml(raw, absolute);
  return { probe, sourcePath: absolute };
}

// Lexicographic walk so the file ordering is deterministic across OSes
// (Linux readdir is filesystem-order, macOS APFS is insertion-order,
// Windows NTFS is name-order; sort here pins it).
function listProbeFilesSync(dirAbs: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dirAbs];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(cur, { withFileTypes: true, encoding: 'utf-8' }) as Dirent[];
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? 'IO_ERROR';
      throw new IoError(`failed to read probe directory ${cur}: ${(err as Error).message}`, {
        sourcePath: cur,
        code,
      });
    }
    // Sort each level so output is stable.
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && /\.(yaml|yml)$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function loadProbeDirectory(dirPath: string): Promise<LoadedProbe[]> {
  const absolute = resolve(dirPath);
  const files = listProbeFilesSync(absolute);
  const loaded: LoadedProbe[] = [];
  for (const f of files) {
    loaded.push(await loadProbeFile(f));
  }
  // Defensive duplicate-id gate: ids feed into Finding ids + verdict
  // tables, and silent dedup would mask author error.
  const seen = new Map<string, string>();
  for (const { probe, sourcePath } of loaded) {
    const prior = seen.get(probe.id);
    if (prior !== undefined) {
      throw new InvalidInputError(`duplicate probe id "${probe.id}" at ${sourcePath} (also at ${prior})`, {
        id: probe.id,
        sourcePath,
        priorPath: prior,
      });
    }
    seen.set(probe.id, sourcePath);
  }
  return loaded;
}
