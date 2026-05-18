import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import { readMcpConfig } from '../../src/io/parsers/index.js';
import {
  createScannerRegistry,
  evaluateHttpSupplyChain,
  evaluateStdioSupplyChain,
  extractPackageSpec,
  parsePackageSpec,
  supplyChainScanner,
} from '../../src/scanners/index.js';
import type { McpConfig } from '../../src/scanners/mcp-schema/validator.js';

const FIXTURES = resolve(__dirname, '../fixtures/mcp');

function makeCfg(servers: McpConfig['mcpServers']): McpConfig {
  return { mcpServers: servers };
}

// T-22 (AC-001-1 supply-chain-risk category): the scanner inspects
// stdio invocations for package-executor patterns (npx/bunx/uvx/
// `pnpm dlx`) and http URLs for ephemeral / raw-content hosts.

describe('extractPackageSpec — argv positional resolver', () => {
  it.each([
    ['npx', ['pkg'], 'pkg'],
    ['npx', ['-y', 'pkg'], 'pkg'],
    ['npx', ['-y', '@scope/pkg@1.2.3'], '@scope/pkg@1.2.3'],
    ['npx', ['-p', 'pkg', 'cmd'], 'pkg'],
    ['npx', ['--package', 'pkg', 'cmd'], 'pkg'],
    ['npx', ['--package=pkg', 'cmd'], 'pkg'],
    ['npx', ['--', 'pkg'], 'pkg'],
    ['bunx', ['-y', 'pkg'], 'pkg'],
    ['uvx', ['pkg'], 'pkg'],
    ['uvx', ['-p', '3.11', 'mcp-server-fetch'], '3.11'],
    ['pnpm', ['dlx', 'pkg'], 'pkg'],
    ['pnpm', ['dlx', '-y', '@scope/pkg'], '@scope/pkg'],
  ] as const)('extracts spec from %s %j → %s', (cmd, args, expected) => {
    expect(extractPackageSpec(cmd, args)).toBe(expected);
  });

  it.each([
    ['node', ['x.js']],
    ['python', ['run.py']],
    ['pnpm', ['install']],
    ['npx', []],
    ['npx', ['-y']],
  ] as const)('returns undefined for non-executor %s %j', (cmd, args) => {
    expect(extractPackageSpec(cmd, args)).toBeUndefined();
  });
});

describe('parsePackageSpec — name + version split', () => {
  it.each([
    ['pkg', { name: 'pkg' }],
    ['pkg@1.2.3', { name: 'pkg', version: '1.2.3' }],
    ['pkg@latest', { name: 'pkg', version: 'latest' }],
    ['@scope/pkg', { name: '@scope/pkg' }],
    ['@scope/pkg@1.2.3', { name: '@scope/pkg', version: '1.2.3' }],
    ['@scope/pkg@^2.0.0', { name: '@scope/pkg', version: '^2.0.0' }],
    ['@scope/pkg@latest', { name: '@scope/pkg', version: 'latest' }],
  ] as const)('parses %s → %o', (spec, expected) => {
    expect(parsePackageSpec(spec)).toEqual(expected);
  });
});

