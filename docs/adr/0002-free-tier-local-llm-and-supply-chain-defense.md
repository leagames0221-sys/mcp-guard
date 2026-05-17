# ADR-0002: Free tier only, local LLM default, supply chain defense first

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: tomohiro takada

## Context

`mcp-guard` is a portfolio-scope project for an individual developer with no commercial budget at this stage. Three operational constraints apply:

1. **No credit card / paid service**: every external dependency must work within free tiers that do not require credit card registration.
2. **Local LLM default**: when LLM inference is needed (for prompt rewriting suggestions or red-team probe generation), it must run on consumer hardware locally, not via paid APIs.
3. **Supply chain attack defense first**: the project itself is a security tool, so we cannot ship a scanner that was compromised at install time. Recent OSS supply chain incidents (Shai-Hulud worm, s1ngularity, TeamPCP) raise the bar for `npm install` discipline.

These constraints must be reflected in stack choice, CI design, and dependency adoption protocol — not bolted on later.

## Decision

### 1. External service policy

- **Allowed (free, no credit card)**: GitHub Actions (2,000 min/month free tier), GitHub Container Registry (free for public), Cloudflare Pages / Workers free tier, GitHub Pages, GitHub Codespaces (60 hr/month free), Dependabot, gitleaks, OpenSSF Scorecard public API.
- **Not allowed at this stage**: AWS / GCP / Azure (credit card required even for free tier), Snyk paid plans, Checkmarx, paid LLM APIs (OpenAI / Anthropic console accounts not yet provisioned).
- **Conditional (env-var-gated, user-explicit only)**: Anthropic API / OpenAI API via `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` swap path — never auto-called, never in default code path.

### 2. LLM stack

- **Default provider**: Ollama running locally.
  - **Primary model (Phase 1)**: `gemma3:4b` (Google, ~3.3 GB on disk, fits 8 GB RAM laptops including CPU-only).
    Already installed on the development machine — no additional download required.
  - **Alternative models (optional, install on demand)**:
    - `qwen2.5:7b` (general reasoning, ~5 GB RAM)
    - `llama3.1:8b` (Meta, comparable footprint to qwen)
  - Provider interface designed model-agnostic so swapping requires only env var change (`MCP_GUARD_OLLAMA_MODEL`).
- **Mock mode**: every LLM-consuming code path MUST have a no-LLM fallback (pure static analysis or rule-based heuristic). Mock mode is the default for CI runs.
- **Paid API swap**: implemented as a provider interface with env-var detection. When `ANTHROPIC_API_KEY` is set AND `MCP_GUARD_LLM_PROVIDER=anthropic` is explicit, swap kicks in. Default behavior never reaches this branch.

### 3. Supply chain defense protocol

Every external OSS adoption (npm package, GitHub Action, container image) goes through this gate before install:

1. **OpenSSF Scorecard score ≥ 7** verified ([scorecard.dev](https://scorecard.dev/))
2. **Signed releases** verified (Sigstore / GPG / npm provenance)
3. **Dependency tree audit** — manual review of transitive dependencies, no anonymous unsigned packages
4. **License compatibility** — Apache-2.0 / MIT / BSD only, no GPL family in dependency graph
5. **User explicit approval** before `pnpm add` / `npm install` runs

### 4. `npm install` timing rule

- Phase 0 (current): no `package.json`, no `node_modules`. Repo holds only docs + CI scaffolds.
- Phase 1 Discovery completion gate: lockfile creation happens ONCE, all production dependencies installed in a single batch, lockfile committed immediately.
- After Phase 1: dependency additions go through Dependabot PRs only, never ad-hoc `pnpm add` from a session.

### 5. CI budget discipline

- All CI workflows MUST complete within GitHub Actions free tier (2,000 min/month). Measured per push, alert if any single workflow exceeds 5 minutes.
- No matrix sprawl — Node 20 LTS only at Phase 1 launch, expand to Node 22 only after stability proven.

## Consequences

**Positive**:

- Zero operational cost during portfolio development
- Local LLM keeps user data on user hardware (privacy benefit, marketable)
- Strict supply chain discipline becomes a portfolio talking point (security tool that practices what it preaches)

**Negative**:

- Local Ollama setup is a non-zero adoption friction for users without GPUs (though qwen2.5:7b runs CPU-only on 16 GB RAM laptops)
- Mock mode adds implementation overhead (every LLM-using feature needs a fallback path)
- Manual supply chain gate slows initial development velocity

**Risks**:

- Free tier policy changes from GitHub / Cloudflare could break assumptions. Mitigation: review free tier limits quarterly.
- Local LLM quality is below frontier models. Mitigation: position outputs as "suggestions to review," not "verified findings."

## Alternatives considered

- **Cloud LLM only (Anthropic / OpenAI)**: rejected. Out of portfolio cost scope. Also creates lock-in for end users.
- **Paid SaaS scanner integration (Snyk / Checkmarx)**: rejected. Cost incompatible. Also defeats the purpose of building a competing tool.
- **Skip local LLM, pure static analysis only**: considered. Rejected because prompt injection corpus generation and remediation suggestion both benefit from LLM enrichment. Mock mode preserves this fallback as default anyway.

## References

- [OpenSSF Scorecard documentation](https://github.com/ossf/scorecard)
- [npm Provenance announcement (npm blog)](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/)
- [GitHub Actions free tier limits](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
- [Cloudflare Pages free tier](https://developers.cloudflare.com/pages/platform/limits/)
- [Ollama project](https://github.com/ollama/ollama)
