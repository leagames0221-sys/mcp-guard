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
