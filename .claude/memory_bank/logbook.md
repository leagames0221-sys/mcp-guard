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
