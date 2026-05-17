# Active context — mcp-guard

> Cline memory-bank pattern (5-file). Update after every meaningful work session.

## Current phase

**Phase 1 Spec-Driven Workflow — Stage 1 + 2 + 3 v2 Accepted (2026-05-18).**
**Next: Stage 4 Tasks (WBS + Boundary/Depends + AC mapping).**

## Recent accepted stages

- Stage 1 Discovery: prior-art set (promptfoo + garak primary, llm-guard + agent-governance-toolkit reference) + stack (TS/Node 20 LTS + pnpm + vitest + commander + zod + Ollama gemma3:4b) + integration approach
- Stage 2 Requirements: 31 EARS AC (F-001~F-005 + 7 NF)
- Stage 3 Design v2: 11 tradeoffs (D-001~D-011), 4 new modules (config / logger / errors / scanners/mcp-schema), independent review 9 gaps integrated
- ADR-0003 (consolidated Stage 1-3 decisions) committed

## Currently in progress

- Stage 4 Tasks pending user approval to launch
- Phase 1 implementation kickoff blocked on Stage 4 approval

## Open questions

- gemma3:4b inference quality for prompt-injection detection — to be measured in Phase 1 benchmark task
- MCP spec upstream commit pin selection for D-008 frozen vendor snapshot

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