describe('evaluateStdioSupplyChain — rule-level semantics', () => {
  describe('SUPPLY-CHAIN-UNSCOPED-PACKAGE (medium, npm-ecosystem only)', () => {
    it.each([
      ['npx', ['-y', 'unscoped-pkg']],
      ['bunx', ['unscoped-pkg']],
      ['pnpm', ['dlx', 'unscoped-pkg']],
    ] as const)('flags %s %j', (cmd, args) => {
      const hits = evaluateStdioSupplyChain(cmd, args);
      const hit = hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-UNSCOPED-PACKAGE');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('medium');
    });

    it('does NOT flag scoped packages', () => {
      const hits = evaluateStdioSupplyChain('npx', ['-y', '@scope/pkg@1.0.0']);
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-UNSCOPED-PACKAGE'),
      ).toBeUndefined();
    });

    it('does NOT flag PyPI (uvx) targets — PyPI has no scoping', () => {
      const hits = evaluateStdioSupplyChain('uvx', ['mcp-server-fetch@0.5.1']);
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-UNSCOPED-PACKAGE'),
      ).toBeUndefined();
    });
  });

  describe('SUPPLY-CHAIN-UNPINNED-VERSION (medium)', () => {
    it.each([
      ['npx', ['-y', 'pkg']],
      ['npx', ['-y', '@scope/pkg']],
      ['bunx', ['pkg@latest']],
      ['uvx', ['pkg']],
      ['pnpm', ['dlx', '@scope/pkg@latest']],
    ] as const)('flags %s %j as unpinned', (cmd, args) => {
      const hits = evaluateStdioSupplyChain(cmd, args);
      const hit = hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-UNPINNED-VERSION');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('medium');
    });

    it.each([
      ['npx', ['-y', '@scope/pkg@1.2.3']],
      ['npx', ['-y', 'pkg@1.0.0']],
      ['uvx', ['pkg@0.5.1']],
      ['bunx', ['@scope/pkg@^2.0.0']],
    ] as const)('does NOT flag pinned %s %j', (cmd, args) => {
      const hits = evaluateStdioSupplyChain(cmd, args);
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-UNPINNED-VERSION'),
      ).toBeUndefined();
    });
  });

  describe('non-executor commands', () => {
    it.each([
      ['node', ['./server.js']],
      ['python', ['run.py']],
      ['bash', ['./start.sh']],
      ['pnpm', ['install']],
    ] as const)('emits no hits for %s %j', (cmd, args) => {
      expect(evaluateStdioSupplyChain(cmd, args)).toEqual([]);
    });
  });

  it('flags both UNSCOPED + UNPINNED for `npx -y unscoped-pkg`', () => {
    const hits = evaluateStdioSupplyChain('npx', ['-y', 'unscoped-pkg']);
    const ids = hits.map((h) => h.ruleId).sort();
    expect(ids).toEqual([
      'SUPPLY-CHAIN-UNPINNED-VERSION',
      'SUPPLY-CHAIN-UNSCOPED-PACKAGE',
    ]);
  });
});

describe('evaluateHttpSupplyChain — rule-level semantics', () => {
  describe('SUPPLY-CHAIN-EPHEMERAL-HOST (medium)', () => {
    it.each([
      'https://my-app.vercel.app/sse',
      'https://my-app.netlify.app/',
      'https://abc123.ngrok-free.app/mcp',
      'https://demo.ngrok.io/',
      'https://branch.preview.example.com/',
      'https://workspace.gitpod.io/',
      'https://app.repl.co/',
      'https://app.replit.dev/',
      'https://tunnel.loca.lt/',
      'https://demo.trycloudflare.com/',
      'https://mcp-pr-42.example.com/',
    ])('flags %s', (url) => {
      const hits = evaluateHttpSupplyChain(url);
      const hit = hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-EPHEMERAL-HOST');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('medium');
    });

    it.each([
      'https://api.example.com/',
      'https://mcp.vendor.example.net/sse',
      'https://internal.example.org/v1/',
    ])('does NOT flag %s', (url) => {
      const hits = evaluateHttpSupplyChain(url);
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-EPHEMERAL-HOST'),
      ).toBeUndefined();
    });
  });

  describe('SUPPLY-CHAIN-RAW-CONTENT (high)', () => {
    it.each([
      'https://raw.githubusercontent.com/org/repo/main/file.json',
      'https://gist.githubusercontent.com/user/abc/raw/file.json',
      'https://raw.gitea.io/org/repo/main/file.json',
      'https://pastebin.com/raw/abcd1234',
      'https://gitlab.com/group/proj/raw/main/file.json',
    ])('flags %s', (url) => {
      const hits = evaluateHttpSupplyChain(url);
      const hit = hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-RAW-CONTENT');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
    });

    it('does NOT flag non-raw GitHub URLs', () => {
      const hits = evaluateHttpSupplyChain('https://github.com/org/repo');
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-RAW-CONTENT'),
      ).toBeUndefined();
    });

    it('does NOT flag pastebin.com without /raw/ path', () => {
      const hits = evaluateHttpSupplyChain('https://pastebin.com/abcd1234');
      expect(
        hits.find((h) => h.ruleId === 'SUPPLY-CHAIN-RAW-CONTENT'),
      ).toBeUndefined();
    });
  });

  it('returns [] on unparseable URL', () => {
    expect(evaluateHttpSupplyChain('not a url at all')).toEqual([]);
  });
});

