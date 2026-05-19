# mcp-guard spec

> **Spec status**: Stage 1 Discovery + Stage 2 Requirements (EARS) + Stage 3 Design v2 (with independent-review gaps integrated) all **Accepted**.
> Canonical decision record: [docs/adr/0003-stack-adoption-and-design.md](docs/adr/0003-stack-adoption-and-design.md).
> **Phase 1 implementation feature-complete** (2026-05-19, T-01 ~ T-39 全 39 task landed on main, 673 vitest specs PASS, tsc strict green, CI ci.yml 3-OS matrix green, ADR count 6). Phase α exit gate independently verified 7/7 PASS by tier-reviewer subagent (round 2 on commit `f7c2004`); final ★★ → ★★★ promotion pending user gate per rubric § user-gate clause.

## 機能 list

- **F-001 (MCP scanner)**: `.mcp.json` config を input、 SSRF / command injection / auth gap / supply chain risk を static + lightweight runtime check で検出、 SARIF / JSON で出力
- **F-002 (Prompt injection harness)**: agent skill definition or prompt fixture を input、 OWASP LLM01–10 corpus で red-team test、 pass/fail report 出力
- **F-003 (Remediation engine)**: F-001 / F-002 検出結果に対し、 best-practice patch suggestion を生成 (JSON parseable、 CI gating 用)
- **F-004 (CI integration sample)**: GitHub Actions workflow template (PR comment + SARIF upload + fail-on-severity threshold)
- **F-005 (CLI UX)**: `mcp-guard scan <target>` / `mcp-guard inject <skill>` / `mcp-guard suggest <report>` の 3 subcommand

## 非機能要件

- **性能**: 中規模 MCP config (50 server) を 60s 以内 scan
- **セキュリティ** (operational constraints):
  - 攻撃 payload は repo 内に sanitize + license-noted のみ
  - scanner 自身が脆弱化しないよう pnpm-audit + dependency-review CI 強制
  - 取り込む外部 OSS は内部 prior-art security gate 通過済のみ (Scorecard ≥ 7 + signed release + dep tree audit + user 承認)
  - supply chain attack 防御層厳守 (Shai-Hulud worm / s1ngularity 級の最終防衛線)
  - 依存 package adoption timing = Phase 1 Discovery 完了後 1 回のみ (lockfile commit と同時、 不用意な追加禁止)
- **コスト制約** (★ 必須):
  - **クレカ要求 external service 採用 literal 禁止** (Cloudflare Pages / Workers / GitHub Actions free tier 等 クレカ不要 service のみ)
  - **外部 LLM paid API auto-call literal 禁止** (Anthropic / OpenAI 等 は env-var-gated optional のみ active、 user 明示時のみ)
  - GitHub Actions 月 2,000 分 free tier 内で全 CI 完走
- **LLM stack**:
  - **default = Ollama local** (consumer laptop 完走、 primary model = `gemma3:4b` ローカル既配備)
  - env-var-gated swap path: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 経由で paid API optional (user 明示時のみ)
  - mock mode (LLM 不使用、 pure static analysis のみ) を default fallback として常時 available
- **互換性**: Node.js 20 LTS 以上、 macOS / Linux / Windows 三 platform CI
- **規模**: 個人開発者 / SMB pipeline、 1 dev machine / 1 GitHub Actions runner で完走 (consumer hardware 完走前提)
- **license**: MIT (依存に GPL 系混入禁止、 dependency-review CI で block)

## 依存

- 外部 service: なし (default、 完全 local 実行)
- 外部 LLM API: optional (env-var-gated swap path、 default = local Ollama or mock mode)
- 他 PJ 連携: なし (Phase α は独立)

## Stack (Stage 1 Discovery で literal lock、 ADR-0003 §1)

- TypeScript on Node.js 20 LTS / pnpm / vitest / commander / zod
- Ollama (gemma3:4b) primary + mock fallback default + paid API env-var-gated optional

## EARS acceptance criteria (Stage 2、 31 件、 ADR-0003 §3)

### F-001 MCP scanner

- **AC-001-1**: WHEN user runs `mcp-guard scan <path>` with a valid `.mcp.json` THE SYSTEM SHALL emit a vulnerability report covering SSRF / command-injection / auth-gap / supply-chain-risk categories within 60 seconds for configs containing up to 50 server entries
- **AC-001-2**: IF the input file is not a valid `.mcp.json` THEN THE SYSTEM SHALL exit with non-zero status and a structured error message (machine-parseable JSON)
- **AC-001-3**: WHERE SARIF output is requested via `--format sarif` THE SYSTEM SHALL emit SARIF v2.1.0 compatible with GitHub code scanning UI
- **AC-001-4**: WHEN no vulnerabilities are detected THE SYSTEM SHALL exit with status 0 and a clean report (empty `results[]` in SARIF / JSON)
- **AC-001-5**: WHILE scanning THE SYSTEM SHALL not modify the input file under any code path

