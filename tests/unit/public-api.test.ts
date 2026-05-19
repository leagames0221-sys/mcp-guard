// Public API barrel smoke test. Asserts the canonical surface
// consumers will see when they `import * as mcpGuard from 'mcp-guard'`.
// Catches export drift: if a future refactor renames a symbol or
// drops a re-export, this test fails before it lands in CI.

import { describe, it, expect } from 'vitest';

import * as api from '../../src/index.js';

describe('src/index.ts public API barrel', () => {
  it('exposes the 3 feature-surface entry functions', () => {
    expect(typeof api.runScan).toBe('function');
    expect(typeof api.runInject).toBe('function');
    expect(typeof api.runSuggest).toBe('function');
    expect(typeof api.readReport).toBe('function');
  });

  it('exposes scanner registry + helpers', () => {
    expect(typeof api.createScannerRegistry).toBe('function');
    expect(typeof api.runAllScanners).toBe('function');
    expect(typeof api.makeFindingId).toBe('function');
    expect(Array.isArray(api.SCANNER_CATEGORIES)).toBe(true);
  });

  it('exposes probe loader + corpus types', () => {
    expect(typeof api.loadProbeFile).toBe('function');
    expect(typeof api.loadProbeDirectory).toBe('function');
    expect(typeof api.parseProbeYaml).toBe('function');
    expect(api.OWASP_CATEGORIES.length).toBe(10);
    expect(api.EXPECTED_BEHAVIORS).toContain('refuse');
  });

  it('exposes detector layer + dispatcher', () => {
    expect(typeof api.refusalDetector.evaluate).toBe('function');
    expect(typeof api.noLeakDetector.evaluate).toBe('function');
    expect(typeof api.safeCompletionDetector.evaluate).toBe('function');
    expect(typeof api.evaluateProbeOutput).toBe('function');
    expect(typeof api.detectorFor).toBe('function');
    expect(typeof api.DETECTOR_BY_EXPECTED_BEHAVIOR).toBe('object');
  });

  it('exposes harness + serializer + severity tables', () => {
    expect(typeof api.runHarness).toBe('function');
    expect(typeof api.serializeHarnessReport).toBe('function');
    expect(api.SEVERITY_ORDER.low).toBe(0);
    expect(api.SEVERITY_ORDER.critical).toBe(3);
    expect(api.CATEGORY_SEVERITY.LLM02).toBe('critical');
    expect(api.CATEGORY_SEVERITY.LLM06).toBe('critical');
  });

  it('exposes remediation engine + LLM-enriched path', () => {
    expect(typeof api.templateRemediationFor).toBe('function');
    expect(typeof api.remediateFindings).toBe('function');
    expect(typeof api.enrichRemediation).toBe('function');
    expect(typeof api.enrichFindings).toBe('function');
    expect(typeof api.templateFor).toBe('function');
    expect(typeof api.hasTemplate).toBe('function');
    expect(typeof api.REMEDIATION_TEMPLATES).toBe('object');
  });

  it('exposes 4 LLM provider classes + budget guard', () => {
    expect(typeof api.MockLlmProvider).toBe('function');
    expect(typeof api.OllamaLlmProvider).toBe('function');
    expect(typeof api.AnthropicLlmProvider).toBe('function');
    expect(typeof api.OpenAiLlmProvider).toBe('function');
    expect(typeof api.PaidApiBudget).toBe('function');
    expect(api.DEFAULT_OLLAMA_HOST).toMatch(/^http:\/\/localhost:11434/);
  });

  it('exposes I/O parsers + emitters', () => {
    expect(typeof api.readMcpConfig).toBe('function');
    expect(typeof api.buildReport).toBe('function');
    expect(typeof api.isCleanReport).toBe('function');
    expect(typeof api.serializeReport).toBe('function');
    expect(typeof api.emitJsonReport).toBe('function');
    expect(typeof api.buildSarifLog).toBe('function');
    expect(typeof api.emitSarifReport).toBe('function');
    expect(typeof api.renderReport).toBe('function');
    expect(typeof api.emitConsoleReport).toBe('function');
    expect(api.SARIF_VERSION).toBe('2.1.0');
    expect(api.REPORT_SCHEMA_VERSION).toBe('1.0');
    expect(api.TOOL_NAME).toBe('mcp-guard');
  });

  it('exposes error hierarchy + ExitCode table', () => {
    expect(typeof api.McpGuardError).toBe('function');
    expect(typeof api.IoError).toBe('function');
    expect(typeof api.DataFormatError).toBe('function');
    expect(typeof api.InvalidInputError).toBe('function');
    expect(typeof api.ConfigError).toBe('function');
    expect(typeof api.UsageError).toBe('function');
    expect(typeof api.InternalError).toBe('function');
    expect(typeof api.FindingsExceedThresholdError).toBe('function');
    expect(typeof api.resolveExitCode).toBe('function');
    expect(api.ExitCode.Success).toBe(0);
    expect(api.ExitCode.IoError).toBe(74);
    expect(api.ExitCode.ConfigError).toBe(78);
  });

  it('error types are usable end-to-end (instanceof + payload)', () => {
    const e = new api.InvalidInputError('test', { field: 'x' });
    expect(e instanceof api.McpGuardError).toBe(true);
    expect(e.exitCode).toBe(api.ExitCode.InvalidInput);
    const payload = e.toPayload();
    expect(payload.code).toBe(api.ExitCode.InvalidInput);
    expect(payload.details).toEqual({ field: 'x' });
  });

  it('does not leak the obsolete SCAFFOLD_MARKER placeholder', () => {
    expect((api as Record<string, unknown>).SCAFFOLD_MARKER).toBeUndefined();
  });
});