describe('supplyChainScanner.scan — Finding shape', () => {
  const target = '/abs/path/.mcp.json';

  it('emits structured Finding with locator embedding server name', () => {
    const findings = supplyChainScanner.scan({
      config: makeCfg({
        a: { command: 'npx', args: ['-y', 'unscoped-pkg'] },
      }),
      target,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const f = findings[0]!;
    expect(f.source).toBe('static');
    expect(f.path).toBe(target);
    expect(f.id).toMatch(/^[0-9a-f]{16}$/);
    expect(f.details).toMatchObject({
      server: 'a',
      locator: expect.stringMatching(/^mcpServers\.a\./) as unknown,
    });
  });

  it('produces deterministic Finding ids across runs', () => {
    const ctx = {
      config: makeCfg({
        s: { url: 'https://app.vercel.app/' },
      }),
      target,
    };
    const a = supplyChainScanner.scan(ctx);
    const b = supplyChainScanner.scan(ctx);
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });

  it('flags every offending server in a multi-server config', () => {
    const findings = supplyChainScanner.scan({
      config: makeCfg({
        unscoped: { command: 'npx', args: ['-y', 'unscoped-pkg'] },
        ephemeral: { url: 'https://demo.vercel.app/' },
        raw: { url: 'https://raw.githubusercontent.com/o/r/main/x.json' },
        clean: { command: 'npx', args: ['-y', '@scope/pkg@1.2.3'] },
      }),
      target,
    });
    const servers = new Set(findings.map((f) => f.details!['server']));
    expect(servers.has('unscoped')).toBe(true);
    expect(servers.has('ephemeral')).toBe(true);
    expect(servers.has('raw')).toBe(true);
    expect(servers.has('clean')).toBe(false);
  });
});

describe('supplyChainScanner.scan — fixture-driven (T-14 parser path)', () => {
  describe('positive fixtures (must flag ≥1 expected rule)', () => {
    it.each([
      ['supply-chain-positive-unscoped.json', 'SUPPLY-CHAIN-UNSCOPED-PACKAGE'],
      ['supply-chain-positive-ephemeral.json', 'SUPPLY-CHAIN-EPHEMERAL-HOST'],
      ['supply-chain-positive-raw-content.json', 'SUPPLY-CHAIN-RAW-CONTENT'],
    ] as const)('%s → flags %s', async (name, expectedRuleId) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      const findings = supplyChainScanner.scan({ config, target: path });
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.ruleId === expectedRuleId)).toBe(true);
      for (const f of findings) {
        expect(f.path).toBe(path);
        expect(f.source).toBe('static');
      }
    });
  });

  describe('negative fixtures (must flag zero supply-chain findings)', () => {
    it.each([
      'supply-chain-negative-scoped-pinned.json',
      'supply-chain-negative-corporate-host.json',
      'supply-chain-negative-no-executor.json',
    ])('%s', async (name) => {
      const { path, config } = await readMcpConfig(resolve(FIXTURES, name));
      expect(supplyChainScanner.scan({ config, target: path })).toEqual([]);
    });
  });
});

describe('createScannerRegistry — final shape (all 4 detectors wired)', () => {
  it('places supplyChainScanner in slot 3 (canonical order)', () => {
    const registry = createScannerRegistry();
    expect(registry[3]!.category).toBe('supply-chain-risk');
    expect(registry[3]).toBe(supplyChainScanner);
  });

  it('no stub slots remain — every detector is its own class', () => {
    const registry = createScannerRegistry();
    expect(registry.map((s) => s.category)).toEqual([
      'ssrf',
      'command-injection',
      'auth-gap',
      'supply-chain-risk',
    ]);
  });
});