### F-002 Prompt injection harness

- **AC-002-1**: WHEN user runs `mcp-guard inject <skill>` with a skill definition THE SYSTEM SHALL execute the OWASP LLM01–10 probe corpus and report pass/fail per probe (corpus minimum 30 probes spanning all 10 categories)
- **AC-002-2**: IF the configured LLM provider is unavailable (Ollama not running, paid API key missing) THEN THE SYSTEM SHALL fall back to mock mode and emit a warning to stderr
- **AC-002-3**: WHILE the harness is running THE SYSTEM SHALL emit progress to stderr in the form `[N/M] <probe-name>` (terminal-safe, no ANSI injection)
- **AC-002-4**: WHERE `--severity <level>` is specified THE SYSTEM SHALL exit with non-zero status if any probe at or above the level fails
- **AC-002-5**: WHEN harness completes THE SYSTEM SHALL emit a summary report (JSON-parseable) listing per-probe verdict + total pass/fail counts

### F-003 Remediation engine

- **AC-003-1**: WHEN scanner or harness emits a finding THE SYSTEM SHALL produce a remediation suggestion per finding containing `{severity, category, suggested_patch, references[]}`
- **AC-003-2**: IF an LLM provider is available THEN THE SYSTEM SHALL enrich the `suggested_patch` field with model-generated text labeled `source: llm`
- **AC-003-3**: IF no LLM provider is available THEN THE SYSTEM SHALL emit a rule-based template suggestion labeled `source: template`
- **AC-003-4**: WHEN run via `mcp-guard suggest <report.json>` THE SYSTEM SHALL accept a prior scan / harness output and produce remediation without re-running detection

### F-004 CI integration sample

- **AC-004-1**: WHEN the user copies `.github/workflows/mcp-guard-example.yml` to their own repository THE SYSTEM SHALL provide a working template that runs `mcp-guard scan` on PR diffs
- **AC-004-2**: WHEN the example workflow detects findings on a PR THE SYSTEM SHALL post a single comment summary (deduped via comment marker)
- **AC-004-3**: WHERE `fail-on-severity: high` is set THE SYSTEM SHALL exit the workflow with non-zero status on any high-severity finding
- **AC-004-4**: WHILE the sample workflow runs on a GitHub Actions free-tier runner THE SYSTEM SHALL complete within 5 minutes for repositories containing up to 10 MCP server configs

### F-005 CLI UX

- **AC-005-1**: WHEN user runs `mcp-guard --help` THE SYSTEM SHALL list 3 subcommands (`scan` / `inject` / `suggest`) with one-line descriptions and one usage example each
- **AC-005-2**: WHEN user runs `mcp-guard <subcommand> --help` THE SYSTEM SHALL print subcommand-specific usage and example
- **AC-005-3**: IF an unknown subcommand or flag is given THEN THE SYSTEM SHALL exit non-zero with a did-you-mean suggestion (Levenshtein distance ≤ 3)
- **AC-005-4**: WHEN user runs `mcp-guard --version` THE SYSTEM SHALL print the package version read from `package.json`
- **AC-005-5**: WHEN running on Node.js < 20 LTS THE SYSTEM SHALL exit non-zero immediately with an actionable error message
- **AC-005-6**: WHEN any termination condition occurs THE SYSTEM SHALL exit with the literal code per the POSIX sysexits.h aligned table (`docs/EXIT_CODES.md`)

### Non-functional cross-cutting

- **AC-NF-1** (security): WHILE the CLI runs THE SYSTEM SHALL never call any paid LLM API unless BOTH the API key env var AND `MCP_GUARD_LLM_PROVIDER=<provider>` are explicitly set
- **AC-NF-2** (security): WHILE the CLI runs THE SYSTEM SHALL never read from or write to `.env` / credential files in the current working directory
- **AC-NF-3** (cost): WHEN CI executes the test suite THE SYSTEM SHALL complete within 5 minutes per platform on a GitHub Actions free-tier runner
- **AC-NF-4** (safety): WHERE a finding contains user-supplied content THE SYSTEM SHALL sanitize for terminal output (strip ANSI escape sequences, escape control chars)
- **AC-NF-5** (privacy): WHILE Ollama is the active provider THE SYSTEM SHALL never transmit user input outside `localhost:11434` (or the configured `MCP_GUARD_OLLAMA_HOST`)
- **AC-NF-6** (compat): WHERE the host OS is macOS / Linux / Windows THE SYSTEM SHALL execute all subcommands without OS-specific code paths failing (verified by CI matrix)
- **AC-NF-7** (concurrency): IF 2+ instances run concurrently THEN THE SYSTEM SHALL use process-unique temp file names AND not block on shared lockfiles AND not corrupt shared output destinations (atomic rename for emitters)
- **AC-NF-8** (cost containment): WHILE a paid LLM provider is active THE SYSTEM SHALL enforce three ceilings on every `generate()` call as a pre-flight reserve: per-call `max_tokens` (default 1024), per-process cumulative tokens (default 50,000), and per-process call count (default 50). Each ceiling is overridable via `MCP_GUARD_LLM_MAX_TOKENS_PER_CALL` / `MCP_GUARD_LLM_MAX_TOKENS_PER_RUN` / `MCP_GUARD_LLM_MAX_CALLS_PER_RUN`. When any ceiling is exceeded THE SYSTEM SHALL throw `ConfigError` BEFORE invoking `fetch`. Once any ceiling has fired THE SYSTEM SHALL poison the budget so that all subsequent calls in the same process throw without re-checking individual ceilings (defense-in-depth against attacker-driven runaway cost).

