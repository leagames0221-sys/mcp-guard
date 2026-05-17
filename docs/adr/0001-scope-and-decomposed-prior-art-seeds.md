# ADR-0001: Scope and decomposed prior-art seeds

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: tomohiro takada

## Context

`mcp-guard` enters a crowded but rapidly evolving space (LLM/agent security). The 2026 landscape includes:

- **Defensive scanners**: protectai/llm-guard, NVIDIA/garak (LLM-focused)
- **Red-team harnesses**: promptfoo (eval + injection corpus)
- **Enterprise governance**: Microsoft Agent Governance Toolkit (OWASP 10 agentic AI)
- **Offensive frameworks**: HexStrike AI, Strix, PentAGI, BlacksmithAI

None of these target the *MCP server* configuration layer specifically, and most target enterprise scale or offensive use cases. There is a defensive gap for individual developers and SMBs deploying MCP servers.

## Decision

`mcp-guard` is scoped as a **developer-first defensive CLI** combining:

1. **MCP config scanner** (SSRF / command injection / auth gap / supply chain risk)
2. **Prompt injection red-team harness** (OWASP LLM01–10 corpus)
3. **Remediation suggester** (JSON-parseable for CI gating)

Prior art is adopted **decomposed**: we extract design patterns (CLI/yaml UX, probe/detector architecture, scanner registry, OWASP mapping) rather than forking entire codebases. Decomposition reduces supply chain blast radius and lets us tailor the UX to the target audience.

## Decomposed prior-art seeds (initial allowlist, pending security gate)

| OSS | License | Pattern adopted |
|---|---|---|
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | MIT | CLI invocation, yaml config schema, red-team plugin loader |
| [NVIDIA/garak](https://github.com/NVIDIA/garak) | Apache-2.0 | Probe → Detector → Harness 3-layer split, report aggregation |
| [protectai/llm-guard](https://github.com/protectai/llm-guard) | MIT | Scanner registry pattern, fail-fast vs warn-only operating modes |
| [microsoft/agent-governance-toolkit](https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/) | MIT | OWASP 10 agentic-AI risk mapping table |

No external code is forked or `npm install`-ed before each seed passes a security audit gate (Scorecard ≥ 7, signed releases, dependency tree review, manual user approval).

## Consequences

**Positive**:

- Clear differentiation: defensive + developer-first + MCP-specific
- Decomposed adoption keeps supply chain blast radius small
- License compatibility (MIT + Apache-2.0 both upstream-compatible with MIT downstream)

**Negative**:

- More implementation effort than forking promptfoo wholesale
- Manual probe/detector authoring required (no upstream maintenance leverage)

**Risks**:

- Prior-art coverage of MCP-specific attack surface is thin (most LLM-security OSS predates MCP popularization). Mitigation: monitor Adversa AI's monthly MCP security resource roundup.

## Alternatives considered

- **Fork promptfoo wholesale + add MCP layer**: rejected. Supply chain blast radius too large, brand dilution risk.
- **Build on Microsoft Agent Governance Toolkit**: rejected. Enterprise scale, not developer-first; license OK but operational fit poor.
- **Skip MCP scope, build LLM-only injection harness**: rejected. Already saturated (promptfoo + garak cover this well).

## References

- [LLM Security Risks in 2026 — Sombra](https://sombrainc.com/blog/llm-security-risks-2026)
- [Top MCP security resources, May 2026 — Adversa AI](https://adversa.ai/blog/top-mcp-security-resources-may-2026/)
- [AI Security Statistics 2026 — Practical DevSecOps](https://www.practical-devsecops.com/ai-security-statistics-2026-research-report/)
