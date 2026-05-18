// T-22 (AC-001-1): Supply-chain-risk detector. Inspects stdio
// invocation (`command` + `args`) for package-fetching executors
// (npx / uvx / bunx / pnpm dlx) and flags 2 supply-chain failure
// modes around those, plus 2 http-URL patterns that smell like
// untrusted code-delivery channels:
//
//   SUPPLY-CHAIN-UNSCOPED-PACKAGE  medium  package-executor target
//                                          has no `@scope/` prefix —
//                                          typosquat surface is wider
//                                          on unscoped npm names
//                                          (Shai-Hulud / s1ngularity
//                                          family of corpus)
//   SUPPLY-CHAIN-UNPINNED-VERSION  medium  package-executor target has
//                                          no explicit `@<version>`
//                                          pin, or pins to `@latest`
//                                          — install-time RCE surface
//                                          (each `npx -y` resolves the
//                                          latest published artefact)
//   SUPPLY-CHAIN-EPHEMERAL-HOST    medium  http server URL targets a
//                                          known ephemeral / preview
//                                          hosting domain (vercel.app
//                                          / netlify.app / ngrok* /
//                                          gitpod.io / replit.dev / …)
//   SUPPLY-CHAIN-RAW-CONTENT       high    http server URL targets a
//                                          raw-content CDN (raw.github
//                                          usercontent.com / gist raw
//                                          / pastebin) — code or config
//                                          served with no signature or
//                                          integrity attestation
//
// Reference: OWASP A06 Vulnerable and Outdated Components + npm
// supply-chain attack corpus (Shai-Hulud worm 2024-2025 wave +
// s1ngularity / TeamPCP scoped-mimic patterns).

import type { Finding } from '../io/emitters/json.js';
import { makeFindingId, type ScanContext, type Scanner } from './types.js';

const PACKAGE_EXECUTORS: ReadonlySet<string> = new Set(['npx', 'uvx', 'bunx']);

// npm-ecosystem subset of PACKAGE_EXECUTORS — UNSCOPED-PACKAGE only
// applies to these because PyPI (uvx) has no scoping concept (PEP 752
// scoped namespace exists in draft but is not actually enforced on
// pypi.org as of 2026-05). Pinning still applies to all executors.
const NPM_EXECUTORS: ReadonlySet<string> = new Set(['npx', 'bunx']);

function basename(commandPath: string): string {
  const normalized = commandPath.replace(/\\/g, '/');
  const last = normalized.split('/').pop() ?? commandPath;
  return last.replace(/\.exe$/i, '').toLowerCase();
}

// Resolve the package-spec positional from a package-executor's
// argv. Honours `-y` / `-p <pkg>` / `--package=<pkg>` / `--` prefixes.
// Returns undefined if no positional package-spec is present.
export function extractPackageSpec(
  command: string,
  args: readonly string[],
): string | undefined {
  const cmdBase = basename(command);

  let candidates: readonly string[];
  if (PACKAGE_EXECUTORS.has(cmdBase)) {
    candidates = args;
  } else if (cmdBase === 'pnpm' && args[0] === 'dlx') {
    candidates = args.slice(1);
  } else {
    return undefined;
  }

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]!;
    if (a === '--') return candidates[i + 1];
    if (a.startsWith('--package=')) return a.slice('--package='.length);
    if (a === '-p' || a === '--package') return candidates[i + 1];
    if (a.startsWith('-')) continue;
    return a;
  }
  return undefined;
}

// Parse `<name>` / `<name>@<version>` / `@scope/<name>@<version>`
// into name + optional version. The leading `@` of a scoped name
// is preserved on the name side; only the rightmost `@` (after the
// scope, if any) is the version separator.
export function parsePackageSpec(spec: string): {
  name: string;
  version?: string;
} {
  const stripLeading = spec.startsWith('@') ? spec.slice(1) : spec;
  const atIdx = stripLeading.indexOf('@');
  if (atIdx === -1) return { name: spec };
  const name = (spec.startsWith('@') ? '@' : '') + stripLeading.slice(0, atIdx);
  const version = stripLeading.slice(atIdx + 1);
  return { name, version };
}

const EPHEMERAL_HOST_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\.vercel\.app$/i, label: 'Vercel preview' },
  { re: /\.netlify\.app$/i, label: 'Netlify preview' },
  { re: /\.ngrok(?:-free)?\.(?:app|io)$/i, label: 'ngrok tunnel' },
  { re: /\.preview\.[a-z0-9.-]+$/i, label: 'preview subdomain' },
  { re: /\.gitpod\.io$/i, label: 'Gitpod workspace' },
  { re: /\.repl\.co$/i, label: 'Replit workspace (legacy)' },
  { re: /\.replit\.dev$/i, label: 'Replit workspace' },
  { re: /\.loca\.lt$/i, label: 'localtunnel' },
  { re: /\.trycloudflare\.com$/i, label: 'Cloudflare Quick Tunnel' },
  { re: /-pr-\d+\./i, label: 'per-PR preview' },
];