## Tradeoffs (Stage 3 Design、 11 件 D-001 〜 D-011、 ADR-0003 §5)

| ID | Decision | Adopted | Rejected | Rationale (one-line) |
|---|---|---|---|---|
| D-001 | CLI framework | commander | cac / yargs | promptfoo prior art match, ecosystem familiarity |
| D-002 | Probe corpus format | YAML, 1 probe = 1 file | mega-JSON / TS | PR-friendly diff, OWASP community convention |
| D-003 | SARIF emission | Hand-rolled (~200 LOC) | sarif-multitool / npm sarif | Supply chain blast radius minimization |
| D-004 | LlmProvider abstraction | Minimal interface | Abstract class hierarchy / adapter | Waste-zero, 4 impls explicit |
| D-005 | Test framework | vitest | jest / node:test | ESM/TS native, fast cold start |
| D-006 | Probe execution | Sequential | Parallel / worker pool | Local single-stream contention, future Phase β work |
| D-007 | Channel B mask hook | TypeScript script + local pre-commit | Bash script / hard-coded list | Cross-OS, mask externalized in gitignored file |
| D-008 | MCP schema source | Build-time fetch + vendored snapshot + CI diff | Hand-written / runtime fetch | Deterministic build + offline + traceable to upstream commit |
| D-009 | Probe corpus versioning | Per-probe `corpus_version` + `owasp_category` field | Implicit git tag / per-release lock | Explicit + machine-checkable + multi-version coexist |
| D-010 | Config loading | Hand-rolled loader (~100 LOC) + zod | cosmiconfig / dotenv | Waste-zero, zod already needed for MCP schema |
| D-011 | Logger | Hand-rolled minimal (~50 LOC) + ANSI sanitize layer | pino / winston / debug | Waste-zero, ANSI sanitize non-negotiable |

## File structure (Stage 3 Boundary、 ADR-0003 §7)

Phase 1 で新規作成する file group:

- `src/{cli,config,logger,errors,scanners,probes,detectors,harness,remediation,providers/llm,io,types}/`
- `src/scanners/mcp-schema/{snapshot.json, upstream-commit.txt, validator.ts}`
- `tests/{fixtures/{mcp,skills,prompts},unit,e2e,concurrent}/`
- `scripts/{precommit_mask_check.ts, benchmark.ts, update-mcp-schema.ts}`
- `package.json` + `pnpm-lock.yaml` + `tsconfig.json` + `vitest.config.ts` + `.npmrc` + `.editorconfig` + `SECURITY.md`
- `.github/workflows/{ci.yml, mcp-schema-drift.yml, mcp-guard-example.yml}`
- `docs/{owasp-llm-top10-mapping.md, PROVIDERS.md, EXIT_CODES.md}`

## 完了条件 (Phase α 全体 acceptance、 production-grade gate)

下記 8 件全 PASS で Phase α 完了:

- **AC-α-1**: F-001 〜 F-005 全機能 unit + e2e test PASS (coverage 80%+)
- **AC-α-2**: CI green 連続 5 commit 以上 (test + lint + audit + drift-check + (PUBLIC 後) dependency-review)
- **AC-α-3**: LICENSE + README + ADR ≥ 5 件 + SECURITY.md (Phase 1 末配備)
- **AC-α-4**: forbidden token mask hook smoke test PASS (channel B framing leak ZERO)
- **AC-α-5**: real-world fixture (公開 MCP server example) で TP/FP rate measured + documented
- **AC-α-6**: SARIF output が GitHub code scanning UI で literal 表示確認
- **AC-α-7**: independent verify PASS (Writer/Reviewer pattern subagent 経由)
- **AC-α-8** (PUBLIC 化 pre-flip task): git history sweep (git-filter-repo or BFG) で `.claude/.security_telemetry.jsonl` (commit `531203a` に literal 残存) を history から完全除去、 force push 経由で main 書き換え。 PUBLIC 化前 mandatory、 user 直命 gate 必須 (destructive op)

## 後続 (Phase β、 別 repo `sbom-pilot`)

軸 B (Supply chain / SBOM): syft + grype の decomposed prior art seed、 法規制 (改正個情法 + METI SBOM ガイドライン) tailwind 期待。 本 PJ Phase α 完了後 sequential 着手。
