# Active context — mcp-guard

> Cline memory-bank pattern (5-file). Update after every meaningful work session.

## Current phase

**Phase 0 — scaffold installed (2026-05-18).**

## Currently in progress

- Initial repo scaffold complete (LICENSE / README / CLAUDE.md / spec.md / .github/workflows / docs/adr/0001 / .claude/ structure / memory_bank 5-file)
- Next: `/spec-driven-workflow` Discovery stage to lock stack + prior-art adoption set

## Open questions

- Final stack: TypeScript (Node.js + pnpm) is current default. Confirm in Discovery via prior-art audit results.
- Initial probe/detector coverage: which OWASP LLM01–10 subset to ship in Phase 1 PoC?
- CI matrix scope: Node 20 LTS only, or Node 20 + 22?

## Blockers

None.

## Recent decisions

- ADR-0001: scope = defensive-first MCP scanner + LLM injection harness + remediation suggester (developer/SMB target)
- ADR-0002: free tier only (no credit card), Ollama local LLM default, supply chain adoption gate (Scorecard ≥ 7 + signed release + dep tree audit + user approval)
- Repo visibility: PRIVATE for initial commit, PUBLIC after Phase α ★★★ verify
- License: MIT
- Stack: TypeScript (Node.js 20 LTS + pnpm + vitest) — final lock in Discovery
- LLM provider: Ollama default. Primary model = gemma3:4b (already installed locally, 3.3 GB). Alternatives = qwen2.5:7b / llama3.1:8b (install on demand). Paid API env-var-gated optional, mock mode mandatory fallback.
