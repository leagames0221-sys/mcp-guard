# Active context — mcp-guard

> Cline memory-bank pattern (5-file). Update after every meaningful work session.

## Current phase

**Phase 1 — L0 Foundation + L1 Cross-cutting + L2 LlmProvider layer + L3 I/O layer (T-14 ~ T-17) + L4 T-18 registry + L4 T-19 SSRF + L4 T-20 command-injection + L4 T-21 auth-gap detectors completed (T-01 through T-21, 2026-05-18).**
**Next: T-22 supply-chain-risk detector + F-001 e2e.**

## Recent accepted stages

- Stage 1 Discovery: prior-art set (promptfoo + garak primary, llm-guard + agent-governance-toolkit reference) + stack (TS/Node 20 LTS + pnpm + vitest + commander + zod + Ollama gemma3:4b) + integration approach
- Stage 2 Requirements: 31 EARS AC (F-001~F-005 + 7 NF)
- Stage 3 Design v2: 11 tradeoffs (D-001~D-011), 4 new modules (config / logger / errors / scanners/mcp-schema), independent review 9 gaps integrated
- Stage 4 Tasks v2: 39 tasks across 9 layers (L0~L9), all 31 AC + 11 tradeoffs + 8 Phase α AC literal mapped; 6-point objective-evaluation patch round applied (lint tool drop, commander built-in did-you-mean, yaml dep adopted, ADR count to 5 via T-09 + T-38, AC-α-2 stream condition wording, vitest coverage thresholds in T-02)
- ADR-0003 (consolidated Stage 1-3 decisions) committed

## Currently in progress

- L4 T-18 + T-19 + T-20 + T-21 complete (SSRF + command-injection + auth-gap slots lit up; supply-chain still stub); T-22 supply-chain-risk next — flag stdio `command`/`args` for unscoped npx packages, single-letter `npx` names (typosquat risk), `npx -y` of unverified scoped packages, http servers pointing to ephemeral / preview hostnames + e2e `tests/e2e/scan.test.ts` that generates synthetic 50-server `.mcp.json`, measures scan time < 60s (AC-001-1 perf), validates SARIF schema (AC-001-3), confirms input file hash unchanged pre/post (AC-001-5)

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
