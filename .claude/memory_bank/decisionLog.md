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
- **D-012**: `npm install` happens once at Phase 1 Discovery completion (single batch + lockfile commit). → ADR-0002
