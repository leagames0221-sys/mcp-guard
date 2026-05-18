# Logbook — mcp-guard

> Append-only chronological log of work sessions. Each entry: date, session goal, what changed, links.

## 2026-05-18 — Phase 0 scaffold

**Goal**: Install initial PJ structure per internal new-PJ install protocol.

**Changed**:

- Created PJ root at `C:/Users/admin/Projects/mcp-guard`
- Wrote 13 scaffold files: README, LICENSE, .gitignore, CLAUDE.md, spec.md, .claude/{settings.json, internal_notes.md, memory_bank/×5}, .github/{workflows/×2, dependabot.yml}, .pre-commit-config.yaml, docs/adr/0001-...
- Registered in internal PJ registry
- Initialized git, created GitHub PRIVATE repo `leagames0221-sys/mcp-guard`, pushed initial commit

**Status**: scaffold complete, awaiting `/spec-driven-workflow` Discovery to lock stack + adopt prior-art seeds.

**Next session**: Run Discovery stage (audit promptfoo + garak + llm-guard repos, decide adoption set, draft Requirements EARS).

## 2026-05-18 — Phase 1 Spec-Driven Workflow Stage 1+2+3 v2

**Goal**: Run Stage 1 Discovery → Stage 2 Requirements (EARS) → Stage 3 Design with independent review.

**Changed**:

- **Stage 1 Discovery accepted** — 4 prior-art seeds audited (promptfoo + garak primary, llm-guard + agent-governance-toolkit reference); stack locked = TypeScript + pnpm + vitest + commander + zod + Ollama gemma3:4b
- **Stage 2 Requirements accepted** — 29 EARS AC drafted, then expanded to 31 after independent review (added AC-005-6 exit codes + AC-NF-7 concurrent safety)
- **Stage 3 Design v2 accepted** — 7 initial tradeoffs (D-001 .. D-007); independent review identified 9 gaps; all 9 integrated → 4 new modules (src/config, src/logger, src/errors, src/scanners/mcp-schema), 4 new tradeoffs (D-008 .. D-011), 2 new EARS AC, 3 Phase 1 task additions, 5 new root files (.npmrc, .editorconfig, SECURITY.md, docs/EXIT_CODES.md, scripts/update-mcp-schema.ts)
- **ADR-0003 committed** (docs/adr/0003-stack-adoption-and-design.md) — consolidates Stage 1-3 decisions as canonical source of truth
- **spec.md updated** — added Spec status header, Stack section, full EARS (31 AC), Tradeoffs table (11 entries), File structure, Phase α completion AC

**Forbidden-phrase audit**: 1 violation found in CLAUDE.md L25 ("provisional, to be finalized in Discovery") fixed in commit 70aceff. All Stage outputs re-presented with production-grade framing per absolute enforcement rules.

**Status**: Stage 1-3 v2 deliverables saved to git. Stage 4 Tasks pending user approval to launch. No dependency installation yet (per ADR-0002 timing rule).

**Next session**: Stage 4 Tasks (WBS + Boundary/Depends + AC mapping). Then dependency installation batch (single pnpm install with lockfile commit) and Phase 1 implementation kickoff.

## 2026-05-18 — Phase 1 Stage 4 Tasks v2 + L0 Foundation kickoff

**Goal**: Draft Stage 4 Tasks, run objective-evaluation patch round, gain user approval, begin L0 Foundation.

**Changed**:

- **Stage 4 Tasks v2 accepted** — drafted `tasks.md` with 39 tasks across 9 layers (L0 Foundation → L9 Phase α gate)
  - All 31 EARS AC + 11 design tradeoffs (D-001~D-011) + 8 Phase α AC literal mapped to tasks (orphan AC zero, verified via 3 mapping tables in tasks.md)
  - Each task carries Boundary + Depends + AC + Verify + Notes per the spec-driven workflow rubric
  - Build order locked as strict topological dependency graph
- **Objective-evaluation patch round (6 findings, all applied before kickoff approval)**:
  - F-1: lint tool drop — CI pipeline = `pnpm tsc --noEmit` (type) + `pnpm vitest run --coverage` (test) + `pnpm audit --audit-level=high` (supply chain); no eslint until Phase β
  - F-2: T-31 uses commander built-in `showSuggestionAfterError()` instead of self-rolled Levenshtein (D-001 commander adoption fully leveraged, waste-zero principle honored)
  - F-3: `yaml` (eemeli/yaml, ISC) added to T-01 batch to honor D-002 YAML probe corpus format literal lock (no re-litigation of Stage 3)
  - F-4: ADR count to 5 — T-09 produces ADR-0005 (MCP spec upstream pin) and T-38 produces ADR-0004 (Golf Scanner audit outcome); AC-α-3 satisfaction path verified
  - F-5: AC-α-2 (5 consecutive green CI commits) re-framed as stream condition accumulating across L8/L9 commits, with literal verification timepoint at T-39
  - F-6: vitest coverage thresholds (lines/functions/branches/statements ≥ 80, provider v8, reporter [text, json-summary, html]) wired in T-02 vitest.config.ts so AC-α-1 verification gate is wired by construction
- **User approved Stage 4 v2** — kickoff into L0 Foundation begins this session

**Status**: Stage 4 Tasks v2 accepted, L0 Foundation in progress.

**Next**: Sequentially execute T-01 (deps batch + .npmrc) → T-02 (tsconfig + vitest config + .editorconfig) → T-03 (package.json scripts + engines.node) → T-04 (SECURITY.md) → T-05 (precommit mask hook + smoke test).

## 2026-05-18 — L0 Foundation completed (T-01 through T-05)

