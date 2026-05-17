# mcp-guard spec

> Phase 0 vision draft。 詳細 (EARS / Mermaid / Tasks) は `/spec-driven-workflow` で詰める。

## 機能 list (initial scope)

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
  - `npm install` timing = Phase 1 Discovery 完了後 1 回のみ (lockfile commit と同時、 不用意な install 禁止)
- **コスト制約** (★ 必須):
  - **クレカ要求 external service 採用 literal 禁止** (Cloudflare Pages / Workers / GitHub Actions free tier 等 クレカ不要 service のみ)
  - **外部 LLM paid API auto-call literal 禁止** (Anthropic / OpenAI 等 は env-var-gated optional のみ active、 user 明示時のみ)
  - GitHub Actions 月 2,000 分 free tier 内で全 CI 完走
- **LLM stack**:
  - **default = Ollama local** (consumer laptop で完走、 model = qwen2.5 系 / llama3.x 系 推奨)
  - env-var-gated swap path: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 経由で paid API optional (user 明示時のみ)
  - mock mode (LLM 不使用、 pure static analysis のみ) を default fallback として常時 available
- **互換性**: Node.js 20 LTS 以上、 macOS / Linux / Windows 三 platform CI
- **規模**: 個人開発者 / SMB pipeline、 1 dev machine / 1 GitHub Actions runner で完走 (consumer hardware 完走前提)
- **license**: MIT (依存に GPL 系混入禁止、 dependency-review CI で block)

## 依存

- 外部 service: なし (default、 完全 local 実行)
- 外部 LLM API: optional (env-var-gated swap path、 default = local Ollama or mock mode)
- 他 PJ 連携: なし (Phase α は独立、 後続 integration の cross-link は別 PR 化)

## 完了条件 (Phase α ★★★ acceptance criteria)

`~/.claude/knowledge-library/decisions/tool_tier_rubric.md` v2.0 の 7 binary criteria 全 PASS:

- **AC-1**: F-001 〜 F-005 全機能 unit + e2e test PASS (coverage 80%+)
- **AC-2**: CI green 連続 5 commit 以上 (test + lint + audit + dependency-review + drift-check)
- **AC-3**: LICENSE + README + ADR ≥ 5 件 (decomposed prior art / scope / architecture / CI / forbidden)
- **AC-4**: forbidden token mask hook smoke test PASS (channel B framing leak ZERO)
- **AC-5**: real-world fixture (公開 MCP server example) で TP/FP rate measured + documented
- **AC-6**: SARIF output が GitHub code scanning UI で literal 表示確認
- **AC-7**: tier-reviewer subagent 経由 independent verify PASS (Writer/Reviewer pattern)

## 後続 (Phase β、 別 repo `sbom-pilot`)

軸 B (Supply chain / SBOM): syft + grype の decomposed prior art seed、 法規制 (改正個情法 + METI SBOM ガイドライン) tailwind 期待。 本 PJ ★★★ verify 後着手。
