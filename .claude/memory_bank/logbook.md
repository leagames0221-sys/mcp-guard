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
