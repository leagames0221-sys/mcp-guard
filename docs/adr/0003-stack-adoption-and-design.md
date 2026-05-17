# ADR-0003: Stack, prior-art adoption set, and architectural design (Stage 1-3 consolidated)

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: tomohiro takada
- **Supersedes**: none
- **Builds on**: ADR-0001 (scope + decomposed prior-art seeds), ADR-0002 (free tier + local LLM + supply chain defense)

## Context

After ADR-0001 (scope) and ADR-0002 (operational constraints), the Spec-Driven Workflow ran Stage 1 Discovery → Stage 2 Requirements (EARS) → Stage 3 Design. This ADR consolidates the literal decisions emitted by those three stages so downstream Phase 1 implementation work has a single source of truth.

A subsequent independent review identified 9 gaps. All 9 were accepted and integrated into this ADR before approval.

## Decision

### 1. Stack (Stage 1 lock)

- **Language**: TypeScript on Node.js 20 LTS
- **Package manager**: pnpm (lockfile committed)
- **Test framework**: vitest (ESM-native, TypeScript-first, snapshot built-in)
- **CLI framework**: [tj/commander.js](https://github.com/tj/commander.js) (MIT, 27k stars)
- **Schema validation**: zod
- **LLM provider**:
  - Default: Ollama (model: `gemma3:4b`, already provisioned locally, 3.3 GB on disk)
  - Optional alternatives (install on demand): `qwen2.5:7b`, `llama3.1:8b`
  - Paid API swap (env-var-gated, user-explicit only): Anthropic / OpenAI
  - Mock provider: mandatory fallback, default in CI

### 2. Prior-art adoption set (Stage 1 audit)

| Seed | Adoption level | Pattern extracted | Install |
|---|---|---|---|
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) (MIT, 21k stars, active today) | Primary | CLI/yaml UX, red-team plugin loader, reporter format | No install — README + source read only |
| [NVIDIA/garak](https://github.com/NVIDIA/garak) (Apache-2.0, 7.8k stars, active) | Primary | Probe / Detector / Harness 3-layer architecture | No install — architecture doc read only |
| [protectai/llm-guard](https://github.com/protectai/llm-guard) (MIT, 3k stars, 5 mo stale) | Reference | Scanner registry pattern (idea only) | No install — README peek only |
| [microsoft/agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit) (MIT, Scorecard 6.5, 30 known vulns) | Reference | OWASP 10 agentic AI mapping table | No install — blog post read only |
| Golf Scanner (MCP-specific, audit pending) | To-be-audited (Phase 1 task) | MCP config check list (IDE coverage) | No install — README + license + Scorecard verify in Phase 1 |

Adoption gate per ADR-0002: OSSF Scorecard ≥ 7 + signed releases + dep tree audit + user approval. Three seeds without Scorecard data passed an alternative gate (stars ≥ 5k + ≤ 90 days activity + reputable org + clean license).

### 3. EARS acceptance criteria (Stage 2)

Total = **31 AC** across 5 features and 7 non-functional criteria.

- **F-001 MCP scanner**: AC-001-1 .. AC-001-5
- **F-002 Prompt injection harness**: AC-002-1 .. AC-002-5
- **F-003 Remediation engine**: AC-003-1 .. AC-003-4
- **F-004 CI integration sample**: AC-004-1 .. AC-004-4
- **F-005 CLI UX**: AC-005-1 .. AC-005-6 (AC-005-6 = exit-code mapping per POSIX sysexits.h)
- **Non-functional**: AC-NF-1 (paid API guard), AC-NF-2 (credential file guard), AC-NF-3 (CI 5 min/runner), AC-NF-4 (ANSI sanitize), AC-NF-5 (Ollama localhost only), AC-NF-6 (cross-OS compat), AC-NF-7 (concurrent execution safety)

Full text lives in `spec.md` § EARS.

### 4. Architectural layering (Stage 3 Design)

```
CLI (commander)
   ├─ Scanner registry (Layer 1) — MCP config scanners
   ├─ Probe/Detector Harness (Layer 2) — OWASP LLM01-10 corpus
   └─ Remediation engine — rule-based + LLM-enriched
              │
              ▼
   LlmProvider interface (Ollama / mock / Anthropic / OpenAI)
              │
              ▼
   I/O (Layer 0) — parsers + emitters (SARIF / JSON / console)
```

Cross-cutting modules: `src/config/` (loader + schema + precedence), `src/logger/` (sanitize + levels), `src/errors/` (typed hierarchy + exit-code mapping).

### 5. Design tradeoffs (Stage 3, 11 entries)

Decision IDs `D-001` through `D-011` covering: CLI framework choice, probe corpus format, SARIF emission strategy, LlmProvider abstraction shape, test framework, probe execution concurrency, channel-B mask hook implementation, MCP config schema sourcing, probe corpus versioning, config loader implementation, logger implementation.

Each tradeoff lists chosen option, ≥ 1 rejected option, and one-paragraph rationale. Full text in `spec.md` § Tradeoffs.

### 6. Exit code mapping (AC-005-6, sysexits.h aligned)

| Condition | Exit code |
|---|---|
| Success, no findings | 0 |
| Findings >= threshold | 1 |
| Invalid input / parse error | 2 |
| Usage error (unknown flag/subcommand) | 64 |
| Data format error | 65 |
| Internal error | 70 |
| I/O error | 74 |
| Config error | 78 |

### 7. File structure (Stage 3 Boundary)

New directories under `src/`: `config/`, `logger/`, `errors/`, `scanners/`, `scanners/mcp-schema/`, `probes/`, `detectors/`, `harness/`, `remediation/`, `providers/llm/`, `io/parsers/`, `io/emitters/`, `types/`, `cli/`.

New root files: `package.json` + `pnpm-lock.yaml` + `tsconfig.json` + `vitest.config.ts` + `.npmrc` (engine-strict) + `.editorconfig` + `SECURITY.md`.

New scripts: `scripts/precommit_mask_check.ts`, `scripts/benchmark.ts`, `scripts/update-mcp-schema.ts`.

New workflows: `.github/workflows/ci.yml`, `.github/workflows/mcp-schema-drift.yml`, `.github/workflows/mcp-guard-example.yml`.

New docs: `docs/owasp-llm-top10-mapping.md`, `docs/PROVIDERS.md`, `docs/EXIT_CODES.md`.

## Consequences

**Positive**:

- Single source of truth for Phase 1 implementation — no ambiguity on stack / structure / behavior
- 11 ADR-tracked design decisions reduce bikeshedding in PR reviews
- 31 EARS AC give measurable acceptance criteria for the project's production-grade quality target
- Cross-cutting infrastructure (`config/`, `logger/`, `errors/`) prevents downstream rework

**Negative**:

- Larger initial surface area than minimal MVP; offset by clear layer boundaries
- Hand-rolled config loader + logger + SARIF emitter trade upstream maintenance leverage for supply chain blast-radius minimization

**Risks**:

- gemma3:4b inference quality for prompt-injection detection unknown until Phase 1 benchmark; mitigation = mock mode default in CI + benchmark task in Phase 1
- Upstream MCP spec evolution risk; mitigation = D-008 frozen vendor snapshot + CI drift detection

## Alternatives considered (top-level architectural alternatives, not D-NNN-level)

- **Build directly on promptfoo as a plugin instead of standalone CLI**: rejected. Loses MCP-specific UX, increases coupling to upstream, and complicates the "no install" decomposed prior-art principle.
- **Python stack matching garak's ecosystem**: rejected. promptfoo (the closer prior art) is TypeScript, and MCP ecosystem tooling is Node.js-centric.
- **Skip the harness, ship scanner-only first**: rejected. Both axes deliver portfolio value, and the harness shares infrastructure (LlmProvider, reporter, exit-code mapping) with the scanner — splitting would duplicate effort.

## References

- [POSIX sysexits.h](https://man.openbsd.org/sysexits.3) — exit code reference
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/)
- [Model Context Protocol specification](https://github.com/modelcontextprotocol/specification)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [tj/commander.js](https://github.com/tj/commander.js)
- [colinhacks/zod](https://github.com/colinhacks/zod)
- [Ollama](https://github.com/ollama/ollama)
