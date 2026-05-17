# Product context — mcp-guard

## Why this exists

In 2026, MCP (Model Context Protocol) has become the primary integration layer for AI agents, but security tooling for MCP servers is thin. Most LLM-security tooling targets enterprise scale (Microsoft Agent Governance Toolkit) or is offensive (HexStrike, PentAGI). Individual developers and SMBs deploying MCP servers have few defensive options.

`mcp-guard` fills this gap with a developer-first defensive CLI:

- Audit your `.mcp.json` for SSRF / command injection / auth gaps
- Stress-test your agent prompts against OWASP LLM01–10 corpus
- Get actionable remediation suggestions you can paste into your CI

## Target users

- Individual developers shipping MCP servers as part of an AI product
- SMB engineering teams adopting MCP at small-to-mid scale
- Open-source maintainers wanting to harden their MCP server before public release

**Not** the target audience: enterprise security teams (they have Microsoft Agent Governance Toolkit, Microsoft Defender for Cloud, etc. — different ergonomics, different budget).

## Differentiation

- **vs HexStrike AI / PentAGI**: defensive (not offensive), CLI (not autonomous), MCP-specific (not general LLM)
- **vs Microsoft Agent Governance Toolkit**: developer-first (not enterprise), CLI (not service), open-source MIT (not corporate-tied)
- **vs Golf Scanner**: config + runtime + prompt multi-axis (not config-only)
- **vs promptfoo**: defensive scan + remediation (not eval/red-team only), MCP-aware (not generic LLM)

## Success metrics (Phase α)

- 7/7 binary criteria in `tool_tier_rubric.md` v2.0 PASS
- ≥ 1 real-world MCP server example successfully scanned with reported TP/FP rate
- GitHub stars ≥ 50 within 30 days of PUBLIC flip (★★ stretch, not gating)