**Goal**: Execute every L0 task end-to-end with verification + commit per task.

**Changed**:

- **T-01 (commit d7f9f1c)**: dependency adoption single batch — 8 deps installed
  (commander 13.1.0 + zod 3.25.76 + yaml 2.9.0 as runtime; vitest 2.1.9 +
  coverage-v8 + typescript 5.9.3 + types-node 22 + tsx 4.22 as dev); .npmrc
  engine-strict=true; pnpm-workspace.yaml onlyBuiltDependencies=[]; lockfile
  committed; supply-chain audit at high threshold = 0 high, 2 moderate
  (esbuild/vite transitive via vitest 2.x, dev-only, documented residual)
- **T-02 (commit 54aabe7)**: tsconfig.json strict baseline (ES2022 + ESM +
  Bundler + noUncheckedIndexedAccess + exactOptionalPropertyTypes); vitest
  config with coverage thresholds 80% across lines/functions/branches/
  statements (AC-alpha-1 construction-time gate); .editorconfig; src/index.ts
  placeholder; typecheck + test both exit 0
- **T-03 (commit 01951de)**: package.json scripts enrichment (build, prepublishOnly);
  engines.node ">=20.0.0" + .npmrc engine-strict=true literal verified;
  build smoke verified (dist/ emitted from placeholder)
- **T-04 (commit 8a98b32)**: SECURITY.md (110 lines, supported versions,
  report channels, SLA, scope, hardening posture cross-referencing AC-NF-1
  through AC-NF-7, coordinated disclosure, MIT license)
- **T-05 (commit 72ac466)**: scripts/precommit_mask_check.ts (pure-function
  library + script entry gated on !VITEST); 11 vitest specs PASS; .pre-commit-
  config.yaml wired with `entry: pnpm mask:check`; smoke 1 (forbidden token
  from internal mask list staged) returns exit 1 + BLOCKED output, smoke 2
  (benign line) returns exit 0 + PASS scanning 66 mask tokens; rootDir
  removed from tsconfig to allow scripts/ + tests/ inclusion

**Implementation Notes propagation**:
- src/index.ts placeholder will be superseded by real public API exports as
  F-001/F-002/F-003 surfaces land (T-22/T-27/T-29). Plain SCAFFOLD_MARKER for now.
- vitest passWithNoTests=true intentionally tolerates empty-state during L1+
  builds; coverage threshold 80% applies to actually-included src/ files only.
- 2 moderate supply-chain vulns (esbuild GHSA-67mh-4wv8-2f99, vite GHSA-4w7w-
  66w2-5vf9) are dev-tooling transitives of vitest 2.x. Vitest 3.x major bump
  resolves but is deferred — a future Phase 1 task can rebenchmark and either
  bump vitest or apply pnpm overrides once vitest@3 baseline is settled.

**Status**: L0 Foundation complete. Repo state: 5 task commits + 1 Stage 4
approval commit. Stack toolchain wired and verified end-to-end. Pre-commit
mask hook active and proven (block + pass paths both smoke-tested).

**Next**: L1 Cross-cutting modules — T-06 (src/errors/ + docs/EXIT_CODES.md),
T-07 (src/logger/ + ANSI sanitize), T-08 (src/config/ + zod schemas), T-09
(src/scanners/mcp-schema/ + ADR-0005 upstream pin). T-06 depends on T-02
(already complete); T-07 same; T-08 depends on T-06+T-07; T-09 depends on T-08.

## 2026-05-18 — L1 Cross-cutting modules completed (T-06 through T-09)

**Goal**: Land every L1 task end-to-end with verification + commit per task.

**Changed**:

- **T-06 (commit d63e1c6)**: src/errors/{types,index}.ts typed hierarchy
  with 7 McpGuardError subclasses (FindingsExceedThresholdError exit 1,
  InvalidInputError 2, UsageError 64, DataFormatError 65, InternalError 70,
  IoError 74, ConfigError 78) + resolveExitCode() helper; docs/EXIT_CODES.md
  canonical mapping table; 21 vitest specs including literal doc <-> code
  equivalence check (drift-resistant)
- **T-07 (commit 8033004)**: src/logger/sanitize.ts ANSI escape + control-
  char stripper covering CSI / OSC / nF / Fp+Fe+Fs single-byte forms;
  src/logger/index.ts level-filtered Logger with debug/info/warn/error/
  progress methods, configurable WritableStream, all emission sanitized;
  22 vitest specs across hostile-payload sanitization and level filtering
- **T-08 (commit eb4330f)**: src/config/{schema,precedence,index}.ts +
  src/types/index.ts; zod schemas with built-in defaults (mock LLM, severity
  high, output json, log info, ollama localhost:11434, gemma3:4b); merge
  CLI > env > file > defaults; envToLayer maps MCP_GUARD_* env vars;
  readConfigFile rejects .env/.envrc/.netrc basenames BEFORE any fs call
  (AC-NF-2 architectural guarantee); enforcePaidApiGate (AC-NF-1) rejects
  anthropic/openai without matching env key; 26 vitest specs
- **T-09 (commit fdd2f80)**: docs/adr/0005-mcp-spec-upstream-pin.md (canonical
  upstream + initial-pin placeholder + drift workflow + re-pin contract);
  src/scanners/mcp-schema/{snapshot.json,upstream-commit.txt,validator.ts};
  scripts/update-mcp-schema.ts (default-write + --check modes);
  .github/workflows/mcp-schema-drift.yml (weekly cron + push trigger,
  uploads drift report on failure); parseMcpConfig() maps structural
  failures to DataFormatError (exit 65) and schema failures to
  InvalidInputError (exit 2) per AC-001-2; 17 vitest specs including
  snapshot <-> zod equivalence + pin format validation

