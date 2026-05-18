# ADR-0004: Golf Scanner audit outcome — reference-only

- **Status**: Accepted
- **Date**: 2026-05-19
- **Deciders**: tomohiro takada
- **Supersedes**: none
- **Builds on**: ADR-0002 (free tier + local LLM + supply chain defense)

## Context

Stage 1 Discovery (ADR-0003) seeded Golf Scanner
([golf-mcp/golf-scanner](https://github.com/golf-mcp/golf-scanner)) as a
to-be-audited prior art for the MCP-specific scanner surface. It is the
only OSS project at the time of writing that explicitly markets itself as
an MCP server vulnerability scanner across multiple IDEs, so a verdict
on whether to adopt-pattern / reference-only / drop is load-bearing for
F-001 scope decisions and the T-38 benchmark task.

ADR-0002 set the adoption gate: OSSF Scorecard ≥ 7 + signed releases +
dependency tree audit + user approval. Projects without Scorecard
coverage may pass an alternative gate: ≥ 5k stars + ≤ 90 days activity
+ reputable organisation + clean license.

## Audit findings (2026-05-19)

| Dimension | Observation | Source |
|---|---|---|
| License | Apache-2.0 | GitHub API `repos/golf-mcp/golf-scanner` |
| Stars | 7 | GitHub API (same) |
| Last activity | 2026-04-28 (≈ 3 weeks ago) | GitHub `pushed_at` |
| Archived / fork | No / no | GitHub API |
| OSSF Scorecard | Not measured (HTTP 404 from `api.securityscorecards.dev`) | OpenSSF API direct check |
| Stack | Pure Go, single static binary, ~3 dependencies | Project README |
| Telemetry | Zero (operator-stated) | Project README |
| Account requirement | None | Project README |
| Topics / claimed coverage | 7 IDEs (Claude Code / Cursor / VS Code / Windsurf / Gemini CLI / Kiro / Antigravity); 20 checks (9 offline + 11 online); 0–100 risk score with severity-weighted scoring | Project README |

## Decision

**Reference-only.** Golf Scanner does not pass the ADR-0002 adoption gate:

1. **Scorecard absent.** No OpenSSF Scorecard score is available, so the
   primary gate cannot be evaluated.
2. **Star count below alternative gate.** 7 ⋘ the 5k threshold for the
   reputation-based alternative gate. While the project is recently
   active and carries a clean license, the combined trust signal is too
   thin for code or pattern lift under ADR-0002's intent.
3. **Stack mismatch.** Golf Scanner is pure Go; `mcp-guard` is
   TypeScript / Node.js. Any lift would be conceptual rather than
   literal — the implementation surface does not transfer.

What we extract from Golf Scanner as **reference signal only** (no code,
no fork, no dep import):

- **IDE coverage surface (informational).** The 7-IDE list (Claude Code,
  Cursor, VS Code, Windsurf, Gemini CLI, Kiro, Antigravity) is useful as
  a reference set when documenting which `.mcp.json` shapes `mcp-guard`'s
  parser must handle in future work. The names are public-domain product
  identifiers; carrying them as a "compatibility roadmap" reference does
  not constitute adoption.
- **Offline vs online split (design idea).** Golf Scanner splits its 20
  checks into 9 offline + 11 online. `mcp-guard` currently emits 18 rules
  across 4 categories, all offline (static analysis only). Whether an
  online tier (querying OSV / npm registry / vendored advisories) is
  worth adding to F-001 is a future-work question; Golf Scanner's split
  is one data point informing that decision, not a template.
- **Risk-score concept (NOT adopted).** Golf Scanner produces a 0–100
  risk score per server with severity-weighted scoring and hard caps.
  `mcp-guard` deliberately stays with per-finding severity output +
  `--fail-on-severity` exit gating; a single aggregate score muddies CI
  branching ("did anything fail at-or-above critical?" is the load-bearing
  question, not "what is the rolled-up score?"). Recorded here so a future
  reviewer does not re-litigate the decision.

## Consequences

**Positive**:

- ADR-0002 gate is honoured — no code or dependency lift from a project
  that fails the trust threshold.
- Reference-only treatment preserves the option to revisit if Golf Scanner
  attracts more community signal (e.g. Scorecard coverage, stars > 5k,
  or a tagged 1.0 release).

**Negative**:

- `mcp-guard`'s `.mcp.json` shape coverage is narrower in scope than
  Golf Scanner's claimed 7-IDE set. Future parser work may need to widen
  the schema to accommodate non-Claude-Code MCP config dialects; that is
  tracked outside this ADR.

**Risks**:

- A consumer who already runs Golf Scanner and switches to `mcp-guard`
  may see different finding shapes. This is a documentation concern
  (see [docs/owasp-llm-top10-mapping.md](../owasp-llm-top10-mapping.md))
  rather than a defect — the two tools are complementary, not equivalent.

## Alternatives considered

- **Adopt-pattern (lift the 4-category scanner taxonomy from Golf
  Scanner)**: rejected. The 4 categories `mcp-guard` ships (SSRF /
  command-injection / auth-gap / supply-chain-risk) were independently
  derived from CWE + OWASP Top 10 2021 + OWASP LLM Top 10 2025; lifting
  Golf Scanner's taxonomy would (a) not improve coverage and (b) imply a
  trust inheritance the audit gate denies.
- **Drop entirely (no reference, no benchmark comparison)**: rejected.
  Even a fail-the-gate project is useful as a public reference point
  for what an MCP-specific scanner surface can look like; documenting
  the audit outcome preserves the audit trail for Phase α verifiers.

## References

- [Golf Scanner README](https://github.com/golf-mcp/golf-scanner) (accessed 2026-05-19)
- [ADR-0002](0002-free-tier-and-supply-chain.md) — adoption gate criteria
- [OpenSSF Scorecard API](https://api.securityscorecards.dev/) — Scorecard data lookup
- [CWE-918](https://cwe.mitre.org/data/definitions/918.html) — SSRF
- [CWE-77](https://cwe.mitre.org/data/definitions/77.html) — Command Injection
