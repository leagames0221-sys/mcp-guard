// Per-ruleId remediation templates. Each ruleId emitted by L4 scanners
// (T-19..T-22) gets a tailored `suggested_patch` body + curated
// `references[]`. The template body uses plain text (no code fences
// or markdown) so it survives both the JSON emitter and the console
// emitter without re-escaping.
//
// Coverage invariant (asserted in tests): every ruleId that any
// scanner can emit MUST appear here. The remediation index exposes a
// guard function so callers can detect missing rules at runtime, but
// the test catches drift at compile-touch time.

import type { ScannerCategory } from '../scanners/types.js';
import type { RemediationTemplate } from './types.js';

// Reference URLs are stable, public, and cited by the corresponding
// detection rule's documentation. Keeping them in one place prevents
// divergence as the OWASP / MITRE / CWE pages move.
const REF = {
  OWASP_LLM03: 'https://genai.owasp.org/llm-top-10/',
  OWASP_TOP10_2021_A10: 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
  OWASP_TOP10_2021_A03: 'https://owasp.org/Top10/A03_2021-Injection/',
  OWASP_TOP10_2021_A07: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
  CWE_918_SSRF: 'https://cwe.mitre.org/data/definitions/918.html',
  CWE_77_CMDINJ: 'https://cwe.mitre.org/data/definitions/77.html',
  CWE_94_CODE_INJ: 'https://cwe.mitre.org/data/definitions/94.html',
  CWE_287_AUTH: 'https://cwe.mitre.org/data/definitions/287.html',
  CWE_798_HARDCODED: 'https://cwe.mitre.org/data/definitions/798.html',
  CWE_319_CLEARTEXT: 'https://cwe.mitre.org/data/definitions/319.html',
  CWE_1395_DEP_HOST: 'https://cwe.mitre.org/data/definitions/1395.html',
  CWE_1357_RELY_3P: 'https://cwe.mitre.org/data/definitions/1357.html',
  AWS_IMDS: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html',
  RFC_5735_PRIVATE_IPV4: 'https://datatracker.ietf.org/doc/html/rfc5735',
  MCP_SECURITY: 'https://modelcontextprotocol.io/docs/specification',
} as const;

