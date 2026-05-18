// T-21 (AC-001-1): Auth-gap detector. Inspects both http server
// (`url` + `headers`) and stdio server (`env`) for 5 authentication
// failure modes:
//
//   AUTH-GAP-URL-CREDENTIAL         high   `user:pass@host` userinfo
//                                          embed in URL — leaks via
//                                          logs / redirects / browser
//                                          history
//   AUTH-GAP-NO-AUTHORIZATION       medium public http host with NO
//                                          auth-like header at all
//                                          (loopback / private IP /
//                                          link-local / CGNAT exempt)
//   AUTH-GAP-WEAK-BEARER            high   `Bearer TODO` / `Bearer
//                                          YOUR_TOKEN` / `Bearer xxx`
//                                          / similar fix-me-later
//                                          placeholders — every request
//                                          fails auth or falls back to
//                                          anonymous
//   AUTH-GAP-BASIC-AUTH-PLAINTEXT   high   `Basic` over `http://` (no
//                                          TLS) — base64 credential
//                                          recoverable by any path
//                                          observer
//   AUTH-GAP-PLAINTEXT-CREDENTIAL   high   header value or env value
//                                          matches a vendor credential
//                                          signature (GitHub PAT, OpenAI,
//                                          Anthropic, AWS, Slack, Google,
//                                          GitLab) without env-interp or
//                                          `redacted-*` framing
//
// Reference: OWASP API Top 10 (API2:2023 Broken Authentication +
// API8:2023 Security Misconfiguration) + detect-secrets/trufflehog
// vendor-prefix corpus.

import type { Finding } from '../io/emitters/json.js';
import type { HttpServer, StdioServer } from './mcp-schema/validator.js';
import { makeFindingId, type ScanContext, type Scanner } from './types.js';

// --- Host classification (small + decoupled; if a third consumer
// appears, extract to a shared helper file). Mirrors ssrf.ts ranges
// but inlined to keep blast radius bounded. ---
function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0') return true;
  if (h === '::1' || h === '[::1]') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const oct = [m[1], m[2], m[3], m[4]].map((s) => Number(s));
  const [a, b] = oct as [number, number, number, number];
  if (a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// --- Auth header detection ---
const AUTH_HEADER_RE = /(auth|authorization|token|api[_-]?key|x[-_]api[-_]key|credential|secret)/i;

function findAuthHeader(
  headers?: Readonly<Record<string, string>>,
): { key: string; value: string } | undefined {
  if (!headers) return undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (AUTH_HEADER_RE.test(k)) return { key: k, value: v };
  }
  return undefined;
}

// --- Bearer / Basic value patterns ---
const WEAK_BEARER_RE =
  /^Bearer\s*$|^Bearer\s+(<[^>]*>|TODO|REPLACE|YOUR[-_]|your[-_]|xxx+|XXX+|placeholder|change[-_]?me|fix[-_]?me|fill[-_]?me|insert[-_])/i;
const BASIC_AUTH_RE = /^Basic\s+/i;