**Implementation Notes propagation**:
- ConfigLayer's DeepPartial uses `T extends object` not Record<string,unknown>
  so zod-derived schemas with strict shapes still recurse correctly.
- vi.spyOn(fs, '...') is incompatible with ESM-frozen modules in vitest 2.x;
  prefer behavioral assertions over namespace spies. AC-NF-2 verified by
  the architectural guarantee (basename check precedes fs ops) + a
  behavioral test asserting ConfigError with 'reserved for credentials'
  message before any read.
- Initial MCP spec pin is deferred to first CI run of mcp-schema-drift
  workflow per ADR-0005 §2; placeholder makes that no-fail. Subsequent
  runs gate strictly.

**Status**: L0 + L1 complete. Repo state: 11 task commits + 1 Stage 4
approval commit. 97 vitest specs PASS, all typecheck green. ADR count
now 4 (0001/0002/0003/0005); T-38 ADR-0004 (Golf Scanner audit) will
reach 5 at L9.

**Next**: L2 LlmProvider (T-10 interface, T-11 mock, T-12 ollama, T-13
paid-API) and L3 I/O (T-14 parsers, T-15 JSON, T-16 SARIF, T-17 console).
L2 + L3 are parallelable once L1 lands.

## 2026-05-18 — L2 T-10 LlmProvider interface

**Goal**: Land D-004 minimal interface — `{ name, generate, health }` — with
no abstract class and no adapter layer, gating future mock/ollama/paid impls.

**Changed**:

- **T-10**: src/providers/llm/{types,index}.ts — `LlmProvider` interface
  (readonly name: LlmProviderName; generate(prompt, opts?): Promise<string>;
  health(): Promise<boolean>) + `LlmGenerateOptions` (temperature?, maxTokens?,
  signal?: AbortSignal); 11 vitest compile-time gates via expectTypeOf —
  3-member surface, name type equals LlmProviderName union, generate return
  type, generate parameter tuple (opts optional), health return type, health
  zero-arg, structural impl accepted, LlmGenerateOptions all-optional + per
  field types.

**Status**: L0 + L1 + L2 T-10 complete. 108 vitest specs PASS (97 prior + 11
new), tsc strict green. ADR count unchanged at 4; T-10 is contract-only and
does not warrant a new ADR (D-004 in ADR-0003 covers it).

**Next**: T-11 (`src/providers/llm/mock.ts` — deterministic canned responses
keyed by prompt hash, health() always true; AC-002-2 fallback, AC-NF-3 CI
default no-network).

## 2026-05-18 — L2 T-11 mock LLM provider

**Goal**: Land the mandatory fallback provider — deterministic, in-process,
satisfies AC-002-2 (mock fallback) + AC-NF-3 (CI default = no network).

**Changed**:

- **T-11**: src/providers/llm/mock.ts — `MockLlmProvider implements LlmProvider`;
  name = 'mock'; generate() picks from an 8-entry canned response table
  (4 safe / 4 flagged) indexed by `sha256(prompt)[0] mod 8`, so output is
  reproducible across runs, machines, CI; health() always resolves true.
  No network, no fs, no env reads — pure in-process. `MOCK_CANNED_RESPONSES`
  re-exported as readonly string[] for downstream membership assertions.
  Barrel src/providers/llm/index.ts re-exports the class + table.

**Implementation Notes propagation**:
- Modulo-bounded index against an 8-element tuple is always defined, but
  noUncheckedIndexedAccess forces an explicit narrow; an unreachable throw
  guards the sparse-table case.
- AbortSignal in opts is accepted (type compliance with LlmGenerateOptions)
  but no-op for the mock — there is no async work to cancel.

**Status**: L0 + L1 + L2 T-10/T-11 complete. 119 vitest specs PASS (108
prior + 11 new), tsc strict green. ADR count unchanged at 4.

**Next**: T-12 (`src/providers/llm/ollama.ts` — stdlib `fetch` only, no
SDK npm dep; `localhost:11434` default, `MCP_GUARD_OLLAMA_HOST` override;
health() probes `/api/tags`, generate() POSTs `/api/generate` with model
`gemma3:4b`; fall back to MockLlmProvider on connection refused).

## 2026-05-18 — L2 T-12 Ollama LLM provider

**Goal**: Land the local-first Ollama provider — stdlib `fetch` only, no
SDK npm dep (waste-zero principle); honest health() + generate(); AC-NF-5
host containment delegated upstream to the config layer (already enforced
by T-08: only `MCP_GUARD_OLLAMA_HOST` may override the localhost default).

**Changed**:

- **T-12**: src/providers/llm/ollama.ts — `OllamaLlmProvider implements
  LlmProvider`; name = 'ollama'; constructor accepts `{ host?, model? }`
  with defaults `http://localhost:11434` and `gemma3:4b` exported as
  `DEFAULT_OLLAMA_HOST` / `DEFAULT_OLLAMA_MODEL`; health() GETs
  `${host}/api/tags` and returns false on any failure (non-2xx OR fetch
  rejection) without throwing; generate() POSTs `${host}/api/generate`
  with `{model, prompt, stream:false}` body, lifts `temperature` and
  `maxTokens` into Ollama's `options.{temperature, num_predict}` only
  when set, forwards AbortSignal into the fetch init, throws with HTTP
  context on non-2xx and with 'malformed response' on missing string
  `response` field.

