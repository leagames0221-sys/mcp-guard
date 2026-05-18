import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import { readMcpConfig } from '../../src/io/parsers/index.js';
import {
  authGapScanner,
  createScannerRegistry,
  evaluateAuthGap,
  evaluateHttpAuthGap,
  evaluateStdioAuthGap,
} from '../../src/scanners/index.js';
import type { McpConfig } from '../../src/scanners/mcp-schema/validator.js';

const FIXTURES = resolve(__dirname, '../fixtures/mcp');

function makeCfg(servers: McpConfig['mcpServers']): McpConfig {
  return { mcpServers: servers };
}

// T-21 (AC-001-1 auth-gap category): the scanner inspects http
// (url + headers) AND stdio (env) for 5 authentication failure modes.
// Each rule is independently actionable and emits its own Finding.

describe('evaluateHttpAuthGap — rule-level semantics', () => {
  describe('AUTH-GAP-URL-CREDENTIAL (high)', () => {
    it.each([
      'https://admin:pw@host.example.com/',
      'https://user:hunter2@api.example.net/v1/',
      'http://only-user@host.example.com/',
    ])('flags %s', (url) => {
      const hits = evaluateHttpAuthGap({ url });
      expect(hits.some((h) => h.ruleId === 'AUTH-GAP-URL-CREDENTIAL')).toBe(true);
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-URL-CREDENTIAL')!.severity,
      ).toBe('high');
    });

    it('does NOT flag URL without userinfo', () => {
      const hits = evaluateHttpAuthGap({
        url: 'https://api.example.com/v1/',
        headers: { authorization: 'Bearer redacted-fixture-token' },
      });
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-URL-CREDENTIAL'),
      ).toBeUndefined();
    });
  });

  describe('AUTH-GAP-NO-AUTHORIZATION (medium)', () => {
    it.each([
      'https://api.example.com/v1/',
      'https://mcp.vendor.example.net/sse',
      'http://api.public.example.org/',
    ])('flags public host %s without auth header', (url) => {
      const hits = evaluateHttpAuthGap({ url });
      expect(hits.some((h) => h.ruleId === 'AUTH-GAP-NO-AUTHORIZATION')).toBe(true);
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-NO-AUTHORIZATION')!.severity,
      ).toBe('medium');
    });

    it.each([
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://127.0.0.5/',
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/',
      'http://100.64.0.1/',
    ])('does NOT flag non-public host %s', (url) => {
      const hits = evaluateHttpAuthGap({ url });
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-NO-AUTHORIZATION'),
      ).toBeUndefined();
    });

    it('does NOT flag public host when any auth-like header is present', () => {
      for (const headerKey of [
        'authorization',
        'Authorization',
        'x-api-key',
        'X-API-Key',
        'x-auth-token',
        'token',
        'api-key',
      ]) {
        const hits = evaluateHttpAuthGap({
          url: 'https://api.example.com/',
          headers: { [headerKey]: 'redacted-fixture-token' },
        });
        expect(
          hits.find((h) => h.ruleId === 'AUTH-GAP-NO-AUTHORIZATION'),
        ).toBeUndefined();
      }
    });
  });

  describe('AUTH-GAP-WEAK-BEARER (high)', () => {
    it.each([
      'Bearer',
      'Bearer ',
      'Bearer <YOUR_TOKEN>',
      'Bearer TODO',
      'Bearer REPLACE_ME',
      'Bearer YOUR_TOKEN',
      'Bearer your_api_key',
      'Bearer xxx',
      'Bearer XXXXXX',
      'Bearer placeholder',
      'Bearer change-me',
      'Bearer change_me',
      'Bearer fix-me',
    ])('flags authorization=%s', (value) => {
      const hits = evaluateHttpAuthGap({
        url: 'https://api.example.com/',
        headers: { authorization: value },
      });
      const hit = hits.find((h) => h.ruleId === 'AUTH-GAP-WEAK-BEARER');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
    });

    it.each([
      'Bearer redacted-fixture-token',
      'Bearer ${GITHUB_TOKEN}',
      'Bearer ghp_FixturePlaceholder0123456789ABCDEFGH',
    ])('does NOT flag legitimate Bearer values: %s', (value) => {
      const hits = evaluateHttpAuthGap({
        url: 'https://api.example.com/',
        headers: { authorization: value },
      });
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-WEAK-BEARER'),
      ).toBeUndefined();
    });
  });

  describe('AUTH-GAP-BASIC-AUTH-PLAINTEXT (high)', () => {
    it('flags Basic auth over http://', () => {
      const hits = evaluateHttpAuthGap({
        url: 'http://api.example.com/',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      const hit = hits.find((h) => h.ruleId === 'AUTH-GAP-BASIC-AUTH-PLAINTEXT');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
    });

    it('does NOT flag Basic auth over https://', () => {
      const hits = evaluateHttpAuthGap({
        url: 'https://api.example.com/',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(
        hits.find((h) => h.ruleId === 'AUTH-GAP-BASIC-AUTH-PLAINTEXT'),
      ).toBeUndefined();
    });
  });

  describe('AUTH-GAP-PLAINTEXT-CREDENTIAL in headers (high)', () => {
    it.each([
      ['authorization', 'Bearer ghp_FixturePlaceholder0123456789ABCDEFGH', 'GitHub PAT (classic)'],
      ['x-api-key', 'sk-ant-FixturePlaceholderForAnthropic0123456789ABCDEF', 'Anthropic API key'],
      ['authorization', 'Bearer sk-FixturePlaceholderForOpenAI0123456789ABCDEFGHIJ', 'OpenAI-style API key'],
      ['x-aws-key', 'AKIAEXAMPLEFIXTUREID', 'AWS access key ID'],
      ['x-slack-token', 'xoxb-FixturePlaceholder0123456789', 'Slack token'],
    ])('flags header %s value (vendor=%s)', (headerKey, value, vendor) => {
      const hits = evaluateHttpAuthGap({
        url: 'https://api.example.com/',
        headers: { [headerKey]: value },
      });
      const hit = hits.find((h) => h.ruleId === 'AUTH-GAP-PLAINTEXT-CREDENTIAL');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
      expect(hit!.message).toContain(vendor);
    });

    it('does NOT flag env-interp + redacted-* in headers', () => {
      for (const v of ['${GITHUB_TOKEN}', '$GITHUB_TOKEN', 'redacted-fixture-token']) {
        const hits = evaluateHttpAuthGap({
          url: 'https://api.example.com/',
          headers: { authorization: `Bearer ${v}` },
        });
        expect(
          hits.find((h) => h.ruleId === 'AUTH-GAP-PLAINTEXT-CREDENTIAL'),
        ).toBeUndefined();
      }
    });
  });
});

describe('evaluateStdioAuthGap — PLAINTEXT-CREDENTIAL in env', () => {
  it.each([
    ['GITHUB_TOKEN', 'ghp_FixturePlaceholder0123456789ABCDEFGH', 'GitHub PAT (classic)'],
    ['ANTHROPIC_API_KEY', 'sk-ant-FixturePlaceholderForAnthropic0123456789ABCDEF', 'Anthropic API key'],
    ['OPENAI_API_KEY', 'sk-proj-FixturePlaceholderOpenAIProject01234567890abc', 'OpenAI project key'],
    ['AWS_ACCESS_KEY_ID', 'AKIAEXAMPLEFIXTUREID', 'AWS access key ID'],
    ['SLACK_TOKEN', 'xoxp-FixturePlaceholder0123456789', 'Slack token'],
    ['GOOGLE_API_KEY', 'AIzaFixturePlaceholderGoogleKey01234567', 'Google API key'],
  ])('flags env %s = %s (vendor=%s)', (envKey, value, vendor) => {
    const hits = evaluateStdioAuthGap({
      command: 'npx',
      args: ['-y', '@org/mcp-tool'],
      env: { [envKey]: value },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ruleId).toBe('AUTH-GAP-PLAINTEXT-CREDENTIAL');
    expect(hits[0]!.message).toContain(vendor);
  });

  it('does NOT flag env-interp values', () => {
    expect(
      evaluateStdioAuthGap({
        command: 'npx',
        args: ['x'],
        env: {
          GITHUB_TOKEN: '${GITHUB_TOKEN}',
          OPENAI_API_KEY: '$OPENAI_API_KEY',
          NODE_ENV: 'production',
        },
      }),
    ).toEqual([]);
  });

  it('does NOT flag redacted-* fixture markers', () => {
    expect(
      evaluateStdioAuthGap({
        command: 'npx',
        args: ['x'],
        env: { ANTHROPIC_API_KEY: 'redacted-fixture-key' },
      }),
    ).toEqual([]);
  });

  it('returns [] when env is absent', () => {
    expect(
      evaluateStdioAuthGap({ command: 'node', args: ['x.js'] }),
    ).toEqual([]);
  });
});

describe('evaluateAuthGap — dispatch', () => {
  it('routes http server to evaluateHttpAuthGap', () => {
    const hits = evaluateAuthGap({ url: 'https://api.example.com/' });
    expect(hits.some((h) => h.ruleId === 'AUTH-GAP-NO-AUTHORIZATION')).toBe(true);
  });

  it('routes stdio server to evaluateStdioAuthGap', () => {
    const hits = evaluateAuthGap({
      command: 'npx',
      args: ['x'],
      env: { GITHUB_TOKEN: 'ghp_FixturePlaceholder0123456789ABCDEFGH' },
    });
    expect(hits.some((h) => h.ruleId === 'AUTH-GAP-PLAINTEXT-CREDENTIAL')).toBe(true);
  });
});

describe('authGapScanner.scan — Finding shape', () => {
  const target = '/abs/path/.mcp.json';

  it('emits structured Finding for http URL-CREDENTIAL hit', () => {
    const findings = authGapScanner.scan({
      config: makeCfg({
        leaked: { url: 'https://user:pw@host.example.com/' },
      }),
      target,
    });
    const f = findings.find((x) => x.ruleId === 'AUTH-GAP-URL-CREDENTIAL')!;
    expect(f.severity).toBe('high');
    expect(f.source).toBe('static');
    expect(f.path).toBe(target);
    expect(f.id).toMatch(/^[0-9a-f]{16}$/);
    expect(f.details).toMatchObject({
      server: 'leaked',
      locator: 'mcpServers.leaked.url',
    });
  });

  it('encodes header key in locator', () => {
    const findings = authGapScanner.scan({
      config: makeCfg({
        api: {
          url: 'http://api.example.com/',
          headers: { authorization: 'Basic dXNlcjpwYXNz' },
        },
      }),
      target,
    });
    const f = findings.find((x) => x.ruleId === 'AUTH-GAP-BASIC-AUTH-PLAINTEXT')!;
    expect(f.details!['locator']).toBe('mcpServers.api.headers.authorization');
  });

  it('encodes env key in locator', () => {
    const findings = authGapScanner.scan({
      config: makeCfg({
        gh: {
          command: 'npx',
          args: ['x'],
          env: { GITHUB_TOKEN: 'ghp_FixturePlaceholder0123456789ABCDEFGH' },
        },
      }),
      target,
    });
    const f = findings.find((x) => x.ruleId === 'AUTH-GAP-PLAINTEXT-CREDENTIAL')!;
    expect(f.details!['locator']).toBe('mcpServers.gh.env.GITHUB_TOKEN');
  });

  it('produces deterministic Finding ids across runs', () => {
    const ctx = {
      config: makeCfg({ s: { url: 'https://api.example.com/' } }),
      target,
    };
    const a = authGapScanner.scan(ctx);
    const b = authGapScanner.scan(ctx);
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });

  it('flags every offending server in a multi-server config', () => {
    const findings = authGapScanner.scan({
      config: makeCfg({
        leak: { url: 'https://u:p@host.example.com/' },
        noauth: { url: 'https://api.example.com/' },
        plain: {
          command: 'npx',
          args: ['x'],
          env: { GITHUB_TOKEN: 'ghp_FixturePlaceholder0123456789ABCDEFGH' },
        },
        ok: {
          url: 'https://other.example.net/',
          headers: { authorization: 'Bearer redacted-fixture-token' },
        },
      }),
      target,
    });
    const servers = new Set(findings.map((f) => f.details!['server']));
    expect(servers.has('leak')).toBe(true);
    expect(servers.has('noauth')).toBe(true);
    expect(servers.has('plain')).toBe(true);
    expect(servers.has('ok')).toBe(false);
  });
});

describe('authGapScanner.scan — fixture-driven (T-14 parser path)', () => {
  describe('positive fixtures (must flag ≥1 expected rule)', () => {
    it.each([
      ['auth-gap-positive-no-auth.json', 'AUTH-GAP-NO-AUTHORIZATION'],
      ['auth-gap-positive-url-credential.json', 'AUTH-GAP-URL-CREDENTIAL'],
      ['auth-gap-positive-plaintext-credential.json', 'AUTH-GAP-PLAINTEXT-CREDENTIAL'],
    ] as const)('%s → flags %s', async (name, expectedRuleId) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      const findings = authGapScanner.scan({ config, target: path });
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.ruleId === expectedRuleId)).toBe(true);
      for (const f of findings) {
        expect(f.path).toBe(path);
        expect(f.source).toBe('static');
      }
    });
  });

  describe('negative fixtures (must flag zero auth-gap findings)', () => {
    it.each([
      'auth-gap-negative-with-auth.json',
      'auth-gap-negative-loopback.json',
      'auth-gap-negative-stdio-interp.json',
    ])('%s', async (name) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      expect(authGapScanner.scan({ config, target: path })).toEqual([]);
    });
  });
});

describe('createScannerRegistry — auth-gap slot wired', () => {
  it('places authGapScanner in slot 2 (canonical order)', () => {
    const registry = createScannerRegistry();
    expect(registry[2]!.category).toBe('auth-gap');
    expect(registry[2]).toBe(authGapScanner);
  });

  it('supply-chain-risk (slot 3) is still a stub', () => {
    const ctx = {
      config: makeCfg({
        risky: { url: 'https://api.example.com/' },
      }),
      target: '/abs/.mcp.json',
    };
    const registry = createScannerRegistry();
    expect(registry[3]!.scan(ctx)).toEqual([]);
  });
});
