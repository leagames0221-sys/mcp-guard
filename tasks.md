# mcp-guard — Stage 4 Tasks (WBS + Boundary/Depends + AC mapping)

> **Spec status**: Stage 4 Tasks **DRAFT — user approval pending**.
> Input: Stage 1 Discovery + Stage 2 Requirements (31 EARS AC) + Stage 3 Design v2 (11 tradeoffs + 9 gaps integrated), all consolidated in [docs/adr/0003-stack-adoption-and-design.md](docs/adr/0003-stack-adoption-and-design.md).
> Approval gate: Spec-Driven Workflow Stage 4 must clear user review before Phase 1 implementation kickoff. Stage skip = workflow 破綻 (skill § 禁止事項).

---

## WBS overview

39 tasks, grouped into 9 layers, sequenced by build dependency:

| Layer | Tasks | Goal |
|---|---|---|
| L0 Foundation | T-01 ~ T-05 | Dependency adoption + toolchain + channel-B guard |
| L1 Cross-cutting | T-06 ~ T-09 | `src/{errors,logger,config,scanners/mcp-schema}/` |
| L2 LlmProvider | T-10 ~ T-13 | `src/providers/llm/` 4 impls |
| L3 I/O | T-14 ~ T-17 | `src/io/{parsers,emitters}/` |
| L4 Scanner (F-001) | T-18 ~ T-22 | `src/scanners/` + 4 detectors |
| L5 Harness (F-002) | T-23 ~ T-27 | `src/{probes,detectors,harness}/` |
| L6 Remediation (F-003) | T-28 ~ T-29 | `src/remediation/` |
| L7 CLI (F-005) | T-30 ~ T-32 | `src/cli/` commander wire-up |
| L8 CI (F-004) | T-33 ~ T-35 | `.github/workflows/*` |
| L9 Phase α gate | T-36 ~ T-39 | concurrency + docs + bench + independent verify |

Build order = strict topological: L0 → L1 → L2/L3 (parallelable) → L4/L5/L6 (parallelable after L2+L3) → L7 → L8 → L9.

---

## L0 Foundation