**Implementation Notes propagation**:
- AC-002-2 (fallback to mock if Ollama not running) is delegated to the
  L5 harness layer per the AC wording 'THE SYSTEM SHALL fall back' — the
  provider's job is honest health() = false on connection refused, which
  the harness will use as the fallback trigger. Provider stays single-
  responsibility (waste-zero principle).
- AC-NF-5 host containment is structurally guaranteed by config layer:
  config schema only accepts `http://localhost:11434` default or whatever
  `MCP_GUARD_OLLAMA_HOST` resolves to. Provider trusts its constructed
  host without re-validating, which keeps the URL validation single-
  sourced and avoids divergence.
- vi.spyOn(globalThis, 'fetch') is brittle with ESM globals in vitest 2.x;
  swap `globalThis.fetch` directly in beforeEach/afterEach (mirrors the
  pattern T-08 settled on for fs).

**Status**: L0 + L1 + L2 T-10/T-11/T-12 complete. 131 vitest specs PASS
(119 prior + 12 new), tsc strict green. ADR count unchanged at 4.

**Next**: T-13 (`src/providers/llm/{anthropic,openai}.ts` — env-var-gated
constructors that throw ConfigError when the API key env var is missing
or when `MCP_GUARD_LLM_PROVIDER` is not explicitly set to the matching
provider name; integration test stubbed via fetch stub so no real API
call is ever made — AC-NF-1 + AC-NF-3 + cross-PJ Anthropic API auto-call
ban per internal doctrine).

## 2026-05-18 — L2 T-13 paid-API providers (Anthropic + OpenAI)

**Goal**: Land the env-var-gated paid-API providers so the harness has a
swap-in path for higher-quality inference when the operator opts in.
Constructor-time AC-NF-1 gate is the load-bearing safety; AC-NF-3 is
preserved by stubbing every fetch in tests so CI never reaches a real
endpoint. Cross-PJ Anthropic auto-call ban honoured (no real keys, no
real network).

**Changed**:

- **T-13a Anthropic**: src/providers/llm/anthropic.ts — AnthropicLlmProvider
  with two-factor constructor gate: both `ANTHROPIC_API_KEY` and
  `MCP_GUARD_LLM_PROVIDER='anthropic'` must be present, otherwise throws
  ConfigError carrying `{ gate: 'AC-NF-1', missing: 'both' | 'provider_flag'
  | 'api_key' }`. Default model = `claude-sonnet-4-6` (env-overridable via
  constructor opts). generate() POSTs `https://api.anthropic.com/v1/messages`
  with `x-api-key` + `anthropic-version: 2023-06-01` headers + Claude
  Messages body shape (model + max_tokens + messages[]); temperature lifted
  when set; AbortSignal forwarded. health() returns true post-construct
  (constructed = configured; no cheap liveness probe, no billable probe).
  Errors carry HTTP status + statusText only — API key never echoes into
  error messages (verified by literal assertion in tests).
- **T-13b OpenAI**: src/providers/llm/openai.ts — OpenAiLlmProvider with
  the same two-factor gate against `OPENAI_API_KEY` and
  `MCP_GUARD_LLM_PROVIDER='openai'`. Default model = `gpt-4o-mini`.
  generate() POSTs `https://api.openai.com/v1/chat/completions` with
  `Authorization: Bearer <key>` + chat.completions body shape
  (model + messages[] + optional temperature + optional max_tokens).
  health(), error policy, key-non-leak guarantee identical to Anthropic.
- **Barrel**: src/providers/llm/index.ts now re-exports both classes +
  their endpoint constants + default models + opts types.

**Implementation Notes propagation**:
- Env injection: constructor takes `(opts, env = process.env)`. Tests
  pass explicit `env` objects so the gate is reproducible without
  mutating real process.env. This mirrors how T-08 config injected
  layer maps, keeping the codebase consistent.
- Two-factor gate intentionally checks `missing: 'both'` first to give
  the operator the most informative error in the cold-start path.
- vitest 2.x `expect(fn).toThrow(/regex/)` matches against the Error's
  message via `.test()`, which treats `API_KEY` (underscore) and
  `API key` (space) as distinct — first-round regex `/API key/` failed
  here; corrected to `/API_KEY/` to assert the literal env var name.
- 23 vitest specs across both providers: gate matrix (4 cases × 2),
  successful construct, opts override, health() = true, POST URL +
  headers + body shape + default body fields, temperature/maxTokens
  forwarding, AbortSignal forwarding, non-2xx throw without key leak,
  malformed-response throw. Every fetch is stubbed; default beforeEach
  installs a fetch that throws if invoked unintentionally, so any test
  that forgets to stub trips a loud failure (AC-NF-3 self-check).

**Status**: L0 + L1 + L2 complete (T-01 ~ T-13). 154 vitest specs PASS
(131 prior + 23 new), tsc strict green. ADR count unchanged at 4 —
D-004 in ADR-0003 already canonicalizes the four concrete impls T-13
delivers the last two of.

**Next**: L3 I/O — T-14 (`src/io/parsers/mcp-config.ts` round-tripping
fixtures via T-09 validator; AC-001-2 invalid → exit 2 + structured
error; AC-001-5 zero writes to input path), then T-15 (JSON emitter
with atomic temp+rename for AC-NF-7), T-16 (SARIF v2.1.0 emitter),
T-17 (console emitter).

## 2026-05-18 — L2 T-13b paid-API budget guard (AC-NF-8, ADR-0006)

**Goal**: Bolt a pre-flight reserve guard onto the paid-API providers so an
attacker (or a buggy harness loop) cannot drive runaway cost even after the
constructor gate (AC-NF-1) has passed. Operator flagged this in response to
in-the-wild malware on Japanese consumer endpoints targeting developer API
credentials for unauthorized billing.

