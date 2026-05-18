import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import { readMcpConfig } from '../../src/io/parsers/index.js';
import {
  evaluateSsrfUrl,
  ssrfScanner,
  createScannerRegistry,
} from '../../src/scanners/index.js';
import type { McpConfig } from '../../src/scanners/mcp-schema/validator.js';

const FIXTURES = resolve(__dirname, '../fixtures/mcp');

function makeCfg(servers: McpConfig['mcpServers']): McpConfig {
  return { mcpServers: servers };
}

// T-19 (AC-001-1 SSRF category): the SSRF detector inspects every http
// server entry's URL and flags 4 known SSRF sinks — cloud metadata
// endpoints (critical), loopback hosts (high), private/CGNAT IPs (high),
// and dangerous non-http schemes (high). Stdio entries are out of scope.

describe('evaluateSsrfUrl — rule-level semantics', () => {
  describe('SSRF-CLOUD-METADATA (critical)', () => {
    it.each([
      'http://169.254.169.254/latest/meta-data/iam/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://metadata.goog/computeMetadata/v1/',
      'http://100.100.100.200/latest/meta-data/',
      'http://metadata.azure.com/metadata/instance',
    ])('flags %s', (url) => {
      const hit = evaluateSsrfUrl(url);
      expect(hit?.ruleId).toBe('SSRF-CLOUD-METADATA');
      expect(hit?.severity).toBe('critical');
    });
  });

  describe('SSRF-LOOPBACK (high)', () => {
    it.each([
      'http://localhost:8080/',
      'http://127.0.0.1/admin',
      'http://127.0.0.5/',
      'http://0.0.0.0:3000/',
      'http://[::1]:8080/',
    ])('flags %s', (url) => {
      const hit = evaluateSsrfUrl(url);
      expect(hit?.ruleId).toBe('SSRF-LOOPBACK');
      expect(hit?.severity).toBe('high');
    });
  });

  describe('SSRF-PRIVATE-IP (high)', () => {
    it.each([
      'http://10.0.0.5/api',
      'http://172.16.0.1/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://169.254.10.20/',  // link-local non-IMDS
      'http://100.64.0.1/',     // CGNAT
    ])('flags %s', (url) => {
      const hit = evaluateSsrfUrl(url);
      expect(hit?.ruleId).toBe('SSRF-PRIVATE-IP');
      expect(hit?.severity).toBe('high');
    });

    it.each([
      'http://172.15.0.1/',     // outside RFC1918 172.16-31
      'http://172.32.0.1/',
      'http://11.0.0.1/',
      'http://100.63.0.1/',     // outside CGNAT 100.64-127
    ])('does NOT flag adjacent-range %s', (url) => {
      expect(evaluateSsrfUrl(url)).toBeUndefined();
    });
  });

  describe('SSRF-NON-HTTP-SCHEME (high)', () => {
    it.each([
      'file:///etc/passwd',
      'gopher://evil.example.com/_HELLO',
      'dict://target.example.com:11211/stat',
      'ftp://internal.example.net/secret.txt',
    ])('flags %s', (url) => {
      const hit = evaluateSsrfUrl(url);
      expect(hit?.ruleId).toBe('SSRF-NON-HTTP-SCHEME');
      expect(hit?.severity).toBe('high');
    });
  });

  describe('benign URLs', () => {
    it.each([
      'https://api.example.com/v1/',
      'https://mcp.vendor-example.com/sse',
      'http://public.example.org/',
      'https://example.net:8443/connect',
    ])('does not flag %s', (url) => {
      expect(evaluateSsrfUrl(url)).toBeUndefined();
    });

    it('returns undefined on unparseable input rather than throwing', () => {
      expect(evaluateSsrfUrl('not a url at all')).toBeUndefined();
    });

    it('matches cloud-metadata host BEFORE private-ip range (precedence)', () => {
      // 169.254.169.254 is both link-local AND IMDS; cloud-metadata wins.
      const hit = evaluateSsrfUrl('http://169.254.169.254/');
      expect(hit?.ruleId).toBe('SSRF-CLOUD-METADATA');
    });
  });
});