### T-01: Dependency adoption single batch
- _Boundary:_ create `package.json`, `pnpm-lock.yaml`, `.npmrc` (engine-strict)
- _Depends:_ none
- _AC:_ AC-NF-3 (CI < 5 min), AC-NF-6 (cross-OS install reproducibility), ADR-0002 § supply-chain-defense
- _Verify:_ `pnpm install --frozen-lockfile` reproduces, `pnpm audit` 0 high, manual check that `pnpm why <dep>` shows no unexpected transitives
- _Notes:_ single batch per spec.md § cost-constraint (依存追加禁止 except this task); deps = `commander`, `zod`, `vitest`, `@vitest/coverage-v8`, `typescript`, `@types/node`, `tsx`, `yaml` ([eemeli/yaml](https://github.com/eemeli/yaml), ISC license, required for D-002 probe corpus format); pre-commit-hook locally via existing `.pre-commit-config.yaml` (already committed); LLM client = stdlib `fetch` against `localhost:11434` (no Ollama npm SDK, waste-zero principle); **lint tool 不採用** = Phase α は `pnpm tsc --noEmit` (型 check) + `pnpm vitest run` (test) で品質担保、 eslint は Phase β 以降に複雑度上がってきたら別 batch 起票 (waste-zero principle)

### T-02: TypeScript + vitest + editor toolchain
- _Boundary:_ create `tsconfig.json`, `vitest.config.ts` (with `coverage.thresholds.{lines,functions,branches,statements} = 80` + `provider: 'v8'` + `reporter: ['text', 'json-summary', 'html']`), `.editorconfig`
- _Depends:_ T-01
- _AC:_ D-005 (vitest), AC-NF-6 (cross-OS), AC-α-1 (coverage ≥ 80% threshold gate wired here, verified at T-39)
- _Verify:_ `pnpm tsc --noEmit` green on empty src/; `pnpm vitest run` 0 tests, exits 0; `pnpm vitest run --coverage` produces coverage report under `coverage/` with thresholds literal applied (will fail until tests reach 80%, intentional gate)

### T-03: package.json scripts + Node engine gate
- _Boundary:_ edit `package.json` scripts block + `engines.node` field
- _Depends:_ T-02
- _AC:_ AC-005-4 (`--version`), AC-005-5 (Node < 20 exit non-zero)
- _Verify:_ `engines.node = ">=20.0.0"` + `.npmrc` `engine-strict=true` literal; downgrade simulation via `nvm use 18 && pnpm install` returns ENOTSUP

### T-04: SECURITY.md
- _Boundary:_ create `SECURITY.md`
- _Depends:_ none
- _AC:_ AC-α-3 (SECURITY.md required for Phase α gate)
- _Verify:_ file system check — exists at repo root, contains report channel + SLA + scope
- _Notes:_ G-7 gap integration from Stage 3 independent review

### T-05: Channel-B mask precommit hook
- _Boundary:_ create `scripts/precommit_mask_check.ts`; wire into existing `.pre-commit-config.yaml`
- _Depends:_ T-01, T-02
- _AC:_ AC-α-4 (mask hook smoke test PASS, channel-B leak ZERO), D-007
- _Verify:_ unit test (T-05 will add `tests/unit/precommit_mask_check.test.ts`); smoke = stage a file containing a sample forbidden token → commit blocked, no token leaked into git history
- _Notes:_ mask list source = `.claude/internal_notes.md` (gitignored); script must load via `fs.readFileSync`, fail closed if absent

---

## L1 Cross-cutting modules

### T-06: src/errors/ typed hierarchy + exit code mapping
- _Boundary:_ create `src/errors/index.ts`, `src/errors/types.ts`; create `docs/EXIT_CODES.md`
- _Depends:_ T-02
- _AC:_ AC-005-6 (sysexits.h-aligned exit codes per ADR-0003 §6)
- _Verify:_ unit test `tests/unit/errors.test.ts` — each `McpGuardError` subclass maps to documented exit code; doc table matches code constants
- _Notes:_ exports `UsageError` (64), `DataFormatError` (65), `InternalError` (70), `IoError` (74), `ConfigError` (78), `FindingsExceedThresholdError` (1), `InvalidInputError` (2)

### T-07: src/logger/ minimal logger + ANSI sanitize
- _Boundary:_ create `src/logger/index.ts`, `src/logger/sanitize.ts`
- _Depends:_ T-02
- _AC:_ AC-NF-4 (ANSI sanitize for user-supplied content), D-011 (~50 LOC hand-rolled)
- _Verify:_ unit tests `tests/unit/logger.test.ts` + `tests/unit/sanitize.test.ts` — control char strip + ANSI escape strip + level filter (`debug`/`info`/`warn`/`error`); coverage 100% on this module
- _Notes:_ no pino/winston (D-011); progress writes via `process.stderr.write` only (AC-002-3)

### T-08: src/config/ loader + zod schemas
- _Boundary:_ create `src/config/index.ts`, `src/config/schema.ts`, `src/config/precedence.ts`; create `src/types/index.ts` (shared)
- _Depends:_ T-06, T-07
- _AC:_ AC-NF-1 (paid API guard via `MCP_GUARD_LLM_PROVIDER` + env key both required), AC-NF-2 (no `.env` / credential reads), D-010 (~100 LOC hand-rolled + zod)
- _Verify:_ unit tests on precedence (CLI flag > env > config file > default); AC-NF-2 fuzz: set `.env` in tempdir → assert no read syscalls hit it (mock `fs.readFileSync` spy)
- _Notes:_ no cosmiconfig / dotenv (D-010)

### T-09: src/scanners/mcp-schema/ snapshot + validator + drift workflow
- _Boundary:_ create `src/scanners/mcp-schema/snapshot.json`, `src/scanners/mcp-schema/upstream-commit.txt`, `src/scanners/mcp-schema/validator.ts`; create `scripts/update-mcp-schema.ts`; create `.github/workflows/mcp-schema-drift.yml`; create `docs/adr/0005-mcp-spec-upstream-pin.md` (ADR documenting the chosen commit SHA + rationale + drift policy)
- _Depends:_ T-08
- _AC:_ D-008 (build-time fetch + vendored snapshot + CI diff), AC-001-2 (invalid input rejection feeds into this validator), AC-α-3 (ADR count — contributes ADR-0005 to reach ≥ 5 件)
- _Verify:_ snapshot.json validates a known-good `.mcp.json` fixture; upstream-commit.txt contains a literal commit SHA pinned to https://github.com/modelcontextprotocol/specification; drift workflow runs `update-mcp-schema.ts` and diffs against committed snapshot, fails PR on mismatch; ADR-0005 lists chosen SHA + selection criteria + re-pin protocol
- _Notes:_ G-4 gap; resolves activeContext.md § Open questions item 2 (MCP spec upstream commit pin selection) via ADR-0005

---

## L2 LlmProvider layer

### T-10: src/providers/llm/ interface
- _Boundary:_ create `src/providers/llm/types.ts` (LlmProvider interface)
- _Depends:_ T-06, T-07, T-08
- _AC:_ D-004 (minimal interface, 4 impls explicit)
- _Verify:_ tsc strict pass; interface = `{ name: string; generate(prompt: string, opts?): Promise<string>; health(): Promise<boolean> }`
- _Notes:_ no abstract class, no adapter (D-004 rejected)

### T-11: Mock provider (mandatory fallback)
- _Boundary:_ create `src/providers/llm/mock.ts`
- _Depends:_ T-10
- _AC:_ AC-002-2 (mock fallback on LLM unavailable), AC-NF-3 (CI default = mock, no network)
- _Verify:_ unit test — mock returns deterministic canned responses keyed by prompt hash; health() always true

### T-12: Ollama provider
- _Boundary:_ create `src/providers/llm/ollama.ts`
- _Depends:_ T-10, T-11
- _AC:_ AC-NF-5 (Ollama localhost only, configurable via `MCP_GUARD_OLLAMA_HOST`), AC-002-2 (fallback to mock if Ollama not running)
- _Verify:_ unit test — health() probes `${host}/api/tags`, returns false on connection refused; default host = `http://localhost:11434`; generate() POSTs `/api/generate` with model = `gemma3:4b`
- _Notes:_ no Ollama SDK npm dep (waste-zero principle); stdlib `fetch` only

### T-13: Paid API provider (env-var-gated)
- _Boundary:_ create `src/providers/llm/anthropic.ts`, `src/providers/llm/openai.ts`
- _Depends:_ T-10, T-11
- _AC:_ AC-NF-1 (paid API requires BOTH env key AND explicit provider flag), AC-NF-3 (no auto-call in CI)
- _Verify:_ unit test — construct with no env vars → throws `ConfigError`; construct with only env key → throws (provider flag missing); construct with both → succeeds; integration test stubbed via mock HTTP fixture (no real API call)
- _Notes:_ Anthropic API auto-call literal 禁止 per memory § cross-PJ AI 行動 rule + spec.md cost-constraint

---

## L3 I/O layer

### T-14: src/io/parsers/ — .mcp.json parser
- _Boundary:_ create `src/io/parsers/mcp-config.ts`
- _Depends:_ T-09 (uses validator)
- _AC:_ AC-001-2 (invalid `.mcp.json` → non-zero exit + machine-parseable JSON error), AC-001-5 (input file never modified)
- _Verify:_ unit test — round-trip on valid fixtures `tests/fixtures/mcp/valid-*.json`; malformed input throws `InvalidInputError` with structured `{error, path, line, col}`; `fs.writeFileSync` spy asserts zero writes to input path

### T-15: src/io/emitters/ — JSON emitter (atomic)
- _Boundary:_ create `src/io/emitters/json.ts`, `src/io/emitters/atomic.ts`
- _Depends:_ T-06, T-07
- _AC:_ AC-NF-7 (atomic rename for concurrent safety), AC-001-4 (clean report = empty `results[]`)
- _Verify:_ unit test — write to temp path + rename to final; concurrent test (2 instances writing same target) asserts no truncation; use `crypto.randomUUID()` for temp suffix

### T-16: src/io/emitters/ — SARIF v2.1.0 emitter
- _Boundary:_ create `src/io/emitters/sarif.ts`
- _Depends:_ T-15
- _AC:_ AC-001-3 (SARIF v2.1.0 GitHub-code-scanning-compatible), D-003 (hand-rolled ~200 LOC, no sarif-multitool / npm sarif)
- _Verify:_ unit test against SARIF v2.1.0 JSON schema (vendored copy under `tests/fixtures/sarif-schema.json`); AC-α-6 verification deferred to T-39 (GitHub UI literal display)

### T-17: src/io/emitters/ — console emitter
- _Boundary:_ create `src/io/emitters/console.ts`
- _Depends:_ T-07 (uses sanitize)
- _AC:_ AC-NF-4 (ANSI sanitize), AC-002-3 (progress `[N/M] <probe-name>` to stderr, terminal-safe)
- _Verify:_ unit test — control char input → stripped; ANSI input → stripped; TTY vs non-TTY both safe

---

## L4 Scanner layer (F-001)

### T-18: src/scanners/ registry pattern
- _Boundary:_ create `src/scanners/index.ts`, `src/scanners/types.ts`
- _Depends:_ T-09, T-14
- _AC:_ AC-001-1 (4 categories: SSRF / command-injection / auth-gap / supply-chain-risk)
- _Verify:_ unit test — registry returns 4 scanner instances; each implements `{ category, scan(config): Finding[] }`

### T-19: SSRF detector
- _Boundary:_ create `src/scanners/ssrf.ts`
- _Depends:_ T-18
- _AC:_ AC-001-1 (SSRF category)
- _Verify:_ unit test against `tests/fixtures/mcp/ssrf-positive-*.json` + `ssrf-negative-*.json`; ≥ 3 positive + 3 negative fixtures

### T-20: Command injection detector
- _Boundary:_ create `src/scanners/command-injection.ts`
- _Depends:_ T-18
- _AC:_ AC-001-1 (command-injection category)
- _Verify:_ unit test against `tests/fixtures/mcp/cmdinj-positive-*.json` + negatives; ≥ 3 each

### T-21: Auth gap detector
- _Boundary:_ create `src/scanners/auth-gap.ts`
- _Depends:_ T-18
- _AC:_ AC-001-1 (auth-gap category)
- _Verify:_ unit test against `tests/fixtures/mcp/auth-gap-*.json`; ≥ 3 each

### T-22: Supply chain risk detector + F-001 e2e
- _Boundary:_ create `src/scanners/supply-chain.ts`; create `tests/e2e/scan.test.ts`
- _Depends:_ T-19, T-20, T-21, T-15, T-16, T-17
- _AC:_ AC-001-1 (supply-chain-risk + 60s/50-server perf), AC-001-3 (SARIF), AC-001-4 (clean report), AC-001-5 (no input mod)
- _Verify:_ e2e — generate synthetic 50-server `.mcp.json` → measure scan time < 60s; output validates against SARIF schema; input file hash unchanged pre/post

---

## L5 Probe/Detector/Harness layer (F-002)

### T-23: src/probes/ corpus loader
- _Boundary:_ create `src/probes/loader.ts`, `src/probes/types.ts`; create `tests/fixtures/prompts/` seed structure
- _Depends:_ T-08
- _AC:_ D-002 (YAML, 1 probe = 1 file), D-009 (per-probe `corpus_version` + `owasp_category`)
- _Verify:_ unit test — loader rejects probe missing `corpus_version` or `owasp_category`; YAML parse via `yaml` dep (T-01 で batch 投入済); fixture round-trip preserves key order
- _Notes:_ YAML parser = `yaml` (eemeli/yaml, ISC license), T-01 で adopt 済 — D-002 literal lock を変更しない (Stage 3 へ revert 回避)

### T-24: OWASP LLM01–10 probe corpus
- _Boundary:_ create `src/probes/owasp/llm0{1..10}/*.{yaml|json}` (≥ 30 files total)
- _Depends:_ T-23
- _AC:_ AC-002-1 (corpus ≥ 30 probes spanning all 10 categories)
- _Verify:_ file system check — `find src/probes/owasp -name '*.yaml' -o -name '*.json' | wc -l ≥ 30`; loader test asserts all 10 categories present; per-probe `corpus_version=1` literal
- _Notes:_ educational scope only, sanitized + license-noted per spec.md § security; payloads referenced via OWASP LLM Top 10 doc (citation in each probe file front-matter)

### T-25: src/detectors/ detector layer
- _Boundary:_ create `src/detectors/index.ts`, `src/detectors/types.ts`, individual detector files
- _Depends:_ T-23
- _AC:_ garak 3-layer architecture (Probe → Detector → Harness, ADR-0003 §4)
- _Verify:_ unit test — each detector has `{ name, evaluate(probeOutput): Verdict }`; verdict shape = `{pass: boolean, score: number, reason: string}`

### T-26: src/harness/ sequential executor
- _Boundary:_ create `src/harness/index.ts`, `src/harness/runner.ts`
- _Depends:_ T-10, T-11, T-25
- _AC:_ AC-002-2 (mock fallback), AC-002-3 (stderr progress), AC-002-4 (`--severity` exit gate), D-006 (sequential)
- _Verify:_ unit test — provider unavailable → mock fallback + warning to stderr; progress emitted in `[N/M]` format; severity gate logic correct (any fail at-or-above → non-zero)

### T-27: F-002 e2e
- _Boundary:_ create `tests/e2e/inject.test.ts`
- _Depends:_ T-24, T-26, T-15
- _AC:_ AC-002-1, AC-002-5 (summary report JSON-parseable, per-probe verdict + totals)
- _Verify:_ e2e — run harness against fixture skill, assert summary report shape matches spec; assert ≥ 30 probes executed; assert all 10 categories represented

---

## L6 Remediation engine (F-003)

### T-28: Rule-based template remediation
- _Boundary:_ create `src/remediation/index.ts`, `src/remediation/templates.ts`
- _Depends:_ T-22 (consumes scanner findings)
- _AC:_ AC-003-1 (per-finding `{severity, category, suggested_patch, references[]}`), AC-003-3 (`source: template` label when no LLM)
- _Verify:_ unit test — each scanner category has a template; output shape matches AC-003-1 schema

### T-29: LLM-enriched remediation + suggest subcommand
- _Boundary:_ extend `src/remediation/index.ts`; create `src/cli/suggest.ts`
- _Depends:_ T-28, T-12, T-11
- _AC:_ AC-003-2 (`source: llm` enrichment when provider available), AC-003-4 (`suggest <report.json>` accepts prior output)
- _Verify:_ unit test — provider available → enriched output labeled `source: llm`; provider unavailable → falls back to template; `suggest` subcommand parses prior scan report and emits remediation without re-running detection

---

## L7 CLI layer (F-005)

### T-30: src/cli/ commander wire-up
- _Boundary:_ create `src/cli/index.ts`, `src/cli/scan.ts`, `src/cli/inject.ts`
- _Depends:_ T-22, T-27, T-29
- _AC:_ AC-005-1 (3 subcommands + descriptions + examples), AC-005-2 (subcommand --help), AC-005-4 (--version reads package.json), D-001 (commander)
- _Verify:_ snapshot test — `mcp-guard --help` output matches expected; `mcp-guard scan --help` likewise; `--version` matches package.json field

### T-31: did-you-mean unknown subcommand handler
- _Boundary:_ extend `src/cli/index.ts` (enable commander's built-in `showSuggestionAfterError(true)` + tune suggestion threshold to AC-005-3 distance ≤ 3)
- _Depends:_ T-30
- _AC:_ AC-005-3 (Levenshtein distance ≤ 3)
- _Verify:_ unit test — `mcp-guard scn` → suggests `scan`; `mcp-guard xxxxxxxxxx` (distance > 3) → no suggestion, plain error
- _Notes:_ commander.js built-in `showSuggestionAfterError()` is the canonical mechanism ([commander.js README § display-help-after-errors](https://github.com/tj/commander.js#display-help-after-errors)) — D-001 で commander 採用済、 自前 Levenshtein 実装は waste-zero principle 違反のため避ける。 commander 内部 suggestion algorithm が distance ≤ 3 を満たすことを T-31 verify 内で literal 確認、 満たさない edge case が見つかった場合のみ最小限の自前 filter を追加

### T-32: Node version gate + exit code wire-up
- _Boundary:_ create `src/cli/node-version-check.ts`; wire into `src/cli/index.ts` as first executable line
- _Depends:_ T-06, T-30
- _AC:_ AC-005-5 (Node < 20 → non-zero exit + actionable error), AC-005-6 (all termination paths use codes per `docs/EXIT_CODES.md`)
- _Verify:_ unit test (mock `process.version`); integration test — simulate Node 18 via shebang trick or env var; exit code matches sysexits.h table

---

## L8 CI integration (F-004)

### T-33: ci.yml — typecheck + test + audit + cross-OS matrix
- _Boundary:_ create `.github/workflows/ci.yml` (existing `drift-check.yml`, `dependency-review.yml`, `dependabot.yml` untouched)
- _Depends:_ T-22, T-27, T-29, T-32
- _AC:_ AC-NF-3 (CI < 5 min/runner), AC-NF-6 (macOS / Linux / Windows matrix), AC-α-2 (5 連続 green CI commits — stream condition, accumulates across L8/L9 commits, literal verified at T-39 timepoint)
- _Verify:_ CI actual run on PR — green on all 3 OSes, total wall-clock < 5 min/runner; pipeline steps = `pnpm install --frozen-lockfile` → `pnpm tsc --noEmit` (type check) → `pnpm vitest run --coverage` (test + coverage threshold) → `pnpm audit --audit-level=high` (supply chain)
- _Notes:_ lint tool 不採用 (T-01 § Notes と整合)、 `pnpm tsc --noEmit` で型 check 担保; pnpm-audit threshold = high; license check via dep tree (no GPL transitives)

### T-34: mcp-guard-example.yml — consumer-facing template
- _Boundary:_ create `.github/workflows/mcp-guard-example.yml`
- _Depends:_ T-22, T-33
- _AC:_ AC-004-1 (working template scans PR diffs), AC-004-2 (single deduped PR comment), AC-004-3 (`fail-on-severity: high` non-zero exit), AC-004-4 (free-tier 10-config in < 5 min)
- _Verify:_ apply template to a test fixture repo (sub-task; can be a sibling sandbox repo), confirm comment + dedupe behavior

### T-35: mcp-schema-drift.yml refinement
- _Boundary:_ verify `.github/workflows/mcp-schema-drift.yml` (created T-09) on PR
- _Depends:_ T-09, T-33
- _AC:_ D-008 (drift detection blocks merge on schema change)
- _Verify:_ flip upstream-commit.txt SHA in a PR → workflow fails; revert → green

---

## L9 Phase α gate

### T-36: Concurrency safety verification
- _Boundary:_ create `tests/concurrent/concurrent.test.ts`
- _Depends:_ T-15, T-22, T-27
- _AC:_ AC-NF-7 (2+ instances → process-unique temp files, no shared lockfile block, atomic emitter rename)
- _Verify:_ test spawns 4 concurrent `mcp-guard scan` against same output path → all 4 succeed, final file is one of the 4 (no truncation, no interleave)

### T-37: Documentation suite
- _Boundary:_ create `docs/owasp-llm-top10-mapping.md`, `docs/PROVIDERS.md`; verify `docs/EXIT_CODES.md` (T-06); refresh `README.md`
- _Depends:_ T-29, T-32
- _AC:_ AC-α-3 (LICENSE + README + ADR ≥ 5 + SECURITY.md); ADR count check at this stage (0001/0002/0003 + 2 more from Phase 1 design decisions encountered during impl)
- _Verify:_ file system check + README cross-references all 3 subcommands + each docs/ file linked

### T-38: Real-world benchmark + Golf Scanner audit
- _Boundary:_ create `scripts/benchmark.ts`; create `docs/BENCHMARK.md`; create `docs/adr/0004-golf-scanner-audit-outcome.md` (records Scorecard + license + adoption verdict)
- _Depends:_ T-30
- _AC:_ AC-α-3 (ADR count — contributes ADR-0004 toward ≥ 5 件 target), AC-α-5 (real-world MCP server example TP/FP rate measured + documented), G-6 gap (Golf Scanner audit)
- _Verify:_ benchmark script outputs TP/FP table for ≥ 1 public MCP server config sample; ADR-0004 records Golf Scanner Scorecard + license + adoption verdict (3 outcomes possible: adopt-pattern / reference-only / drop)

### T-39: Independent verify + Phase α exit
- _Boundary:_ no new code; invoke `Agent` with `subagent_type: tier-reviewer` against `tool_tier_rubric.md` v2.0
- _Depends:_ T-33, T-34, T-35, T-36, T-37, T-38
- _AC:_ AC-α-1 (coverage ≥ 80% — verify `pnpm vitest run --coverage` 結果が T-02 で設定した thresholds を passing 状態), AC-α-2 (5 連続 green CI commits — **stream condition**, T-33 以降の L8/L9 commit 累積で逐次 accumulate、 T-39 時点で `git log --oneline` + GitHub Actions API で literal 連続 5 件 verify), AC-α-4 (mask hook smoke), AC-α-6 (SARIF in GitHub UI literal display — repo PUBLIC 化前は code scanning UI 利用不可なため PRIVATE 状態でも GitHub Actions log の SARIF upload step success で代替 verify、 PUBLIC 化後に UI literal 表示 final verify), AC-α-7 (Writer/Reviewer independent verify PASS)
- _Verify:_ tier-reviewer subagent returns 7/7 binary criteria PASS literal; user gate approves Phase α exit (per rubric § user-gate, AI 自己 claim 禁止)
- _Notes:_ AC-α-8 (git history sweep of `.security_telemetry.jsonl` commit `531203a`) is a **separate destructive op** — runs only after PUBLIC 化判断 by user, NOT part of Phase α completion gate itself; ADR-0004 (T-38) + ADR-0005 (T-09) で AC-α-3 「ADR ≥ 5 件」 達成 (0001+0002+0003+0004+0005)

---

## AC coverage matrix (31 EARS AC → tasks)

| AC | Task(s) |
|---|---|
| AC-001-1 | T-18, T-19, T-20, T-21, T-22 |
| AC-001-2 | T-09, T-14 |
| AC-001-3 | T-16, T-22 |
| AC-001-4 | T-15, T-22 |
| AC-001-5 | T-14, T-22 |
| AC-002-1 | T-24, T-27 |
| AC-002-2 | T-11, T-12, T-26 |
| AC-002-3 | T-17, T-26 |
| AC-002-4 | T-26 |
| AC-002-5 | T-27 |
| AC-003-1 | T-28 |
| AC-003-2 | T-29 |
| AC-003-3 | T-28 |
| AC-003-4 | T-29 |
| AC-004-1 | T-34 |
| AC-004-2 | T-34 |
| AC-004-3 | T-34 |
| AC-004-4 | T-34 |
| AC-005-1 | T-30 |
| AC-005-2 | T-30 |
| AC-005-3 | T-31 |
| AC-005-4 | T-03, T-30 |
| AC-005-5 | T-03, T-32 |
| AC-005-6 | T-06, T-32 |
| AC-NF-1 | T-08, T-13 |
| AC-NF-2 | T-08 |
| AC-NF-3 | T-01, T-11, T-33 |
| AC-NF-4 | T-07, T-17 |
| AC-NF-5 | T-12 |
| AC-NF-6 | T-01, T-02, T-33 |
| AC-NF-7 | T-15, T-36 |

→ all 31 AC literal mapped to ≥ 1 task. No orphan AC.

---

## Tradeoff coverage (D-001 ~ D-011 → tasks)

| Decision | Task |
|---|---|
| D-001 commander | T-30 |
| D-002 YAML probes | T-23 |
| D-003 hand-rolled SARIF | T-16 |
| D-004 minimal LlmProvider | T-10 |
| D-005 vitest | T-02 |
| D-006 sequential harness | T-26 |
| D-007 TS mask hook | T-05 |
| D-008 vendored MCP schema + drift CI | T-09, T-35 |
| D-009 per-probe corpus_version | T-23, T-24 |
| D-010 hand-rolled config loader | T-08 |
| D-011 hand-rolled logger + ANSI sanitize | T-07 |

→ all 11 tradeoffs literal mapped.

---

## Phase α completion AC mapping (AC-α-1 ~ AC-α-8)

| Phase α AC | Task |
|---|---|
| AC-α-1 (coverage ≥ 80%) | T-39 (verify); upstream = every L1-L8 task |
| AC-α-2 (5 green CI commits) | T-39 (verify); upstream = T-33 |
| AC-α-3 (LICENSE + README + ADR ≥ 5 + SECURITY.md) | T-04, T-09 (ADR-0005), T-37, T-38 (ADR-0004) |
| AC-α-4 (mask hook smoke) | T-05, T-39 |
| AC-α-5 (real-world TP/FP measured) | T-38 |
| AC-α-6 (SARIF in GitHub UI) | T-16, T-39 |
| AC-α-7 (Writer/Reviewer independent verify) | T-39 |
| AC-α-8 (history sweep, destructive op) | **out of scope for Stage 4** — separate user-gated destructive op before PUBLIC flip |

---

## Forbidden during Phase 1 implementation

- 依存 package を T-01 以外で追加 (per spec.md § cost-constraint + internal package-adoption gate)
- promptfoo / garak / llm-guard / agent-governance-toolkit を install / fork (decomposed prior art — pattern 抽出 only, install ZERO per ADR-0002)
- agent-governance-toolkit を実 pull (Scorecard 6.5 + 30 vulns, reference only, ADR-0003 §2)
- Stack 再議 (Stage 1 で literal lock per CLAUDE.md § Stack)
- channel B 越境 commit (内部 infra 用語 / 漢字名 / 過去職歴 / 顧客名、 precommit hook で block per T-05)
- Stage 4 飛ばして実装着手 (skill § 禁止事項)
- 絶対 enforcement 禁止 phrase の literal 出力 (cross-PJ universal, abstract reference のみ可)
- paid LLM API auto-call (AC-NF-1 + memory § Anthropic API 自動 call 禁止)
- destructive op without explicit user gate (internal destructive-op autonomy ban) — applies especially to AC-α-8 history sweep

---

## Reviewer gate (per skill § Implementation phase の規律)

各 task 完了時:

1. **Pre-condition**: Boundary 内 file のみ touch (Forbidden 越境ゼロ、 git diff で literal verify)
2. **Verify**: verify-priority order — file system check > commandlet (`pnpm tsc --noEmit`, `pnpm vitest run`) > automation test > log Read; PJ 固有 = SARIF schema validation + MCP fixture unit test
3. **Reviewer gate**: 主要設計判断を含む task (T-09 D-008 pin, T-23 YAML dep, T-24 corpus scope, T-29 LLM enrichment, T-38 Golf Scanner 採否) は ADR 追加 + user gate; 単純実装 task は self-review checklist
4. **Implementation Notes propagation**: 発見 / 制約を `.claude/memory_bank/logbook.md` に literal append (PJ 別 Implementation Notes 先 per Tier 2 mapping); 重要 decision は `docs/adr/NNNN-*.md` に独立 ADR

---

## 推定 effort (★★ rough, consumer laptop, single dev session, Phase 1 全体)

- L0 Foundation: 半日
- L1 Cross-cutting: 1 日
- L2 LlmProvider: 半日
- L3 I/O: 1 日 (SARIF 多めに見積もり)
- L4 Scanner (4 detectors + e2e): 1.5 日
- L5 Harness (corpus 30 件 + 3 layer + e2e): 2 日
- L6 Remediation: 半日
- L7 CLI: 半日
- L8 CI (3 workflow + cross-OS verify): 1 日
- L9 Phase α gate (concurrency + docs + bench + independent verify): 1 日

**total**: ~10 working days で Phase α 完遂 (consumer laptop, single dev, AI 並列 assist 込み)。 ★★ — Stage 1 で literal benchmark していないので不確実性あり、 T-01 完了時点で initial calibration、 T-10 完了時点で再校正。

---

## Stage 4 user approve gate

本 tasks.md は **draft**。 user review を経て、 以下のいずれかを literal 選択:

- **APPROVE**: Phase 1 implementation kickoff、 T-01 から sequential 着手
- **REVISE**: 指摘 point 反映 → 本 file 修正 → 再 approve
- **REJECT**: Stage 3 Design v2 へ revert (越境 / 構造問題)

approve gate 通過前の implement 着手は workflow 破綻 (skill § 禁止事項 + report-consult-inform rule)。
