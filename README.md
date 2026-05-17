# mcp-guard

> **MCP server security scanner + LLM prompt injection defense lab** for individual developers and SMBs.
> Defensive-first, CLI-driven, OWASP LLM Top10 (2025) aligned.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-Phase%200%20scaffold-blue.svg)]()

## Why mcp-guard

Model Context Protocol (MCP) is becoming the primary integration layer for AI agents. In 2026:

- **87%** of LLM applications in enterprise pentest sample contained prompt injection vulnerabilities ([Practical DevSecOps 2026](https://www.practical-devsecops.com/ai-security-statistics-2026-research-report/))
- **36.7%** of analyzed MCP servers were vulnerable to SSRF ([Adversa AI MCP resources, 2026-05](https://adversa.ai/blog/top-mcp-security-resources-may-2026/))
- Only **34%** of enterprises have AI-specific security controls in place

Existing tools target enterprise scale (e.g. Microsoft Agent Governance Toolkit) or are offensive frameworks (HexStrike, PentAGI). `mcp-guard` is a **developer-first defensive CLI** for individuals and SMBs deploying MCP servers, AI skills, or agent prompts.

## Scope (Phase 0)

- **Input**: `.mcp.json` config / agent skill definition / LLM prompt fixtures
- **Output**:
  - MCP server vulnerability report (SSRF / command injection / auth gap / supply chain risk)
  - Prompt injection red-team harness result (OWASP LLM01–10 coverage)
  - Remediation suggestions (JSON-parseable for CI gating)
- **Integration**: CLI + GitHub Actions sample workflow

## Status

**Phase 0 — scaffold installed (2026-05-18).** Implementation pending Discovery (spec-driven-workflow).

## Decomposed prior art (seed list, pending security gate)

| OSS | License | Role |
|---|---|---|
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | MIT | CLI/yaml UX, red-team plugin design |
| [NVIDIA/garak](https://github.com/NVIDIA/garak) | Apache-2.0 | Probe/detector architecture |
| [protectai/llm-guard](https://github.com/protectai/llm-guard) | MIT | Scanner registry, fail-fast vs warn-only modes |
| [microsoft/agent-governance-toolkit](https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/) | MIT | OWASP 10 agentic AI mapping |

No external code is forked or pulled until Discovery stage completes prior-art audit gate.

## License

MIT — see [LICENSE](LICENSE).