describe('ssrfScanner.scan — Finding shape', () => {
  const target = '/abs/path/to/.mcp.json';

  it('emits a structured Finding for a flagged URL', () => {
    const findings = ssrfScanner.scan({
      config: makeCfg({ admin: { url: 'http://localhost:8080/admin' } }),
      target,
    });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.ruleId).toBe('SSRF-LOOPBACK');
    expect(f.severity).toBe('high');
    expect(f.source).toBe('static');
    expect(f.path).toBe(target);
    expect(f.id).toMatch(/^[0-9a-f]{16}$/);
    expect(f.details).toMatchObject({
      server: 'admin',
      url: 'http://localhost:8080/admin',
      locator: 'mcpServers.admin.url',
    });
  });

  it('produces a deterministic Finding id across runs', () => {
    const ctx = {
      config: makeCfg({ x: { url: 'http://10.0.0.5/' } }),
      target,
    };
    const a = ssrfScanner.scan(ctx)[0]!;
    const b = ssrfScanner.scan(ctx)[0]!;
    expect(a.id).toBe(b.id);
  });

  it('changes Finding id when target path differs', () => {
    const cfg = makeCfg({ x: { url: 'http://10.0.0.5/' } });
    const a = ssrfScanner.scan({ config: cfg, target: '/abs/a.mcp.json' })[0]!;
    const b = ssrfScanner.scan({ config: cfg, target: '/abs/b.mcp.json' })[0]!;
    expect(a.id).not.toBe(b.id);
  });

  it('skips stdio entries (no url field)', () => {
    expect(
      ssrfScanner.scan({
        config: makeCfg({
          fs: { command: 'node', args: ['fs.js'] },
        }),
        target,
      }),
    ).toEqual([]);
  });

  it('flags multiple offending servers in a single config', () => {
    const findings = ssrfScanner.scan({
      config: makeCfg({
        imds: { url: 'http://169.254.169.254/' },
        local: { url: 'http://127.0.0.1/' },
        intra: { url: 'http://192.168.1.1/' },
        safe: { url: 'https://api.example.com/' },
      }),
      target,
    });
    expect(findings.map((f) => f.ruleId).sort()).toEqual([
      'SSRF-CLOUD-METADATA',
      'SSRF-LOOPBACK',
      'SSRF-PRIVATE-IP',
    ]);
  });
});

describe('ssrfScanner.scan — fixture-driven (T-14 parser path)', () => {
  describe('positive fixtures (must flag ≥1 finding)', () => {
    it.each([
      ['ssrf-positive-cloud-metadata.json', 'SSRF-CLOUD-METADATA', 'critical'],
      ['ssrf-positive-loopback.json', 'SSRF-LOOPBACK', 'high'],
      ['ssrf-positive-private-ip.json', 'SSRF-PRIVATE-IP', 'high'],
    ] as const)('%s → %s (%s)', async (name, ruleId, severity) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      const findings = ssrfScanner.scan({ config, target: path });
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.ruleId).toBe(ruleId);
      expect(findings[0]!.severity).toBe(severity);
      expect(findings[0]!.path).toBe(path);
    });
  });

  describe('negative fixtures (must flag zero SSRF findings)', () => {
    it.each([
      'ssrf-negative-public-https.json',
      'ssrf-negative-stdio-only.json',
      'ssrf-negative-corporate-https.json',
    ])('%s', async (name) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      expect(ssrfScanner.scan({ config, target: path })).toEqual([]);
    });
  });
});

describe('createScannerRegistry — SSRF slot wired', () => {
  it('places ssrfScanner in slot 0 (canonical category order)', () => {
    const registry = createScannerRegistry();
    expect(registry[0]!.category).toBe('ssrf');
    expect(registry[0]).toBe(ssrfScanner);
  });

  it('remaining slots still stubs returning []', () => {
    const ctx = {
      config: makeCfg({ x: { url: 'http://169.254.169.254/' } }),
      target: '/abs/.mcp.json',
    };
    const registry = createScannerRegistry();
    for (let i = 1; i < registry.length; i++) {
      expect(registry[i]!.scan(ctx)).toEqual([]);
    }
  });
});