const RAW_CONTENT_PATTERNS: ReadonlyArray<{
  re: RegExp;
  vendor: string;
  matchPath?: RegExp;
}> = [
  { re: /^raw\.githubusercontent\.com$/i, vendor: 'GitHub raw content' },
  { re: /^gist\.githubusercontent\.com$/i, vendor: 'GitHub Gist raw content' },
  { re: /^raw\.gitea\.io$/i, vendor: 'Gitea raw content' },
  { re: /^pastebin\.com$/i, vendor: 'Pastebin', matchPath: /^\/raw\// },
  { re: /^gitlab\.com$/i, vendor: 'GitLab raw content', matchPath: /\/raw\// },
];

export type RuleId =
  | 'SUPPLY-CHAIN-UNSCOPED-PACKAGE'
  | 'SUPPLY-CHAIN-UNPINNED-VERSION'
  | 'SUPPLY-CHAIN-EPHEMERAL-HOST'
  | 'SUPPLY-CHAIN-RAW-CONTENT';

export interface RuleHit {
  ruleId: RuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  locatorSuffix: string;
}

export function evaluateStdioSupplyChain(
  command: string,
  args: readonly string[] = [],
): RuleHit[] {
  const hits: RuleHit[] = [];
  const spec = extractPackageSpec(command, args);
  if (spec === undefined) return hits;

  const { name, version } = parsePackageSpec(spec);
  const cmdBase = basename(command);
  const isNpmEcosystem =
    NPM_EXECUTORS.has(cmdBase) || (cmdBase === 'pnpm' && args[0] === 'dlx');

  if (isNpmEcosystem && !name.startsWith('@')) {
    hits.push({
      ruleId: 'SUPPLY-CHAIN-UNSCOPED-PACKAGE',
      severity: 'medium',
      message: `package-executor target "${name}" is unscoped — typosquat surface is wider on unscoped npm names (Shai-Hulud / s1ngularity family of attacks). Prefer an @scope/<name> spec when an upstream-controlled alternative exists.`,
      locatorSuffix: 'args',
    });
  }

  if (version === undefined || version.toLowerCase() === 'latest') {
    hits.push({
      ruleId: 'SUPPLY-CHAIN-UNPINNED-VERSION',
      severity: 'medium',
      message: `package-executor target "${spec}" has no explicit @<version> pin (or pins to @latest) — each invocation fetches the upstream tip, so a compromised release reaches users on the next launch. Pin to an exact semver (e.g. ${name}@1.2.3).`,
      locatorSuffix: 'args',
    });
  }

  return hits;
}

export function evaluateHttpSupplyChain(rawUrl: string): RuleHit[] {
  const hits: RuleHit[] = [];
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return hits;
  }
  const host = parsed.hostname.toLowerCase();

  for (const { re, label } of EPHEMERAL_HOST_PATTERNS) {
    if (re.test(host)) {
      hits.push({
        ruleId: 'SUPPLY-CHAIN-EPHEMERAL-HOST',
        severity: 'medium',
        message: `URL hostname "${host}" matches ${label} pattern — ephemeral/preview infrastructure is not suitable for steady-state production trust (DNS recycles, ownership transfers, TLS pinning impossible)`,
        locatorSuffix: 'url',
      });
      break;
    }
  }

  for (const { re, vendor, matchPath } of RAW_CONTENT_PATTERNS) {
    if (!re.test(host)) continue;
    if (matchPath && !matchPath.test(parsed.pathname)) continue;
    hits.push({
      ruleId: 'SUPPLY-CHAIN-RAW-CONTENT',
      severity: 'high',
      message: `URL targets ${vendor} ("${host}${parsed.pathname}") — raw content is served with no signature or release-process attestation, and the upstream file can be silently rewritten`,
      locatorSuffix: 'url',
    });
    break;
  }

  return hits;
}

export const supplyChainScanner: Scanner = {
  category: 'supply-chain-risk',
  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const [serverName, server] of Object.entries(ctx.config.mcpServers)) {
      let hits: RuleHit[] = [];
      if ('command' in server) {
        hits = evaluateStdioSupplyChain(server.command, server.args ?? []);
      } else if ('url' in server) {
        hits = evaluateHttpSupplyChain(server.url);
      }
      for (const hit of hits) {
        const locator = `mcpServers.${serverName}.${hit.locatorSuffix}`;
        findings.push({
          id: makeFindingId({
            category: 'supply-chain-risk',
            ruleId: hit.ruleId,
            target: ctx.target,
            locator,
          }),
          ruleId: hit.ruleId,
          severity: hit.severity,
          source: 'static',
          message: hit.message,
          path: ctx.target,
          details: {
            server: serverName,
            locator,
          },
        });
      }
    }
    return findings;
  },
};
