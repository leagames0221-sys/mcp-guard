// T-19 (AC-001-1): SSRF detector. Examines every http server entry in
// the validated McpConfig and flags URLs that target known SSRF sinks:
//
//   SSRF-CLOUD-METADATA  critical  cloud instance metadata endpoints
//                                  (AWS IMDS, GCP, Azure, Alibaba) —
//                                  primary credential exfiltration vector
//   SSRF-LOOPBACK        high      127.0.0.0/8, localhost, 0.0.0.0, ::1 —
//                                  reaches any service on the host's
//                                  internal interfaces
//   SSRF-PRIVATE-IP      high      RFC1918 + link-local 169.254/16 —
//                                  reaches internal-network services
//   SSRF-NON-HTTP-SCHEME high      file://, gopher://, dict://, ftp:// —
//                                  classic SSRF primitives for local-file
//                                  read or protocol-smuggled pivots
//
// Stdio servers have no `url` field and are out of scope for SSRF (the
// command-injection detector covers them instead). Reference:
// OWASP Top 10 2021 A10:SSRF + cloud IMDS incident corpus.

import type { Finding } from '../io/emitters/json.js';
import { makeFindingId, type ScanContext, type Scanner } from './types.js';

const CLOUD_METADATA_HOSTS: ReadonlySet<string> = new Set([
  '169.254.169.254',           // AWS / DigitalOcean / OpenStack
  'fd00:ec2::254',             // AWS IMDS IPv6
  'metadata.google.internal',  // GCP
  'metadata.goog',             // GCP alias
  '100.100.100.200',           // Alibaba Cloud
  'metadata.azure.com',        // Azure
]);

const DANGEROUS_SCHEMES: ReadonlySet<string> = new Set([
  'file:',
  'gopher:',
  'dict:',
  'ftp:',
  'ftps:',
]);

interface RuleHit {
  ruleId: 'SSRF-CLOUD-METADATA' | 'SSRF-LOOPBACK' | 'SSRF-PRIVATE-IP' | 'SSRF-NON-HTTP-SCHEME';
  severity: 'critical' | 'high';
  message: string;
}

function isIpv4Octets(host: string): number[] | undefined {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return undefined;
  const oct = [m[1], m[2], m[3], m[4]].map((s) => Number(s));
  if (oct.some((o) => !Number.isFinite(o) || o < 0 || o > 255)) return undefined;
  return oct as number[];
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host === '0.0.0.0') return true;
  if (host === '[::1]' || host === '::1') return true;
  const oct = isIpv4Octets(host);
  return oct !== undefined && oct[0] === 127;
}

function isPrivateIpv4(host: string): boolean {
  const oct = isIpv4Octets(host);
  if (!oct) return false;
  const [a, b] = oct as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Link-local 169.254/16 — IMDS subset is matched first via the
  // cloud-metadata host set, so anything else in 169.254/16 lands here.
  if (a === 169 && b === 254) return true;
  // Carrier-grade NAT 100.64.0.0/10 also commonly internal-only.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function evaluateSsrfUrl(rawUrl: string): RuleHit | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // The schema validator (T-09) already accepted this string as a URL;
    // any residual parse failure is treated as no-finding to avoid noise.
    return undefined;
  }

  if (DANGEROUS_SCHEMES.has(parsed.protocol)) {
    return {
      ruleId: 'SSRF-NON-HTTP-SCHEME',
      severity: 'high',
      message: `URL uses ${parsed.protocol.replace(/:$/, '')}:// scheme — classic SSRF primitive (local file read, protocol smuggling)`,
    };
  }

  const host = parsed.hostname.toLowerCase();

  if (CLOUD_METADATA_HOSTS.has(host)) {
    return {
      ruleId: 'SSRF-CLOUD-METADATA',
      severity: 'critical',
      message: `URL targets cloud instance metadata endpoint "${host}" — primary credential exfiltration vector (AWS IMDS / GCP / Azure / Alibaba)`,
    };
  }

  if (isLoopbackHost(host)) {
    return {
      ruleId: 'SSRF-LOOPBACK',
      severity: 'high',
      message: `URL targets loopback host "${host}" — exposes any service bound to the local interface`,
    };
  }

  if (isPrivateIpv4(host)) {
    return {
      ruleId: 'SSRF-PRIVATE-IP',
      severity: 'high',
      message: `URL targets private IP "${host}" (RFC1918 / link-local / CGNAT) — exposes internal-network services`,
    };
  }

  return undefined;
}

export const ssrfScanner: Scanner = {
  category: 'ssrf',
  scan(ctx: ScanContext): Finding[] {
    const findings: Finding[] = [];
    for (const [serverName, server] of Object.entries(ctx.config.mcpServers)) {
      if (!('url' in server)) continue; // stdio entries are out of scope
      const hit = evaluateSsrfUrl(server.url);
      if (!hit) continue;
      const locator = `mcpServers.${serverName}.url`;
      findings.push({
        id: makeFindingId({
          category: 'ssrf',
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
          url: server.url,
          locator,
        },
      });
    }
    return findings;
  },
};
