#!/usr/bin/env tsx
// Channel B forbidden-token precommit hook.
// Loads mask list from .claude/internal_notes.md (gitignored), scans the
// staged git diff for forbidden tokens, fails closed on missing mask list.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_MASK_PATH = resolve('.claude', 'internal_notes.md');

const MAX_TOKEN_LEN = 80;

export interface MaskHit {
  token: string;
  lineHint: string;
}

// Extract back-ticked tokens from the mask markdown. Tokens longer than
// MAX_TOKEN_LEN chars are skipped (likely prose, not identifiers).
export function extractMaskTokens(maskMd: string): string[] {
  const tokens = new Set<string>();
  const regex = /`([^`\n]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(maskMd)) !== null) {
    const token = match[1]?.trim();
    if (token && token.length > 0 && token.length <= MAX_TOKEN_LEN) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

// Scan unified-diff text for added lines containing any mask token.
// Case-insensitive. Returns at most one hit per token (first occurrence).
export function scanDiff(diff: string, tokens: readonly string[]): MaskHit[] {
  const addedLines = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  const hits: MaskHit[] = [];
  for (const token of tokens) {
    const needle = token.toLowerCase();
    for (const line of addedLines) {
      if (line.toLowerCase().includes(needle)) {
        hits.push({ token, lineHint: line.slice(0, 120) });
        break;
      }
    }
  }
  return hits;
}

export function loadMaskList(path: string = DEFAULT_MASK_PATH): string[] {
  if (!existsSync(path)) {
    throw new Error(`mask list not found at ${path}`);
  }
  const content = readFileSync(path, 'utf-8');
  return extractMaskTokens(content);
}

export function getStagedDiff(): string {
  try {
    return execSync('git diff --cached --no-color', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

export type ExitCode = 0 | 1 | 2;

export function evaluate(
  maskPath: string,
  diff: string,
): { code: ExitCode; message: string; hits: MaskHit[] } {
  let tokens: string[];
  try {
    tokens = loadMaskList(maskPath);
  } catch (err) {
    return {
      code: 2,
      message: `[mask:check] FAIL CLOSED: ${(err as Error).message}`,
      hits: [],
    };
  }
  if (!diff.trim()) {
    return { code: 0, message: '[mask:check] No staged changes, skipping.', hits: [] };
  }
  const hits = scanDiff(diff, tokens);
  if (hits.length === 0) {
    return {
      code: 0,
      message: `[mask:check] PASS — scanned ${tokens.length} mask tokens, no leak.`,
      hits: [],
    };
  }
  const blockedLines = ['[mask:check] BLOCKED — Channel B forbidden tokens detected:'];
  for (const hit of hits) {
    blockedLines.push(`  - ${hit.token}: ${hit.lineHint}`);
  }
  blockedLines.push(
    'Remediation: remove tokens or document an exception in .claude/internal_overrides.md',
  );
  return { code: 1, message: blockedLines.join('\n'), hits };
}

function runAsScript(): never {
  const result = evaluate(DEFAULT_MASK_PATH, getStagedDiff());
  const writer = result.code === 0 ? process.stdout : process.stderr;
  writer.write(`${result.message}\n`);
  process.exit(result.code);
}

if (!process.env['VITEST']) {
  runAsScript();
}
