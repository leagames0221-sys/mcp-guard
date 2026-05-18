import { describe, it, expect } from 'vitest';

import {
  buildReport,
  renderReport,
  emitConsoleReport,
  type Finding,
} from '../../src/io/emitters/index.js';

// T-17 / AC-NF-4 (ANSI sanitize) + AC-002-3 progress format (progress
// lives in the T-07 logger module; this emitter handles the final
// rendered report). Surface: render = pure string; emit = stream write.

function f(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-0001',
    ruleId: 'rule-X',
    severity: 'high',
    source: 'static',
    message: 'sample message',
    ...overrides,
  };
}

function captureStream(): { stream: NodeJS.WritableStream; chunks: string[] } {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string | Buffer): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
    end(): void {},
    isTTY: false,
  } as unknown as NodeJS.WritableStream;
  return { stream, chunks };
}

function captureTtyStream(): { stream: NodeJS.WritableStream; chunks: string[] } {
  const { stream, chunks } = captureStream();
  Object.defineProperty(stream, 'isTTY', { value: true });
  return { stream, chunks };
}

describe('renderReport — clean report', () => {
  it('emits "clean (0 findings)" line + header', () => {
    const report = buildReport({
      target: '/scanned/.mcp.json',
      toolVersion: '0.1.0',
      generatedAt: '2026-05-18T00:00:00.000Z',
    });
    const text = renderReport(report, { color: false });
    expect(text).toContain('mcp-guard 0.1.0 — target: /scanned/.mcp.json');
    expect(text).toContain('generated: 2026-05-18T00:00:00.000Z');
    expect(text).toContain('✓ clean (0 findings)');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('clean report contains no ANSI when color=false', () => {
    const report = buildReport({ target: '/x' });
    const text = renderReport(report, { color: false });
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\[/);
  });

  it('clean report wraps the ok line in green when color=true', () => {
    const report = buildReport({ target: '/x' });
    const text = renderReport(report, { color: true });
    expect(text).toMatch(/\[32m✓ clean \(0 findings\)\[0m/);
  });
});

describe('renderReport — findings present', () => {
  it('emits severity count summary + per-finding block', () => {
    const findings = [
      f({ id: 'F-1', severity: 'critical', message: 'bad thing' }),
      f({ id: 'F-2', severity: 'high' }),
      f({ id: 'F-3', severity: 'medium' }),
      f({ id: 'F-4', severity: 'low' }),
    ];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('4 findings (critical=1 high=1 medium=1 low=1)');
    expect(text).toContain('[CRITICAL] rule-X (F-1)');
    expect(text).toContain('  bad thing');
  });

  it('uses singular "finding" when total is 1', () => {
    const text = renderReport(buildReport({ target: '/x', findings: [f()] }), { color: false });
    expect(text).toContain('1 finding (');
  });

  it('renders path + line + col location when present', () => {
    const findings = [f({ path: 'src/evil.ts', line: 10, col: 4 })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('  at src/evil.ts:10:4');
  });

  it('renders path-only location when line + col absent', () => {
    const findings = [f({ path: 'src/x.ts' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('  at src/x.ts');
    expect(text).not.toContain('  at src/x.ts:');
  });

  it('omits the location line when path is absent', () => {
    const text = renderReport(buildReport({ target: '/x', findings: [f()] }), { color: false });
    expect(text).not.toContain('  at ');
  });
});

describe('AC-NF-4 — sanitize hostile content', () => {
  it('strips ANSI escape sequences from finding.message', () => {
    const findings = [f({ message: 'hello[2J[Hworld' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('  helloworld');
    // No CSI sequences anywhere in the output
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\[(2J|H)/);
  });

  it('strips control characters from finding.message (bell, vertical tab, BS)', () => {
    const findings = [f({ message: 'beforemiddlebackspaceend' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('beforemiddlebackspaceend');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[]/);
  });

  it('strips ANSI from a hostile target path', () => {
    const report = buildReport({ target: '/legit[31m/HACKED' });
    const text = renderReport(report, { color: false });
    expect(text).toContain('target: /legit/HACKED');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\[31m/);
  });

  it('strips ANSI from a hostile ruleId', () => {
    const findings = [f({ ruleId: 'evil[1mBOLD' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('evilBOLD');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\[1m/);
  });

  it('strips ANSI from a hostile finding.path', () => {
    const findings = [f({ path: 'src/[31mevil.ts' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { color: false });
    expect(text).toContain('  at src/evil.ts');
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/\[31m/);
  });
});

describe('Colour decision — TTY + NO_COLOR + explicit override', () => {
  it('non-TTY default → no colour', () => {
    const findings = [f({ severity: 'critical' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { env: {} });
    // No colour wrapping around the severity tag (look for [CRITICAL])
    expect(text).toContain('[CRITICAL]');
    expect(text).not.toMatch(/\[1;31m/);
  });

  it('TTY stream + no NO_COLOR → colour ON', () => {
    const { stream } = captureTtyStream();
    const findings = [f({ severity: 'critical' })];
    const text = renderReport(buildReport({ target: '/x', findings }), { stream, env: {} });
    expect(text).toMatch(/\[1;31mCRITICAL\[0m/);
  });

  it('TTY stream + NO_COLOR=1 → colour OFF (no-color.org standard)', () => {
    const { stream } = captureTtyStream();
    const findings = [f({ severity: 'critical' })];
    const text = renderReport(buildReport({ target: '/x', findings }), {
      stream,
      env: { NO_COLOR: '1' },
    });
    expect(text).toContain('[CRITICAL]');
    expect(text).not.toMatch(/\[/);
  });

  it('TTY stream + NO_COLOR="" (empty string) → colour stays ON', () => {
    const { stream } = captureTtyStream();
    const findings = [f({ severity: 'critical' })];
    const text = renderReport(buildReport({ target: '/x', findings }), {
      stream,
      env: { NO_COLOR: '' },
    });
    expect(text).toMatch(/\[1;31m/);
  });

  it('explicit color=true overrides NO_COLOR + non-TTY', () => {
    const findings = [f({ severity: 'high' })];
    const text = renderReport(buildReport({ target: '/x', findings }), {
      color: true,
      env: { NO_COLOR: '1' },
    });
    expect(text).toMatch(/\[31mHIGH\[0m/);
  });

  it('explicit color=false overrides TTY', () => {
    const { stream } = captureTtyStream();
    const findings = [f({ severity: 'high' })];
    const text = renderReport(buildReport({ target: '/x', findings }), {
      color: false,
      stream,
      env: {},
    });
    expect(text).toContain('[HIGH]');
    expect(text).not.toMatch(/\[/);
  });
});

describe('emitConsoleReport — stream write integration', () => {
  it('writes the rendered output to the given stream', () => {
    const { stream, chunks } = captureStream();
    const findings = [f({ id: 'F-7', message: 'leaky' })];
    emitConsoleReport(buildReport({ target: '/x', findings }), {
      stream,
      env: {},
      color: false,
    });
    const out = chunks.join('');
    expect(out).toContain('[HIGH] rule-X (F-7)');
    expect(out).toContain('  leaky');
  });

  it('clean report write to non-TTY stream has no ANSI bytes', () => {
    const { stream, chunks } = captureStream();
    emitConsoleReport(buildReport({ target: '/x' }), { stream, env: {} });
    const out = chunks.join('');
    expect(out).toContain('✓ clean (0 findings)');
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\[/);
  });
});