**Changed**:

- **spec.md**: Added AC-NF-8 to § Non-functional cross-cutting. Three
  simultaneous ceilings (per-call max_tokens, per-process cumulative
  tokens, per-process call count) enforced before fetch; once any
  fires the budget poisons and refuses all further calls.
- **docs/adr/0006-paid-api-budget-guard.md**: Threat model (compromised
  host driving cost + buggy harness loop), decision (PaidApiBudget
  multi-ceiling reserve), tradeoffs (hand-rolled vs LangChain Budget;
  per-instance vs process-scoped; max_tokens-only vs precise input-
  token estimation), defaults rationale (50 calls × 1024 tokens-per-
  call × 50,000 tokens-per-run sits well under "1 USD" on every tier-1
  paid provider at time of writing). Non-goals: per-second rate limit,
  cross-process spend tracking.
- **src/providers/llm/budget.ts**: PaidApiBudget class (~145 LOC inc.
  validation). reserve(tokensRequested) is synchronous arithmetic +
  poisoning. snapshot() exposes read-only counters for logging /
  telemetry. Env override per ceiling via MCP_GUARD_LLM_MAX_*; env
  values must parse as positive integers, otherwise ConfigError at
  construction. parsePositiveInt rejects '0', negatives, floats,
  alphabetic strings.
- **src/providers/llm/anthropic.ts**: Constructor now owns a
  PaidApiBudget (default = env-driven, override via opts.budget for
  tests / harness composition). generate() calls budget.reserve(
  maxTokens) BEFORE fetch — failure throws ConfigError pre-network.
  Default max_tokens hoisted to ANTHROPIC_DEFAULT_MAX_TOKENS = 1024.
- **src/providers/llm/openai.ts**: Same shape — generate() reserves
  before fetch; OPENAI_DEFAULT_MAX_TOKENS = 1024.
- **src/providers/llm/index.ts**: Re-exports PaidApiBudget + defaults
  + snapshot type.
- **tests/unit/providers-llm-budget.test.ts**: 11 specs covering
  defaults, env overrides for all three ceilings, env validation
  rejections (0/-1/abc/1.5), opts > env precedence, happy-path
  state tracking, non-positive-integer reserve rejection, each
  ceiling firing individually + poisoning the rest, exact-threshold
  semantics (===  passes, > fails), ConfigError detail shape.
- **tests/unit/providers-llm-paid.test.ts**: +4 integration specs —
  build() helper now accepts an optional budget; new tests confirm
  budget.reserve() runs BEFORE fetch (exhausted budget leaves
  fetchCalls counter unchanged on the blocked call) for both
  Anthropic and OpenAI; per-call token ceiling rejects oversized
  maxTokens before any fetch.

**Implementation Notes propagation**:
- The budget is per-provider-instance by default. Harness composition
  (L5+) will inject a single shared budget into all paid providers
  spawned within one process so the ceilings cap the *process*, not
  the *provider* — otherwise an attacker constructing N providers
  could multiply the budget. That wiring happens at T-30, not here.
- Reserve uses `maxTokens` (the operator-visible output cap) rather
  than an estimated input-token count. Input tokens are typically
  the cheaper half of chat-completion billing; precise tokenization
  is per-model and would force a tokenizer dependency. Deferred to
  Phase β.
- Once a ceiling fires the budget is poisoned irreversibly within
  that process. There is no "reset()" — the only way out is a new
  process (which forces a fresh AC-NF-1 gate too).

**Status**: L0 + L1 + L2 (T-10 ~ T-13 + T-13b) complete. 169 vitest
specs PASS (154 prior + 15 new), tsc strict green. ADR count now 5
(0001/0002/0003/0005/0006). Paid-API path: constructor gate + pre-
flight reserve + key-non-leak in errors + zero auto-call in CI tests,
all stacked.

**Next**: L3 I/O — T-14 (`src/io/parsers/mcp-config.ts` using T-09
validator; AC-001-2 invalid → exit 2 + structured error; AC-001-5
zero writes to input path), then T-15 (JSON emitter atomic temp+
rename for AC-NF-7), T-16 (SARIF v2.1.0 emitter), T-17 (console
emitter).

## 2026-05-18 — L3 T-14 .mcp.json parser (I/O wrapper)

**Goal**: Land the filesystem-aware reader for .mcp.json files. The T-09
zod validator handles schema interpretation; T-14 owns the I/O, the
error-code mapping per AC-001-2, and the never-modify guarantee per
AC-001-5.

**Changed**:

- **T-14**: src/io/parsers/mcp-config.ts — `readMcpConfig(filePath)`
  resolves to absolute, opens for reading only (`node:fs/promises`
  readFile), delegates schema parsing to `parseMcpConfig` from
  src/scanners/mcp-schema/validator.ts. Three-way error mapping:
  filesystem failure → IoError (exit 74) with `code` ENOENT/EACCES/...
  in details; malformed JSON / non-object root → DataFormatError
  (exit 65); schema violation → InvalidInputError (exit 2). When
  V8's JSON.parse error message carries position information,
  `locateJsonError` resolves the byte offset (or explicit "line L
  column C" form on newer Node) to {line, col} and enriches the
  DataFormatError details — defensively returns undefined when
  neither pattern matches so callers never fabricate coordinates.
- src/io/parsers/index.ts barrel exports readMcpConfig +
  locateJsonError + ReadMcpConfigResult.
- **tests/fixtures/mcp/** new directory with 6 fixtures: valid-stdio,
  valid-http (sse transport), valid-mixed (stdio + http together),
  invalid-trailing-comma (JSON syntax error), invalid-schema-
  missing-command (semantic failure), invalid-root-array (non-object
  root). Fixture URLs use example.invalid TLD per RFC 6761 and any
  token strings are obvious placeholders.
- **tests/unit/io-parsers-mcp-config.test.ts** — 16 vitest specs:
  3 happy-path round-trips, 1 relative→absolute path resolution,
  2 AC-001-5 invariants (content + mtime + size unchanged on success
  AND on parse failure), 5 AC-001-2 error mapping cases (ENOENT,
  trailing-comma → DataFormatError, root-array → "root must be a
  JSON object", missing-command → InvalidInputError with issues[],
  line/col enrichment via tmpdir-written fixture), 5
  locateJsonError unit cases (position-form, explicit-form,
  no-match, overshoot, position 0).

**Implementation Notes propagation**:
- mkdtemp + writeFile + unlink for tmp-fixture tests are kept inside
  the test file rather than a shared helper — only two specs need
  it, and the inline form keeps the lifecycle visible.
- locateJsonError is exported from the public barrel so the future
  console emitter (T-17) can reuse the same coordinate logic when
  rendering operator-friendly error pointers.
- Position computation for "at position N": loop iterates [0, N)
  counting newlines and column. Verified: for raw "aaaa\nbb\ncccc"
  position 7 → line 2, col 3 (the trailing newline of line 2).
- AC-001-5 verified by stat() mtime + size + content comparison
  before/after every read; vi.spyOn on fs would be brittle on ESM
  globals (consistent with T-08 + T-12 patterns).

**Status**: L0 + L1 + L2 + L3 T-14 complete (T-01 ~ T-14). 185
vitest specs PASS (169 prior + 16 new), tsc strict green. ADR count
unchanged at 5.

**Next**: T-15 (`src/io/emitters/json.ts` + `src/io/emitters/atomic.ts`
— write to temp path + rename to final, AC-NF-7 atomic safety against
concurrent runs, AC-001-4 clean report = empty results[]).

## 2026-05-18 — L3 T-15 JSON emitter + atomic write (AC-NF-7, AC-001-4)

**Goal**: Land the canonical report shape, a hand-rolled atomic file
write (temp + rename), and the JSON emitter that composes them.
AC-NF-7 satisfied by UUID-suffixed temp paths; AC-001-4 satisfied by
defining a clean report as `results: []` (positive empty array, not
absent field).

**Changed**:

- **src/io/emitters/atomic.ts**: `writeAtomic(targetPath, content,
  opts?)` writes to `.${basename}.${randomUUID()}.tmp` in the target
  directory with `wx` flag (exclusive create), then renames into
  place. On failure, best-effort `unlink` of the temp file before
  throwing `IoError` with `{ target, tempPath, code }` in details.
  `buildTempPath` is exported so tests can assert the UUID v4 shape
  and callers can pre-compute a staging path.
- **src/io/emitters/json.ts**: `Finding` + `ScanReport` types, plus
  `REPORT_SCHEMA_VERSION = '1.0'` and `TOOL_NAME = 'mcp-guard'`.
  `buildReport({ target, findings?, toolVersion?, generatedAt? })`
  defaults `findings` to `[]` and `generatedAt` to `new Date().
  toISOString()`. `isCleanReport(r)` is the canonical AC-001-4
  predicate. `serializeReport(r)` produces 2-space-indented JSON
  with a trailing newline. `emitJsonReport(r, path)` composes
  serialize + writeAtomic.
- **src/io/emitters/index.ts**: barrel re-exports both modules.
- **tests/unit/io-emitters-atomic.test.ts**: 9 vitest specs covering
  buildTempPath UUID format, happy-path single write + no temp
  leakage, atomic overwrite of pre-existing target, Uint8Array
  content, IoError on missing parent dir (ENOENT) with full details,
  temp-file cleanup when rename fails (target is a directory), two-
  writer concurrent race producing one valid file, eight-writer
  concurrent race surfacing acceptable IoError on losers without
  corruption.
- **tests/unit/io-emitters-json.test.ts**: 11 vitest specs covering
  buildReport defaults + overrides + ISO-8601 shape + ordering,
  isCleanReport for empty vs non-empty (and AC-001-4 invariant:
  `results: []` is present in the serialized output, never absent),
  serializeReport pretty-printing + trailing newline + round-trip,
  emitJsonReport integration writing + reading both clean and
  non-clean reports.

**Implementation Notes propagation**:
- Concurrent rename on Windows can raise sharing violations
  (MoveFileExW refuses while target handle is open elsewhere); the
  AC-NF-7 surface wording is "not corrupt", not "all writers
  succeed". The eight-writer test asserts at-least-one fulfilled +
  any rejection is a typed IoError + final file matches exactly
  one input verbatim + no orphan temp files. This is the
  corruption-avoidance contract.
- `writeFile(..., { flag: 'wx' })` is the exclusive-create variant;
  with a UUID temp suffix the collision probability is negligible
  but the flag is still load-bearing as a defensive check.
- `serializeReport` ends with a literal newline so POSIX tooling
  (`cat`, line-oriented diff) handles the file cleanly.
- AC-001-4 ("clean report = empty results[]") is enforced both
  structurally (`buildReport` always allocates `results: []` even
  with no findings) and by a serialization test that confirms the
  field is present in the JSON output.

**Status**: L0 + L1 + L2 + L3 T-14/T-15 complete. 205 vitest specs
PASS (185 prior + 20 new), tsc strict green. ADR count unchanged at 5.

**Next**: T-16 (`src/io/emitters/sarif.ts` — SARIF v2.1.0 hand-rolled
~200 LOC emitter per D-003, mapping Finding → SARIF result + rule
metadata for GitHub code scanning UI ingestion at AC-α-6), then
T-17 (`src/io/emitters/console.ts` — human-readable terminal
output, ANSI sanitize via T-07 logger).

## 2026-05-18 — L3 T-16 SARIF v2.1.0 emitter (AC-001-3, D-003)

**Goal**: Land the SARIF v2.1.0 emitter hand-rolled per D-003 (no
sarif-multitool / npm sarif dep — supply-chain blast-radius
minimization). Output is shaped for GitHub code scanning UI ingestion;
schema-vendored end-to-end validation is deferred to T-39 per the
T-16 verify wording.

**Changed**:

- **src/io/emitters/sarif.ts** (~190 LOC): full typed SARIF v2.1.0
  surface — SarifLog ($schema + version + runs[]), SarifRun
  (tool.driver { name, version, informationUri, rules[] } +
  results[]), SarifResult (ruleId + ruleIndex + level + message.text
  + locations[] + partialFingerprints), SarifReportingDescriptor
  (id + name + shortDescription + defaultConfiguration.level),
  SarifLocation/PhysicalLocation/Region/ArtifactLocation, SarifLevel
  union 'none' | 'note' | 'warning' | 'error'.
  Public helpers: severityToSarifLevel (low→note, medium→warning,
  high+critical→error), pathToSarifUri (Windows backslash → forward
  slash, no file:// prefix because GitHub matches repo-relative),
  buildSarifLog (dedup rules by id with stable first-appearance
  ruleIndex; defaultConfiguration.level taken from first-appearance
  severity), serializeSarifLog (2-space pretty + trailing newline),
  emitSarifReport (composes serialize + writeAtomic).
- **src/io/emitters/index.ts**: re-export full SARIF surface +
  type-only re-exports for downstream callers.
- **tests/unit/io-emitters-sarif.test.ts** — 21 vitest specs:
  4 severity / path-uri mapping cases, 3 spec required fields
  ($schema + version + runs[]; driver name + version +
  informationUri + rules[]; clean report = results: [] + rules: []
  preserved through SARIF for AC-001-4 invariant), 6 result mapping
  cases (ruleId + level + message.text; partialFingerprints.
  mcpGuardFindingId for GitHub UI de-dup; locations[] with full
  region; region.startLine alone when col absent; region omitted
  entirely when neither line nor col; locations omitted when path
  absent), 3 rules-dedup + ruleIndex tests (4-finding mixed-rule
  array dedupes to 3 rules with stable indices [0,1,0,2]; rule's
  defaultConfiguration.level matches first-appearance severity;
  rule carries name + shortDescription.text), 2 serializeSarifLog
  tests (trailing newline + pretty-print prefix; round-trip via
  JSON.parse), 2 emitSarifReport integration tests (write +
  re-read findings report; write + re-read clean report), 2
  GitHub-compatibility-surface tests (every result has ruleId +
  ruleIndex + level + message.text; every rule has id + name +
  defaultConfiguration.level).

**Implementation Notes propagation**:
- D-003 hand-rolled choice still holds: ~190 LOC body covers the
  full SARIF surface for the F-001 scanner use case. Adding
  sarif-multitool or a typed SARIF npm dep would add a 150+ MB
  transitive supply chain set for value we already have.
- GitHub code scanning ingestion requires partialFingerprints to
  de-dup findings across runs; mcpGuardFindingId carries the
  finding's stable id (which F-001 detectors generate at scan time).
  This also lets GitHub Security tab show "open" vs "closed"
  findings without manual triage.
- pathToSarifUri does NOT prefix file:// — GitHub matches repo-
  relative paths against the workspace, so absolute or file:// URIs
  break that match.
- Schema-vendored validation (T-16 verify wording: "vendored copy
  under tests/fixtures/sarif-schema.json") is deferred to T-39
  (AC-alpha-6 GitHub UI literal display verification). Adding a
  ~200 KB schema vendored snapshot is a separate adoption: needs
  the supply-chain audit gate for the fetch source (schemastore.org)
  + a drift workflow analogous to T-09 mcp-schema-drift. Out of
  scope for T-16, in scope for T-39.

**Status**: L0 + L1 + L2 + L3 T-14/T-15/T-16 complete. 226 vitest
specs PASS (205 prior + 21 new), tsc strict green. ADR count
unchanged at 5.

**Next**: T-17 (`src/io/emitters/console.ts` — human-readable
terminal output, ANSI sanitize via T-07 logger, colour by severity,
respect NO_COLOR env). Last of L3; with T-17 done the L4+ scanner /
probe / harness wiring can begin.

## 2026-05-18 — L3 T-17 console emitter (AC-NF-4) — L3 layer drained

**Goal**: Land the last L3 emitter — human-readable terminal output that
sanitizes every hostile-content surface (path, ruleId, message, finding
path) before it touches the stream, honours the no-color.org convention
via NO_COLOR, and auto-detects TTY for colour decisions. Progress
reporting [N/M] belongs to the T-07 logger and was already landed
(AC-002-3).

**Changed**:

- **src/io/emitters/console.ts**: `renderReport(report, opts?)` returns
  a string; `emitConsoleReport(report, opts?)` writes that string to
  `opts.stream ?? process.stdout`. Severity tag colour map = critical
  bold red / high red / medium yellow / low cyan. Clean-report ok
  line is green when colour is on. Header line "mcp-guard
  <version> — target: <target>" + "generated: <iso>" always renders.
  Findings present → summary line with total + per-severity counts +
  per-finding block (severity tag + ruleId + id + sanitized message
  + optional "at <path>[:line[:col]]" location).
- **Colour decision**: explicit opts.color wins; else NO_COLOR env
  (any non-empty value, per no-color.org) disables; else stream
  isTTY=true enables.
- **src/io/emitters/index.ts**: re-exports renderReport +
  emitConsoleReport + ConsoleEmitOptions.
- **tests/unit/io-emitters-console.test.ts** — 21 vitest specs:
  3 clean-report cases (header content / no-ANSI in non-colour
  mode / green wrap when colour on), 5 findings-present cases
  (counts summary; singular vs plural "finding"; path+line+col
  location; path-only location; no location when path absent),
  5 AC-NF-4 sanitization cases (ANSI in message / control chars
  in message / ANSI in target path / ANSI in ruleId / ANSI in
  finding.path — all stripped), 6 colour-decision cases (non-TTY
  default off / TTY on / TTY+NO_COLOR=1 off / TTY+NO_COLOR="" still
  on / color=true overrides NO_COLOR+non-TTY / color=false overrides
  TTY), 2 emitConsoleReport stream-write integration tests
  (findings-present output content / clean-report no-ANSI in non-
  TTY stream).

**Implementation Notes propagation**:
- Progress reporting [N/M] <probe-name> is already in T-07's
  logger.progress() per AC-002-3; this emitter intentionally does
  not duplicate it. The CLI entry point (T-30+) will call
  logger.progress() during scan iteration and emitConsoleReport
  once at the end.
- captureStream test helper uses a duck-typed object with
  `write(): boolean` + `end()` + `isTTY`. Avoids constructing a
  real Writable subclass (which would pull node:stream into the
  test file unnecessarily).
- Colour escape sequences are added AFTER sanitize() so the
  emitter's own intentional escapes are not stripped by its own
  sanitizer.
- NO_COLOR=empty-string is treated as not-set per the no-color.org
  spec section "Implementations should check for the existence of
  NO_COLOR with any non-empty value".

**Status**: L0 + L1 + L2 + L3 (T-14 ~ T-17) all drained. 247 vitest
specs PASS (226 prior + 21 new), tsc strict green. ADR count
unchanged at 5.

**Next**: L4 Scanner layer kickoff — T-18 (`src/scanners/{index,
types}.ts` registry pattern, 4 scanner instances each implementing
`{ category, scan(config): Finding[] }`), then T-19 SSRF detector,
T-20 command-injection detector, T-21 auth-gap detector, T-22
supply-chain-risk detector + e2e integration. L4 is the F-001
scanner core; L5+ harness wires probes + LLM providers to detector
output.

## 2026-05-18 — L4 T-18 Scanner registry pattern

**Goal**: Land the L4 registry shape so T-19..T-22 can each light up
one detector slot without re-litigating the contract. Stubs only at
this task — the four real detectors land in their own commits.

**Changed**:

- **T-18 (this commit)**: `src/scanners/types.ts` exports
  `ScannerCategory` union (`'ssrf' | 'command-injection' | 'auth-gap'
  | 'supply-chain-risk'`), `SCANNER_CATEGORIES` readonly array in
  canonical order, `ScanContext` ({ config: McpConfig; target:
  absolute path }), `Scanner` interface ({ category; scan(ctx):
  Finding[] }), and `makeFindingId({category, ruleId, target,
  locator})` deterministic 16-char sha256 helper for SARIF
  partialFingerprints. `src/scanners/index.ts` exports the registry
  surface: `createScannerRegistry()` returns one fresh Scanner per
  category (stubs returning [] for now); `runAllScanners(ctx,
  scanners?)` flattens findings across the registry. tests/unit/
  scanners-registry.test.ts: 11 specs covering category ordering,
  registry length+contract, fresh-array invariant, empty-config-on-
  stubs invariant, runAllScanners flatten + empty-registry edge,
  makeFindingId determinism + per-field sensitivity.

**Implementation Notes propagation**:
- Stubs live inside `createScannerRegistry()` via a private
  `makeStubScanner(category)` factory rather than 4 separate
  placeholder files. T-19..T-22 will each carve out one real
  detector file (`src/scanners/ssrf.ts` etc.) and update the
  registry import in one edit — keeps the diff per detector task
  tightly scoped to its own file + its own fixtures.
- `makeFindingId` joins inputs with a single-space delimiter and
  hashes via sha256, truncating to 16 hex chars. Truncation matches
  the SARIF partialFingerprints stability budget (collision space
  ≈ 2^64); detectors must pass `locator` granular enough that two
  distinct findings on the same target never share the tuple.
- `runAllScanners` accepts an optional `scanners` arg so tests can
  inject fixed-output fakes (verified by the flatten test) — the
  default branch builds a fresh registry per call, which means a
  single misbehaving detector cannot leak state into the next call.
- Empty-config-on-stubs invariant is what makes T-19..T-22 refactor-
  safe: each detector turns itself on only for its own fixtures, so
  swapping the stub for a real impl never breaks unrelated tests.

**Status**: L4 T-18 complete. 258 vitest specs PASS (247 prior +
11 new), tsc strict green. ADR count unchanged at 5.

**Next**: T-19 SSRF detector (`src/scanners/ssrf.ts`) — flag stdio
servers with suspicious command targets, http servers with
loopback/internal URLs, and headers leaking outbound SSRF
primitives; replace the SSRF stub in the registry. Fixtures:
`tests/fixtures/mcp/ssrf-positive-*.json` (≥3) and
`ssrf-negative-*.json` (≥3).