export const REMEDIATION_TEMPLATES: Readonly<Record<string, RemediationTemplate>> = Object.freeze({
  // ── SSRF (4 rules) ──────────────────────────────────────────────
  'SSRF-CLOUD-METADATA': {
    category: 'ssrf' as ScannerCategory,
    suggested_patch:
      'Reject requests to cloud instance-metadata IPs (169.254.169.254 / fd00:ec2::254 / metadata.google.internal). For AWS, require IMDSv2 with a session token and a hop limit of 1; never proxy these endpoints from an MCP server.',
    references: [REF.AWS_IMDS, REF.CWE_918_SSRF, REF.OWASP_TOP10_2021_A10],
  },
  'SSRF-LOOPBACK': {
    category: 'ssrf' as ScannerCategory,
    suggested_patch:
      'Block requests to loopback (127.0.0.0/8 / ::1 / localhost) and the wildcard 0.0.0.0. If the MCP server legitimately needs a sibling localhost service, encode the explicit host:port in configuration rather than letting the URL flow through user-influenced input.',
    references: [REF.CWE_918_SSRF, REF.OWASP_TOP10_2021_A10],
  },
  'SSRF-PRIVATE-IP': {
    category: 'ssrf' as ScannerCategory,
    suggested_patch:
      'Resolve the hostname before connecting and reject any answer that falls in RFC 1918 / RFC 4193 / link-local / carrier-grade NAT ranges. Re-check after DNS resolution to defeat rebind attacks.',
    references: [REF.RFC_5735_PRIVATE_IPV4, REF.CWE_918_SSRF, REF.OWASP_TOP10_2021_A10],
  },
  'SSRF-NON-HTTP-SCHEME': {
    category: 'ssrf' as ScannerCategory,
    suggested_patch:
      'Whitelist the URL scheme to https (and http for explicit internal targets). Reject file:, gopher:, ftp:, dict:, and data: at the parser, not later in the request stack.',
    references: [REF.CWE_918_SSRF, REF.OWASP_TOP10_2021_A10],
  },

  // ── Command Injection (5 rules) ────────────────────────────────
  'CMDINJ-SHELL-INTERPRETER': {
    category: 'command-injection' as ScannerCategory,
    suggested_patch:
      'Replace shell-wrapped invocations (sh -c / bash -c / cmd /c / powershell -Command) with a direct argv array. Pass arguments as separate elements so the kernel exec path bypasses the shell entirely.',
    references: [REF.CWE_77_CMDINJ, REF.OWASP_TOP10_2021_A03],
  },
  'CMDINJ-SHELL-METACHAR': {
    category: 'command-injection' as ScannerCategory,
    suggested_patch:
      'Remove shell metacharacters (; | & $ ` < > newline) from the command + args. If the operator intended a pipeline, restructure as two argv invocations connected by an in-process stream rather than a shell pipe.',
    references: [REF.CWE_77_CMDINJ, REF.OWASP_TOP10_2021_A03],
  },
  'CMDINJ-INTERPRETER-EVAL': {
    category: 'command-injection' as ScannerCategory,
    suggested_patch:
      'Drop -e / -c / --eval flags that hand a string to the language interpreter for direct evaluation. Move the logic into a versioned script file the MCP server invokes by path.',
    references: [REF.CWE_94_CODE_INJ, REF.OWASP_TOP10_2021_A03],
  },
  'CMDINJ-ENV-INJECTION': {
    category: 'command-injection' as ScannerCategory,
    suggested_patch:
      'Sanitize env var names + values. Names should match [A-Z_][A-Z0-9_]*. Values must not contain newlines (CRLF lets a value start a new line that downstream shells could parse).',
    references: [REF.CWE_77_CMDINJ, REF.OWASP_TOP10_2021_A03],
  },
  'CMDINJ-CURL-PIPE-SHELL': {
    category: 'command-injection' as ScannerCategory,
    suggested_patch:
      'Replace curl ... | sh / wget ... | bash patterns with a fetch-verify-execute split: download to a temp file, verify a published checksum or signature, then execute the local file. Never stream remote content directly into an interpreter.',
    references: [REF.CWE_94_CODE_INJ, REF.OWASP_TOP10_2021_A03],
  },

  // ── Auth Gap (5 rules) ─────────────────────────────────────────
  'AUTH-GAP-URL-CREDENTIAL': {
    category: 'auth-gap' as ScannerCategory,
    suggested_patch:
      'Strip the userinfo segment from the URL. Move credentials to a request header (Authorization / x-api-key) or an environment variable read at connect time. Userinfo leaks through access logs, referrers, and shell history.',
    references: [REF.CWE_319_CLEARTEXT, REF.OWASP_TOP10_2021_A07],
  },
  'AUTH-GAP-NO-AUTHORIZATION': {
    category: 'auth-gap' as ScannerCategory,
    suggested_patch:
      'Add an Authorization header (Bearer + short-lived token) or x-api-key on the server entry. For public hosts, anonymous access lets anyone enumerate the MCP server\'s tool surface.',
    references: [REF.CWE_287_AUTH, REF.OWASP_TOP10_2021_A07],
  },
  'AUTH-GAP-WEAK-BEARER': {
    category: 'auth-gap' as ScannerCategory,
    suggested_patch:
      'Replace placeholder / TODO Bearer token bodies with a real opaque value sourced from a secret manager or env var. Placeholders typically fall back to anonymous on the wire.',
    references: [REF.CWE_287_AUTH, REF.OWASP_TOP10_2021_A07],
  },
  'AUTH-GAP-BASIC-AUTH-PLAINTEXT': {
    category: 'auth-gap' as ScannerCategory,
    suggested_patch:
      'Upgrade the URL scheme to https (so TLS wraps the Basic credential), or switch to Bearer / token-based auth. Basic over http base64-encodes credentials in clear view of any path-on-wire observer.',
    references: [REF.CWE_319_CLEARTEXT, REF.OWASP_TOP10_2021_A07],
  },
  'AUTH-GAP-PLAINTEXT-CREDENTIAL': {
    category: 'auth-gap' as ScannerCategory,
    suggested_patch:
      'Move the literal credential out of the config file. Reference it via env interpolation (${VAR}) or a secret manager. Then rotate the leaked value: assume an attacker who reads the repo has it.',
    references: [REF.CWE_798_HARDCODED, REF.OWASP_TOP10_2021_A07],
  },

  // ── Supply Chain (4 rules) ─────────────────────────────────────
  'SUPPLY-CHAIN-UNSCOPED-PACKAGE': {
    category: 'supply-chain-risk' as ScannerCategory,
    suggested_patch:
      'Pin the package to a known publisher\'s scope (e.g. @your-org/pkg or @vendor/pkg). Unscoped names share the global namespace with typosquats; @scope/name limits the squat surface to one tenant.',
    references: [REF.CWE_1357_RELY_3P, REF.OWASP_LLM03],
  },
  'SUPPLY-CHAIN-UNPINNED-VERSION': {
    category: 'supply-chain-risk' as ScannerCategory,
    suggested_patch:
      'Pin to a specific semver (@1.2.3) and audit on upgrade. @latest re-resolves at every invocation, so a malicious release ships to every downstream MCP host as soon as it lands on the registry.',
    references: [REF.CWE_1357_RELY_3P, REF.OWASP_LLM03],
  },
  'SUPPLY-CHAIN-EPHEMERAL-HOST': {
    category: 'supply-chain-risk' as ScannerCategory,
    suggested_patch:
      'Point the MCP server URL to a stable production host. Preview / tunnel domains (vercel.app, ngrok, gitpod) belong in development MCP profiles, not in the deployable .mcp.json an MCP client will trust at runtime.',
    references: [REF.CWE_1395_DEP_HOST, REF.MCP_SECURITY],
  },
  'SUPPLY-CHAIN-RAW-CONTENT': {
    category: 'supply-chain-risk' as ScannerCategory,
    suggested_patch:
      'Pull code from a release artifact (signed tarball / OCI image / signed binary) rather than a raw-content URL. Raw-content endpoints are mutable per-commit and bypass the registry\'s integrity surface.',
    references: [REF.CWE_1395_DEP_HOST, REF.OWASP_LLM03],
  },
});

export function hasTemplate(ruleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(REMEDIATION_TEMPLATES, ruleId);
}

export function templateFor(ruleId: string): RemediationTemplate | undefined {
  return REMEDIATION_TEMPLATES[ruleId];
}
