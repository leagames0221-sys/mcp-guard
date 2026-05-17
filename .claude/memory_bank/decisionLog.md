# Decision log — mcp-guard

> Sequential log of accepted decisions. Each entry: date, decision, rationale, ADR link if applicable.

## 2026-05-18

- **D-001**: Scope = MCP config scanner + LLM injection harness + remediation suggester. → ADR-0001
- **D-002**: Decomposed prior-art approach (no wholesale forks). → ADR-0001
- **D-003**: Initial seed allowlist = promptfoo, garak, llm-guard, Microsoft Agent Governance Toolkit. → ADR-0001
- **D-004**: License = MIT (matches majority of prior-art seeds, simplest portfolio default).
- **D-005**: Repo visibility = PRIVATE at initial commit, PUBLIC gate-conditional on Phase α ★★★ verify.
- **D-006**: Stack default = TypeScript (Node.js + pnpm), confirm in Discovery.
- **D-007**: Channel B framing → `.claude/internal_notes.md` (gitignored) holds mask list; CLAUDE.md (committed) references rules abstractly.
- **D-008**: Free tier only, no credit card required (Cloudflare / GitHub Actions free tier OK, AWS/GCP/Azure excluded). → ADR-0002
- **D-009**: LLM default = Ollama local (qwen2.5:7b / llama3.1:8b), paid API env-var-gated optional. → ADR-0002
- **D-010**: Mock mode (no-LLM fallback) mandatory for every LLM-using feature. → ADR-0002
- **D-011**: Supply chain adoption gate = Scorecard ≥ 7 + signed release + dep tree audit + user approval before any `npm install`. → ADR-0002
- **D-012**: Dependency installation happens once at Phase 1 Discovery completion (single batch + lockfile commit). → ADR-0002

## 2026-05-18 (Stage 1-3 v2 accepted)

### Stage 1 Discovery decisions
- **D-101**: Adoption set = promptfoo + garak as primary (pattern extraction only, no install); llm-guard + agent-governance-toolkit demoted to reference (license / Scorecard concerns). → ADR-0003 §2
- **D-102**: Stack final lock = TypeScript on Node 20 LTS + pnpm + vitest + commander + zod. → ADR-0003 §1
- **D-103**: LLM integration default = Ollama gemma3:4b (already installed), mock fallback default in CI, paid API env-var-gated optional. → ADR-0003 §1

### Stage 2 Requirements (EARS)
- **D-201**: 31 EARS acceptance criteria across F-001 to F-005 + 7 NF criteria; AC-005-6 maps exit codes per POSIX sysexits.h; AC-NF-7 covers concurrent execution safety. → spec.md § EARS, ADR-0003 §3, §6

### Stage 3 Design tradeoffs
- **D-301**: 11 design tradeoffs ratified (Stage 3 IDs labelled D-001 .. D-011 in spec.md tradeoff table covering CLI framework, probe corpus format, SARIF emission, LlmProvider abstraction, test framework, probe execution model, channel-B mask hook, MCP schema sourcing, probe corpus versioning, config loader, logger). → spec.md § Tradeoffs, ADR-0003 §5
- **D-302**: 4 cross-cutting modules added per independent review (src/config, src/logger, src/errors, src/scanners/mcp-schema). → spec.md § File structure
- **D-303**: Independent review identified 9 gaps; all 9 accepted and integrated before Stage 3 approval (Boundary additions + 2 new EARS AC + 4 new tradeoffs + 3 Phase 1 task additions). → ADR-0003 § Context
