// Public library entrypoint. Consumers can either invoke the CLI
// (`mcp-guard scan / inject / suggest`) or import the underlying
// programmatic surface from this barrel. The CLI itself composes
// these same functions — no separate "lib vs cli" duplication.
//
// Layering: feature surface (scan / inject / suggest) → underlying
// engines (scanner registry / harness / detectors / remediation /
// LlmProvider). Errors flow through the typed McpGuardError hierarchy
// and map to sysexits codes via ExitCode (see docs/EXIT_CODES.md).

// ── Feature surface (the three subcommand bodies) ────────────────
export { runScan, type ScanCliOptions, type ScanCliResult } from './cli/scan.js';
export { runInject, type InjectCliOptions, type InjectCliResult } from './cli/inject.js';
export {
  runSuggest,
  readReport,
  type SuggestOptions,
  type SuggestResult,
} from './cli/suggest.js';

// ── Scanner registry (F-001 building blocks) ─────────────────────
export {
  createScannerRegistry,
  runAllScanners,
  SCANNER_CATEGORIES,
  makeFindingId,
  type Scanner,
  type ScanContext,
  type ScannerCategory,
} from './scanners/index.js';

// ── Probes + detectors + harness (F-002 building blocks) ─────────
export {
  loadProbeFile,
  loadProbeDirectory,
  parseProbeYaml,
} from './probes/loader.js';
export {
  OWASP_CATEGORIES,
  EXPECTED_BEHAVIORS,
  type Probe,
  type LoadedProbe,
  type OwaspCategory,
  type ExpectedBehavior,
} from './probes/types.js';
export {
  refusalDetector,
  noLeakDetector,
  safeCompletionDetector,
  evaluateProbeOutput,
  detectorFor,
  DETECTOR_BY_EXPECTED_BEHAVIOR,
  type Detector,
  type Verdict,
} from './detectors/index.js';
export {
  runHarness,
  serializeHarnessReport,
  CATEGORY_SEVERITY,
  SEVERITY_ORDER,
  type HarnessOptions,
  type HarnessReport,
  type ProbeResult,
  type CategoryTotals,
} from './harness/index.js';

// ── Remediation engine (F-003 building blocks) ───────────────────
export {
  templateRemediationFor,
  remediateFindings,
  enrichRemediation,
  enrichFindings,
  templateFor,
  hasTemplate,
  REMEDIATION_TEMPLATES,
  type Remediation,
  type RemediationTemplate,
  type RemediationSource,
} from './remediation/index.js';

// ── LLM providers (D-004 minimal interface + 4 impls) ────────────
export {
  MockLlmProvider,
  OllamaLlmProvider,
  AnthropicLlmProvider,
  OpenAiLlmProvider,
  PaidApiBudget,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  ANTHROPIC_DEFAULT_MODEL,
  OPENAI_DEFAULT_MODEL,
  DEFAULT_MAX_CALLS_PER_RUN,
  DEFAULT_MAX_TOKENS_PER_CALL,
  DEFAULT_MAX_TOKENS_PER_RUN,
  type LlmProvider,
  type LlmGenerateOptions,
} from './providers/llm/index.js';

// ── I/O surfaces (parser + emitters) ─────────────────────────────
export {
  readMcpConfig,
  type ReadMcpConfigResult,
} from './io/parsers/mcp-config.js';
export {
  buildReport,
  isCleanReport,
  serializeReport,
  emitJsonReport,
  REPORT_SCHEMA_VERSION,
  TOOL_NAME,
  type Finding,
  type ScanReport,
  type BuildReportOptions,
} from './io/emitters/json.js';
export {
  buildSarifLog,
  serializeSarifLog,
  emitSarifReport,
  SARIF_VERSION,
  SARIF_SCHEMA,
} from './io/emitters/sarif.js';
export {
  renderReport,
  emitConsoleReport,
  type ConsoleEmitOptions,
} from './io/emitters/console.js';

// ── Errors + exit codes (sysexits-aligned) ───────────────────────
export {
  ExitCode,
  McpGuardError,
  FindingsExceedThresholdError,
  InvalidInputError,
  UsageError,
  DataFormatError,
  InternalError,
  IoError,
  ConfigError,
  resolveExitCode,
  type ExitCodeValue,
  type StructuredErrorPayload,
} from './errors/index.js';

// ── Cross-cutting types ──────────────────────────────────────────
export type {
  SeverityLevel,
  OutputFormat,
  LlmProviderName,
  LogLevelName,
} from './types/index.js';
