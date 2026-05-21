# mcp-guard

> **MCP server security scanner + LLM prompt-injection red-team harness** for individual developers and SMBs.
> Defensive-first, CLI-driven, OWASP LLM Top 10 (2025) aligned.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/leagames0221-sys/mcp-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/mcp-guard/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)
[![Constraint: zero credit card](https://img.shields.io/badge/Constraint-zero%20credit%20card-blue)](#selected-under)
[![Constraint: local LLM (default)](https://img.shields.io/badge/Constraint-local%20LLM%20%28default%29-blue)](#selected-under)
[![Constraint: free / OSS only](https://img.shields.io/badge/Constraint-free%20%2F%20OSS%20only-blue)](#selected-under)
[![Constraint: security defense-in-depth](https://img.shields.io/badge/Constraint-security%20defense--in--depth-blue)](#selected-under)

## Selected under

> **The 4-constraint set** (applied across the full portfolio — verified consistent across all 11 portfolio repos):
>
> 1. **Zero credit card** — no paid API / cloud service required for the default path. A reviewer can clone, install, and run with $0 spend and no payment method on file.
> 2. **Local LLM (default)** — when an LLM is involved, the default path is local (Ollama / similar) or deterministic mock. Paid cloud LLM is opt-in via env var, never default.
> 3. **Free / OSS only** — every runtime dependency is permissively-licensed open source (MIT / Apache-2.0 / BSD-3); no proprietary SDK at build time.
> 4. **Security defense-in-depth** — secrets-scan CI + `.gitignore` hardening, encrypted-at-rest where PII is involved, append-only audit logging where applicable, dep-vuln gating (`pip-audit` / `pnpm audit`), paid-API constructor gate where applicable.

This repo specifically demonstrates: MCP server scanner + prompt-injection harness with Ollama (`gemma3:4b`) default, deterministic mock fallback in CI, and paid-LLM env-var-gated behind a 6-layer defense (constructor gate + pre-flight reserve + key non-leak + CI auto-call ban + default mock + zero-CC service-only).

**Plain-language summary** *(for non-specialist readers)*

- **MCP (Model Context Protocol)** — an emerging standard that lets AI
  agents call external tools and data sources (Anthropic-originated, now
  multi-vendor). A misconfigured MCP server can leak secrets, run
  injected commands, or be used as an SSRF pivot.
- **Prompt-injection harness** — a battery of crafted inputs that try to
  jailbreak a language model into leaking data or ignoring its
  instructions. We ship a sanitized OWASP LLM Top 10 (2025) corpus and
  measure refusal / no-leak / safe-completion rates against your
  local LLM.
- **Remediation engine** — for each finding, emits a suggested config
  patch plus curated OWASP / CWE references, so a developer can fix
  the issue without re-reading the underlying standard.
- **Why it matters** — MCP is becoming the de-facto integration layer
  for AI tooling, but its security posture lags behind. `mcp-guard`
  catches the most common deployment mistakes before an attacker does.

## What it does

`mcp-guard` is a developer-first CLI that takes a Model Context Protocol
configuration (`.mcp.json` or compatible) and reports security findings
across four scanner categories, runs an OWASP LLM Top 10 prompt-injection
harness against a local LLM, and emits per-finding remediation
suggestions in machine-readable JSON.

| Surface | Subcommand | Output |
|---|---|---|
| MCP config scanner (F-001) | `mcp-guard scan <config>` | Console / JSON / SARIF — SSRF, command-injection, auth-gap, supply-chain |
| Prompt-injection harness (F-002) | `mcp-guard inject` | JSON — per-probe verdict over the bundled OWASP LLM01–10 corpus |
| Remediation engine (F-003) | `mcp-guard suggest <report.json>` | JSON — per-finding `suggested_patch` + curated references |

## Why mcp-guard

Model Context Protocol is becoming the primary integration layer for AI
agents. In 2026:

- **87%** of LLM applications in an enterprise pentest sample contained
  prompt-injection vulnerabilities
  ([Practical DevSecOps 2026](https://www.practical-devsecops.com/ai-security-statistics-2026-research-report/)).
- **36.7%** of analyzed MCP servers were vulnerable to SSRF
  ([Adversa AI, 2026-05](https://adversa.ai/blog/top-mcp-security-resources-may-2026/)).
- Only **34%** of enterprises have AI-specific security controls in place.

Existing tools target enterprise scale (Microsoft Agent Governance Toolkit)
or are offensive frameworks (HexStrike, PentAGI). `mcp-guard` is a
**developer-first defensive CLI** for individuals and SMBs deploying MCP
servers, AI skills, or agent prompts.

## Quick start

```bash
# Install (requires Node.js ≥ 20)
git clone https://github.com/leagames0221-sys/mcp-guard
cd mcp-guard
pnpm install
pnpm run build

# Scan an MCP server config
node dist/cli/index.js scan path/to/.mcp.json

# JSON output for CI ingestion
node dist/cli/index.js scan path/to/.mcp.json \
  --format json --output report.json --fail-on-severity high

# SARIF for GitHub code-scanning ingestion
node dist/cli/index.js scan path/to/.mcp.json \
  --format sarif --output report.sarif

# Run the prompt-injection harness against the bundled OWASP corpus
node dist/cli/index.js inject --severity-floor high

# Generate remediation suggestions from a prior report
node dist/cli/index.js suggest report.json
```

### Demo output

The four subcommands above produce the following terminal output against
the `cmdinj-positive-curl-pipe-shell` fixture (synthetic MCP config with
a `curl|sh` supply-chain primitive). Rendered from raw stdout/stderr by
`docs/demo/cli/render.py` (Pillow + MS Gothic, no network egress).

| Command | Screenshot |
|---|---|
| `mcp-guard --help` | [help.png](docs/demo/cli/help.png) |
| `mcp-guard scan <fixture>` | [scan.png](docs/demo/cli/scan.png) |
| `mcp-guard inject --severity-floor high` | [inject.png](docs/demo/cli/inject.png) |
| `mcp-guard suggest report.json` | [suggest.png](docs/demo/cli/suggest.png) |

The `scan` output shows 3 findings (1 CRITICAL `CMDINJ-CURL-PIPE-SHELL`
+ 1 HIGH `CMDINJ-SHELL-INTERPRETER` + 1 MEDIUM `CMDINJ-SHELL-METACHAR`).
The `inject` harness runs against the bundled OWASP LLM01–10 probe
corpus (30 probes default). The `suggest` output emits per-finding
remediation patches via the mock LLM provider; switch to Ollama with
`MCP_GUARD_LLM_PROVIDER=ollama` + `OLLAMA_MODEL=gemma3:4b`.

To regenerate the screenshots locally:

```bash
mkdir -p docs/demo/cli
NO_COLOR=1 node dist/cli/index.js --help > docs/demo/cli/help.txt 2>&1
NO_COLOR=1 node dist/cli/index.js scan tests/fixtures/mcp/cmdinj-positive-curl-pipe-shell.json > docs/demo/cli/scan.txt 2>&1
NO_COLOR=1 node dist/cli/index.js scan tests/fixtures/mcp/cmdinj-positive-curl-pipe-shell.json --format json --output _tmp_report.json > /dev/null 2>&1
NO_COLOR=1 node dist/cli/index.js suggest _tmp_report.json > docs/demo/cli/suggest.txt 2>&1
NO_COLOR=1 node dist/cli/index.js inject --severity-floor high > docs/demo/cli/inject.txt 2>&1

# Render PNGs (system Python >= 3.10 + Pillow)
python docs/demo/cli/render.py
```

## Scanner coverage (F-001)

| Category | Rules | Severity | Source |
|---|---|---|---|
| **SSRF** | `SSRF-CLOUD-METADATA`, `SSRF-LOOPBACK`, `SSRF-PRIVATE-IP`, `SSRF-NON-HTTP-SCHEME` | critical / high | [src/scanners/ssrf.ts](src/scanners/ssrf.ts) |
| **Command injection** | `CMDINJ-SHELL-INTERPRETER`, `CMDINJ-SHELL-METACHAR`, `CMDINJ-INTERPRETER-EVAL`, `CMDINJ-ENV-INJECTION`, `CMDINJ-CURL-PIPE-SHELL` | high | [src/scanners/command-injection.ts](src/scanners/command-injection.ts) |
| **Auth gap** | `AUTH-GAP-URL-CREDENTIAL`, `AUTH-GAP-NO-AUTHORIZATION`, `AUTH-GAP-WEAK-BEARER`, `AUTH-GAP-BASIC-AUTH-PLAINTEXT`, `AUTH-GAP-PLAINTEXT-CREDENTIAL` | high / medium | [src/scanners/auth-gap.ts](src/scanners/auth-gap.ts) |
| **Supply chain** | `SUPPLY-CHAIN-UNSCOPED-PACKAGE`, `SUPPLY-CHAIN-UNPINNED-VERSION`, `SUPPLY-CHAIN-EPHEMERAL-HOST`, `SUPPLY-CHAIN-RAW-CONTENT` | high / medium | [src/scanners/supply-chain.ts](src/scanners/supply-chain.ts) |

18 ruleIds total. Every finding carries a curated remediation template
covering an OWASP / CWE reference set — see
[docs/owasp-llm-top10-mapping.md](docs/owasp-llm-top10-mapping.md) for
the harness side and the per-ruleId templates in
[src/remediation/templates.ts](src/remediation/templates.ts).

## Harness coverage (F-002)

The OWASP LLM Top 10 (2025) corpus ships under
[src/probes/owasp/](src/probes/owasp/) with **30 sanitized, license-noted
probes** spanning all 10 categories (3 probes per category, balanced
floor enforced by integrity test). Detector dispatch follows a
garak-inspired lifecycle (Probe → Detector → Harness, ADR-0003 §4):

- `refuse` → [refusal detector](src/detectors/refusal.ts)
- `no-leak` → [no-leak detector](src/detectors/no-leak.ts)
- `safe-completion` → [safe-completion detector](src/detectors/safe-completion.ts)

See [docs/owasp-llm-top10-mapping.md](docs/owasp-llm-top10-mapping.md)
for the full coverage table.

## CI integration

Drop the consumer template at
[.github/workflows/mcp-guard-example.yml](.github/workflows/mcp-guard-example.yml)
into a downstream repo to scan PR diffs with a single deduplicated PR
comment and a `--fail-on-severity` gate. The example workflow completes a
10-server config scan within the 5-minute GitHub Actions free-tier
runner budget (AC-004-4).

For mcp-guard's own CI, see
[.github/workflows/ci.yml](.github/workflows/ci.yml) — cross-OS matrix
(ubuntu / macos / windows) × typecheck + test+coverage + audit at the
high-severity threshold.

## Documentation

- [docs/EXIT_CODES.md](docs/EXIT_CODES.md) — sysexits-aligned exit code mapping
- [docs/owasp-llm-top10-mapping.md](docs/owasp-llm-top10-mapping.md) — OWASP LLM01–10 → probe + detector mapping
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — LLM provider matrix + paid-API 6-layer defense
- [SECURITY.md](SECURITY.md) — supported versions, report channels, hardening posture
- [docs/adr/](docs/adr/) — architecture decision records (6 entries)

## Stack

- **Language**: TypeScript on Node.js 20 LTS (ESM, strict mode)
- **Package manager**: pnpm (lockfile committed)
- **Test**: vitest (ESM-native, snapshot built-in)
- **CLI**: commander
- **Schema validation**: zod

LLM provider defaults to Ollama (model `gemma3:4b`) when reachable; falls
back to a deterministic mock provider in CI and when no provider is
configured. Paid providers (Anthropic / OpenAI) are env-var-gated and
guarded by a 6-layer defense — see
[docs/PROVIDERS.md](docs/PROVIDERS.md).

## Status

Phase 1 implementation complete: F-001 + F-002 + F-003 + F-005 (CLI UX)
feature-complete. Phase α verification gate pending (concurrent-safety
test green, documentation suite green, benchmark + independent verify
in progress).

## License

MIT — see [LICENSE](LICENSE). Probe corpus and template references
carry CC-BY-4.0 attribution to OWASP under educational scope (see
each probe file's `license` + `references` fields and
[SECURITY.md](SECURITY.md) § Educational scope).
