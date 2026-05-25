# Active context — mcp-guard

## Current phase

**Phase 1 COMPLETE + PUBLIC LIVE (2026-05-19, 2026-05-20 independent audit re-verified).** All 39 tasks T-01~T-39 + 5-fix polish + 7-issue post-flip fix + AC-α-1..AC-α-8 全件 literal landed. Tier-reviewer 4-round CONFIRM chain (REFUTE on 5fc015e → fix → CONFIRM f7c2004 → CONFIRM ae87197 → CONFIRM 6561308 + post-PUBLIC re-verify). User explicit promotion 2026-05-19.
**Origin main HEAD = `d43bdf1`** (2026-05-19 20:33 +0900, history-rewritten 2026-05-19, `.security_telemetry.jsonl` literal removed from 56-commit history per AC-α-8 sweep).
**Repo PUBLIC** at https://github.com/leagames0221-sys/mcp-guard (MIT license, main branch-protected with 3-OS required status checks, 3 GitHub security features ON).
**696 vitest specs PASS / 37 files / coverage 98.14%** at HEAD d43bdf1.
**Next: Phase 1 complete, no blocker. Optional minor improvements (ship 後 OK): CHANGELOG.md / NOTICE.md / CONTRIBUTING.md. Phase β = sbom-pilot (separate sibling repo, in progress).**

## Recent accepted stages

- Stage 1 Discovery: prior-art set (promptfoo + garak primary, llm-guard + agent-governance-toolkit reference) + stack (TS/Node 20 LTS + pnpm + vitest + commander + zod + Ollama gemma3:4b) + integration approach
- Stage 2 Requirements: 31 EARS AC (F-001~F-005 + 7 NF)
- Stage 3 Design v2: 11 tradeoffs (D-001~D-011), 4 new modules (config / logger / errors / scanners/mcp-schema), independent review 9 gaps integrated
- Stage 4 Tasks v2: 39 tasks across 9 layers (L0~L9), all 31 AC + 11 tradeoffs + 8 Phase α AC literal mapped; 6-point objective-evaluation patch round applied (lint tool drop, commander built-in did-you-mean, yaml dep adopted, ADR count to 5 via T-09 + T-38, AC-α-2 stream condition wording, vitest coverage thresholds in T-02)
- ADR-0003 (consolidated Stage 1-3 decisions) committed

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
- 4 cross-cutting modules added (config / logger / errors / scanners/mcp-schema) per independent review
