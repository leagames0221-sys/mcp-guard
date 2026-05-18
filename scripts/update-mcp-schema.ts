#!/usr/bin/env tsx
// Fetch the latest commit SHA from the canonical MCP specification repo
// and either (a) update the local pin (default) or (b) check for drift
// without writing (--check). Designed to run in CI per ADR-0005.
//
// Usage:
//   tsx scripts/update-mcp-schema.ts          # update pin + snapshot
//   tsx scripts/update-mcp-schema.ts --check  # exit non-zero on drift

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UPSTREAM_OWNER = 'modelcontextprotocol';
const UPSTREAM_REPO = 'modelcontextprotocol';
const UPSTREAM_BRANCH = 'main';
const COMMIT_API = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/${UPSTREAM_BRANCH}`;

const PIN_PATH = resolve('src', 'scanners', 'mcp-schema', 'upstream-commit.txt');
const SNAPSHOT_PATH = resolve('src', 'scanners', 'mcp-schema', 'snapshot.json');
const DRIFT_REPORT_PATH = resolve('mcp-schema-drift-report.json');

const PLACEHOLDER = 'UNPINNED-INITIAL-RUN-DEFERRED';

interface FetchResult {
  sha: string;
  message: string;
}

async function fetchUpstreamHead(): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mcp-guard-drift-checker',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(COMMIT_API, { headers });
  if (!response.ok) {
    throw new Error(
      `upstream fetch failed (${response.status} ${response.statusText}); see ADR-0005 for re-pin protocol`,
    );
  }
  const json = (await response.json()) as { sha: string; commit?: { message?: string } };
  return { sha: json.sha, message: json.commit?.message ?? '' };
}

function readPin(): string {
  return readFileSync(PIN_PATH, 'utf-8').trim();
}

function writePin(sha: string): void {
  writeFileSync(PIN_PATH, `${sha}\n`, 'utf-8');
}

function writeDriftReport(localSha: string, upstreamSha: string, upstreamMessage: string): void {
  writeFileSync(
    DRIFT_REPORT_PATH,
    `${JSON.stringify(
      {
        localSha,
        upstreamSha,
        upstreamMessage,
        snapshotPath: SNAPSHOT_PATH,
        guidance: 'See ADR-0005 § Re-pin protocol.',
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
}

async function main(): Promise<number> {
  const checkOnly = process.argv.includes('--check');
  const localSha = readPin();
  const upstream = await fetchUpstreamHead();

  if (localSha === PLACEHOLDER) {
    if (checkOnly) {
      // First-run skip per ADR-0005 §2.
      process.stdout.write(
        `[update-mcp-schema] pin is placeholder; skipping drift check (ADR-0005 §2)\n`,
      );
      return 0;
    }
    writePin(upstream.sha);
    process.stdout.write(
      `[update-mcp-schema] initial pin written: ${upstream.sha} (${upstream.message.split('\n')[0] ?? ''})\n`,
    );
    return 0;
  }

  if (localSha === upstream.sha) {
    process.stdout.write(`[update-mcp-schema] pin in sync (${localSha})\n`);
    return 0;
  }

  // Drift detected.
  writeDriftReport(localSha, upstream.sha, upstream.message);
  if (checkOnly) {
    process.stderr.write(
      `[update-mcp-schema] DRIFT: local=${localSha} upstream=${upstream.sha}\n` +
        `See ${DRIFT_REPORT_PATH} for details.\n`,
    );
    return 1;
  }
  writePin(upstream.sha);
  process.stdout.write(
    `[update-mcp-schema] pin updated ${localSha} -> ${upstream.sha}\n` +
      `Drift report written to ${DRIFT_REPORT_PATH}; review snapshot.json before commit.\n`,
  );
  return 0;
}

if (!process.env['VITEST']) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`[update-mcp-schema] ERROR: ${(err as Error).message}\n`);
      process.exit(1);
    });
}
