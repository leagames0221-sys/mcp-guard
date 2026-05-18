# Active context — mcp-guard

> Cline memory-bank pattern (5-file). Update after every meaningful work session.

## Current phase

**Phase 1 — L0 + L1 + L2 + L3 + L4 + L5 T-23/T-24/T-25 COMPLETE (T-01 through T-25, 2026-05-19). 3-detector verdict layer (refusal / no-leak / safe-completion) lit up keyed by expected_behavior. Pure-function detectors, no LLM, deterministic.**
**Next: T-26 sequential harness → T-27 F-002 e2e.**

## Recent accepted stages

- Stage 1 Discovery: prior-art set (promptfoo + garak primary, llm-guard + agent-governance-toolkit reference) + stack (TS/Node 20 LTS + pnpm + vitest + commander + zod + Ollama gemma3:4b) + integration approach
- Stage 2 Requirements: 31 EARS AC (F-001~F-005 + 7 NF)
- Stage 3 Design v2: 11 tradeoffs (D-001~D-011), 4 new modules (config / logger / errors / scanners/mcp-schema), independent review 9 gaps integrated
- Stage 4 Tasks v2: 39 tasks across 9 layers (L0~L9), all 31 AC + 11 tradeoffs + 8 Phase α AC literal mapped; 6-point objective-evaluation patch round applied (lint tool drop, commander built-in did-you-mean, yaml dep adopted, ADR count to 5 via T-09 + T-38, AC-α-2 stream condition wording, vitest coverage thresholds in T-02)
- ADR-0003 (consolidated Stage 1-3 decisions) committed

## Currently in progress

- L5 T-25 landed: `src/detectors/{types,index,refusal,no-leak,safe-completion}.ts`. Garak 3-layer pattern (ADR-0003 §4) — Probe → output → pure-function Detector → Verdict. `Detector = { name, evaluate(probeOutput, probe): Verdict }`, `Verdict = {pass: boolean, score: number in [0,1], reason: string}`. Registry `DETECTOR_BY_EXPECTED_BEHAVIOR: Record<ExpectedBehavior, Detector>` frozen, dispatcher `evaluateProbeOutput(probe, output)` selects by expected_behavior. Refusal: 9 refusal regex patterns + 10 compliance markers (PWN, PEM headers, vendor creds, rm -rf, DROP TABLE, XSS, SQLi); fail-closed when both phrasing + compliance marker coexist. No-leak: 12 vendor credential signatures mirrored from auth-gap scanner + PEM header + 4 system-prompt markers, with redacted-* / ${VAR} exemption stripping. Safe-completion: 6 hedge patterns + URL/DOI citation fallback (score 0.7) + 2 fabrication markers (templated DOI). 41-spec unit test, 567 vitest total PASS (526 prior + 41 new).
- L5 T-24 landed: `src/probes/owasp/llm0{1..10}/*.yaml` 30 probe files (3 per category, balanced corpus). All carry corpus_version=1, OWASP reference URL (genai.owasp.org/llm-top-10/), license=CC-BY-4.0, sanitized educational scope. New corpus-integrity test (`tests/unit/probes-owasp-corpus.test.ts`, 7 specs): ≥30 count, all 10 categories present, corpus_version=1 invariant, OWASP ref invariant, license present, id-uniqueness, ≥3 per category. 526 vitest specs PASS (519 prior + 7 new). AC-002-1 literal satisfied.
- L5 T-23 landed: `src/probes/{types,loader}.ts` + 6 fixtures (2 valid + 4 invalid) + 26-spec unit test. YAML 1-probe-per-file (D-002), zod strict schema, required-metadata gate (`corpus_version` + `owasp_category` per D-009 + AC literal), DataFormatError on YAML parse fail, InvalidInputError on schema fail, IoError on ENOENT, duplicate-id guard. Lexicographic directory walk for cross-OS determinism. 519 vitest specs PASS (493 prior + 26 new). Next: T-24 OWASP LLM01–10 probe corpus (≥30 files, all 10 categories, sanitized + license-noted educational scope).

## Open questions

- gemma3:4b inference quality for prompt-injection detection — to be measured in Phase 1 benchmark task (T-38)
- MCP spec upstream commit pin selection for D-008 frozen vendor snapshot — to be resolved at T-09 via ADR-0005

## Blockers

None.

## Recent decisions

- ADR-0001: scope = defensive-first MCP scanner + LLM injection harness + remediation suggester
- ADR-0002: free tier only, Ollama local LLM default, supply chain adoption gate
- ADR-0003: stack + adoption set + EARS + 11 design tradeoffs + exit code mapping consolidated
- Repo visibility: PRIVATE for initial commit, PUBLIC after Phase α verify
- License: MIT
- Stack lock: TypeScript (Node 20 LTS) + pnpm + vitest + commander + zod
- LLM provider: Ollama default with primary model gemma3:4b (already installed locally), paid API env-var-gated optional, mock mode mandatory fallback
- Channel B framing: gitignored internal_notes.md holds mask list; committed files reference rules abstractly only
- 4 cross-cutting modules added (config / logger / errors / scanners/mcp-schema) per independent review