// --- Credential vendor signatures (high-confidence prefix patterns) ---
const CREDENTIAL_SIGS: ReadonlyArray<{ re: RegExp; vendor: string }> = [
  { re: /\bghp_[A-Za-z0-9]{36}\b/, vendor: 'GitHub PAT (classic)' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, vendor: 'GitHub PAT (fine-grained)' },
  { re: /\bgho_[A-Za-z0-9]{36}\b/, vendor: 'GitHub OAuth token' },
  { re: /\bghs_[A-Za-z0-9]{36}\b/, vendor: 'GitHub server-to-server token' },
  { re: /\bgls[ar]?[-_][A-Za-z0-9_-]{20,}\b/, vendor: 'GitLab PAT' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/, vendor: 'Anthropic API key' },
  { re: /\bsk-proj-[A-Za-z0-9_-]{30,}\b/, vendor: 'OpenAI project key' },
  { re: /\bsk-[A-Za-z0-9]{40,}\b/, vendor: 'OpenAI-style API key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, vendor: 'AWS access key ID' },
  { re: /\bASIA[0-9A-Z]{16}\b/, vendor: 'AWS STS temporary key ID' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, vendor: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, vendor: 'Google API key' },
];

// Legitimate env interpolation — passthrough, NOT a credential.
const ENV_INTERP_RE = /^(\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*)$/;
// Fixture marker — neutral, NOT a credential.
const FIXTURE_PLACEHOLDER_RE = /^redacted[-_]/i;

function isExemptValue(value: string): boolean {
  return ENV_INTERP_RE.test(value) || FIXTURE_PLACEHOLDER_RE.test(value);
}

interface CredentialMatch {
  vendor: string;
}

function findCredentialSignature(value: string): CredentialMatch | undefined {
  if (isExemptValue(value)) return undefined;
  for (const sig of CREDENTIAL_SIGS) {
    if (sig.re.test(value)) return { vendor: sig.vendor };
  }
  return undefined;
}

// Same value can appear in a Bearer-prefixed header; strip the prefix
// before signature matching so `Authorization: Bearer sk-…` is caught.
function stripBearerPrefix(value: string): string {
  return value.replace(/^Bearer\s+/i, '');
}

export type RuleId =
  | 'AUTH-GAP-URL-CREDENTIAL'
  | 'AUTH-GAP-NO-AUTHORIZATION'
  | 'AUTH-GAP-WEAK-BEARER'
  | 'AUTH-GAP-BASIC-AUTH-PLAINTEXT'
  | 'AUTH-GAP-PLAINTEXT-CREDENTIAL';

export interface RuleHit {
  ruleId: RuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  locatorSuffix: string;
}

export function evaluateHttpAuthGap(server: HttpServer): RuleHit[] {
  const hits: RuleHit[] = [];

  let parsed: URL;
  try {
    parsed = new URL(server.url);
  } catch {
    return hits;
  }

  // 1. URL-CREDENTIAL
  if (parsed.username !== '' || parsed.password !== '') {
    hits.push({
      ruleId: 'AUTH-GAP-URL-CREDENTIAL',
      severity: 'high',
      message: `URL contains userinfo (username${parsed.password !== '' ? '+password' : ''}) — credentials embedded in URL leak via access logs, HTTP referrers, redirect chains, and shell history`,
      locatorSuffix: 'url',
    });
  }

  const host = parsed.hostname.toLowerCase();
  const nonPublic = isNonPublicHost(host);
  const authHdr = findAuthHeader(server.headers);

  // 2. NO-AUTHORIZATION (only for public hosts)
  if (!authHdr && !nonPublic) {
    hits.push({
      ruleId: 'AUTH-GAP-NO-AUTHORIZATION',
      severity: 'medium',
      message: `http server targets public host "${host}" with no auth-like header (authorization / x-api-key / token / credential) — request will be unauthenticated and likely either rejected or, worse, served as anonymous`,
      locatorSuffix: 'headers',
    });
  }

  if (authHdr) {
    // 3. WEAK-BEARER
    if (WEAK_BEARER_RE.test(authHdr.value)) {
      hits.push({
        ruleId: 'AUTH-GAP-WEAK-BEARER',
        severity: 'high',
        message: `header "${authHdr.key}" carries Bearer token that is empty or placeholder-like — every request will fail auth, or worse, fall back to anonymous mode at the server`,
        locatorSuffix: `headers.${authHdr.key}`,
      });
    }

    // 4. BASIC-AUTH-PLAINTEXT
    if (BASIC_AUTH_RE.test(authHdr.value) && parsed.protocol === 'http:') {
      hits.push({
        ruleId: 'AUTH-GAP-BASIC-AUTH-PLAINTEXT',
        severity: 'high',
        message: `header "${authHdr.key}" uses HTTP Basic auth over plaintext http:// — base64 credential is trivially recoverable by any network-path observer`,
        locatorSuffix: `headers.${authHdr.key}`,
      });
    }
  }

  // 5. PLAINTEXT-CREDENTIAL in any header value
  if (server.headers) {
    for (const [k, v] of Object.entries(server.headers)) {
      const stripped = stripBearerPrefix(v);
      const match = findCredentialSignature(stripped);
      if (match) {
        hits.push({
          ruleId: 'AUTH-GAP-PLAINTEXT-CREDENTIAL',
          severity: 'high',
          message: `header "${k}" value matches credential signature (${match.vendor}) — replace with environment-variable interpolation ($\{ENV_VAR\}) or per-environment secret-manager reference`,
          locatorSuffix: `headers.${k}`,
        });
      }
    }
  }

  return hits;
}

export function evaluateStdioAuthGap(server: StdioServer): RuleHit[] {
  const hits: RuleHit[] = [];
  if (!server.env) return hits;
  for (const [k, v] of Object.entries(server.env)) {
    const match = findCredentialSignature(v);
    if (match) {
      hits.push({
        ruleId: 'AUTH-GAP-PLAINTEXT-CREDENTIAL',
        severity: 'high',
        message: `env["${k}"] value matches credential signature (${match.vendor}) — store in OS keychain or .env (gitignored) and reference via $\{${k}\} interpolation instead`,
        locatorSuffix: `env.${k}`,
      });
    }
  }
  return hits;
}

export function evaluateAuthGap(server: HttpServer | StdioServer): RuleHit[] {
  if ('url' in server) return evaluateHttpAuthGap(server);
  return evaluateStdioAuthGap(server);
}

export const authGapScanner: Scanner = {
  category: 'auth-gap',
  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const [serverName, server] of Object.entries(ctx.config.mcpServers)) {
      const hits = evaluateAuthGap(server);
      for (const hit of hits) {
        const locator = `mcpServers.${serverName}.${hit.locatorSuffix}`;
        findings.push({
          id: makeFindingId({
            category: 'auth-gap',
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
