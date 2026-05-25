# Security policy — mcp-guard

`mcp-guard` is a defensive-first CLI for scanning MCP server configurations and
red-teaming LLM agent skills against the OWASP LLM Top 10. We take the security
posture of this tool seriously precisely because it is itself a security tool.

## Supply-chain defense layers

Following the ongoing Shai-Hulud / Mini Shai-Hulud / TeamPCP npm worm waves
(Sep 2025 → May 2026, > 400 packages compromised across at least 5 distinct
campaigns), this repo applies the following free, no-paid-service defense
layers:

| Layer | Implementation | Effect |
| --- | --- | --- |
| Cooldown (npm side) | `.npmrc` `minimum-release-age=10080` (= 7 days) | Refuses to install any package version published less than 7 days ago. Absorbs essentially all known supply-chain attack lifetimes (axios 2026-03 = 4-5 h; Shai-Hulud TanStack 2026-05 = 22 m publish burst). |
| Cooldown (Dependabot side) | `.github/dependabot.yml` `cooldown:` with 5 / 7 / 14 day gates per semver level | Defers automated update PRs until the cooldown window clears. |
| Lifecycle script gate | `.npmrc` `ignore-scripts=true` | Disables `postinstall` / `preinstall` / `install` scripts — primary execution vector in the original Shai-Hulud worm. |
| Audit floor | `.npmrc` `audit-level=high` | Fails `pnpm audit` on any high-or-critical advisory. |
| Lockfile integrity | `pnpm install --frozen-lockfile` in CI (existing) | Verifies every package against its committed integrity hash. |
| 3-OS test matrix | CI runs ubuntu / macos / windows (existing) | Platform-specific compromises cannot land green on all three. |
| Static + dep audit | `pnpm typecheck` + `pnpm audit` + dependency-review + CodeQL (existing) | Multiple complementary scanners. |

Primary sources:

- pnpm `minimumReleaseAge` shipped in pnpm 10.16 (2025-09); default-on in pnpm 11.0 (2026-05) at 1 day.
- Dependabot `cooldown:` shipped 2025-07-01 ([GitHub Changelog](https://github.blog/changelog/2025-07-01-dependabot-supports-configuration-of-a-minimum-package-age/)).
- 7-day window rationale: [cooldowns.dev](https://cooldowns.dev/).

## Supported versions

Until the first 1.0 release, security fixes ship against `main` only.
Pre-1.0 minor versions are not maintained as separate branches.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| 0.x.x   | :white_check_mark: (fixes land on `main` only) |

## Reporting a vulnerability

If you believe you have found a security vulnerability in `mcp-guard`, please
**do not file a public GitHub issue**. Instead, use one of the channels below.

### Preferred: GitHub Security Advisories

Open a private security advisory at
<https://github.com/leagames0221-sys/mcp-guard/security/advisories/new>.
This routes the report to the maintainer privately and tracks remediation in
GitHub's coordinated-disclosure workflow.

### Alternative: email

Send a report to the GitHub-noreply address associated with the
`leagames0221-sys` account, or open a placeholder issue tagged
`security-contact-please` (without details) and the maintainer will respond
with a private channel.

### What to include

- Affected version (commit SHA or release tag)
- Reproduction steps or proof-of-concept
- Expected vs. observed behavior
- Suggested remediation (optional)

### Service-level expectations

- **Acknowledgment**: within 5 business days of report
- **Initial triage**: within 10 business days (severity + remediation plan)
- **Fix landing**: severity-dependent — high/critical aim for 30 days,
  moderate aim for 60 days, low best-effort

These are aspirational; this project is maintained on a personal-time basis
and the SLA is not contractual.

## Scope

In scope:

- The `mcp-guard` CLI itself (`src/cli/**`)
- The scanner / detector / harness / remediation engines (`src/scanners/**`,
  `src/detectors/**`, `src/harness/**`, `src/remediation/**`)
- Configuration loading and credential-handling paths (`src/config/**`)
- LLM provider clients (`src/providers/llm/**`)
- The published npm package supply chain (build outputs in `dist/**`)

Out of scope:

- Vulnerabilities in upstream dependencies that are tracked separately upstream
  (please report to the relevant maintainer; we will pick up the patch via our
  dependency-review CI)
- Misuse of the tool as an attack instrument against systems you do not own
  (this tool is intended for defensive use against your own MCP servers and
  agents; offensive use against third-party systems is not a vulnerability in
  this project)
- Issues that require a malicious local user with write access to the user's
  own `.mcp.json` or skill definitions (the tool consumes those files as
  trusted input; tamper protection is the user's responsibility)

## Hardening posture

`mcp-guard` follows several supply-chain and runtime-hardening conventions:

- **Pinned dependencies**: `pnpm-lock.yaml` is committed and refreshed only via
  the dependency-review CI gate
- **Engine gate**: Node 20 LTS minimum enforced via `engines.node` plus
  `.npmrc` `engine-strict=true`
- **No paid-API auto-call**: paid LLM provider clients refuse to construct
  unless both an API key env var AND `MCP_GUARD_LLM_PROVIDER=<provider>` are
  set explicitly (per AC-NF-1)
- **No credential-file reads**: the CLI does not read from `.env` or other
  credential paths in the current working directory (per AC-NF-2)
- **Localhost-only LLM by default**: the Ollama provider talks only to
  `localhost:11434` (or the configured `MCP_GUARD_OLLAMA_HOST`) and never
  forwards prompts to remote endpoints implicitly (per AC-NF-5)
- **Output sanitization**: ANSI escape sequences and control chars are
  stripped from user-supplied content before terminal emission (per AC-NF-4)
- **Atomic file emission**: report writers use temp+rename to avoid partial-
  write corruption under concurrent execution (per AC-NF-7)
- **Build-script denial by default**: `pnpm-workspace.yaml`
  `onlyBuiltDependencies=[]` blocks all post-install scripts unless explicitly
  approved per package
- **Supply-chain audit floor**: CI fails on `pnpm audit --audit-level=high`

## Coordinated disclosure

If you report a vulnerability and we coordinate a fix, we will credit you in
the release notes unless you ask otherwise. Embargo windows are negotiated
case-by-case.

## License

This project and its security policy are licensed under MIT.
