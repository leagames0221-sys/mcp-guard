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
- Repo visibility: PRIVATE for initial commit, PUBLIC after Phase α ★★★ verify
- License: MIT
