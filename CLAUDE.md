# mcp-guard — Tier 2 PJ-local rules

> Tier 1 (~/.claude/) のユニバーサル doctrine / security / orchestrator は auto-import 済。
> 本 file は **PJ 固有** 規約のみ記述。

## PJ Identity

- 案件: `mcp-guard` — MCP server security scanner + LLM prompt injection defense lab
- 目的: 個人開発者 / SMB 向け defensive-first CLI tool として portfolio に追加、 security 受託案件への entry point
- scope: Phase α (本 repo 単独 ★★★ verify) → 後続 Phase β (sbom-pilot、 別 repo) の sequential
- target audience: MCP server を deploy する個人開発者 + SMB

## Repo public framing

本 repo は **GitHub PRIVATE で initial commit**、 ★★★ verify 通過後 PUBLIC 化判断。 PUBLIC 化時の framing:

- author identity: `tomohiro takada` (GitHub `leagames0221-sys`)
- profile framing: 「AI 開発者 / フルスタックエンジニア」
- "solo" / "individual" / "single dev" framing words avoided
- Off-repo personal identity details and unrelated project names not disclosed
- Internal infrastructure terminology not disclosed (commit-time sanitization hook blocks at write)

詳細 mask list: `.claude/internal_notes.md` (gitignored、 commit 不可)。

## Stack (暫定、 Discovery で最終決定)

- **Language**: TypeScript (Node.js)
  - 根拠: promptfoo (TypeScript, MIT, 95% fit) の decomposed prior art seed と MCP ecosystem (Node.js 中心) の整合
- **Package manager**: pnpm (lockfile commit、 Tier 1 D-NPM-3GUARD 順守)
- **Test**: vitest (default)
- **CI**: GitHub Actions (test + npm-audit + dependency-review + drift-check)

最終決定は `/spec-driven-workflow` Discovery stage の prior art audit 結果で gate。

## PJ 固有 verify priority

Tier 1 default を継承 + 下記 addition:

1. MCP server fixture (`tests/fixtures/mcp/*.json`) で scanner unit test
2. Prompt injection corpus (OWASP LLM01–10) で red-team harness e2e
3. SARIF output schema validation (CI gating 用)

## PJ 固有 forbidden

- 攻撃 payload を repo 内に literal 配置禁止 (educational scope のみ、 always sanitized + license-noted)
- 実 MCP server credential / API key literal 配置禁止
- Channel B 順守: 内部 infra 用語 / 内部 module 名 commit 禁止 (pre-commit hook で literal block)
- 受託案件 hint (顧客名 / 商談 evidence) literal 禁止

## PJ 固有 required

- 全 commit に `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (cross-PJ universal)
- ADR-based 設計判断記録 (`docs/adr/NNNN-*.md`)
- LICENSE = MIT 維持
- D-PRIOR-ART-SECURITY-GATE: 外部 OSS adopt 前に user 承認 gate 必須

## 関連 doc

- [spec.md](spec.md): PJ 仕様の SSoT
- [docs/adr/](docs/adr/): 設計判断記録
- [.claude/memory_bank/](.claude/memory_bank/): session 連絡帳 (Cline 5-file pattern)
