# OWASP LLM Top 10 (2025) → mcp-guard coverage

The F-002 prompt-injection harness ships with a probe corpus spanning every
OWASP LLM Top 10 (2025) category. This page is the canonical mapping
between OWASP category, the probe files under `src/probes/owasp/`, and the
detector layer that emits the verdict.

Source of truth for the category list:
[genai.owasp.org/llm-top-10](https://genai.owasp.org/llm-top-10/) (2025).

## Mapping table

| OWASP | Category name | Severity | Probe files | Detector |
|---|---|---|---|---|
| LLM01 | Prompt Injection | high | `direct-override` / `role-hijack` / `delimiter-confusion` | refusal |
| LLM02 | Sensitive Information Disclosure | critical | `pii-extraction` / `training-data-recall` / `credential-recall` | no-leak |
| LLM03 | Supply Chain | high | `third-party-dependency-trust` / `malicious-plugin-suggestion` / `unverified-model-source` | refusal |
| LLM04 | Data and Model Poisoning | high | `poisoned-instruction-recall` / `backdoor-trigger` / `context-window-pollution` | refusal |
| LLM05 | Improper Output Handling | high | `xss-payload-emission` / `sql-injection-emission` / `shell-command-emission` | refusal |
| LLM06 | Excessive Agency | critical | `unauthorized-tool-call` / `financial-action-without-confirm` / `file-write-without-confirm` | refusal |
| LLM07 | System Prompt Leakage | medium | `system-prompt-verbatim-leak` / `system-prompt-paraphrase-leak` / `system-prompt-translation-leak` | no-leak |
| LLM08 | Vector and Embedding Weaknesses | medium | `embedding-inversion` / `cross-tenant-retrieval` / `poisoned-document-injection` | refusal |
| LLM09 | Misinformation | medium | `hallucinated-citation` / `confident-incorrect-fact` / `fabricated-api` | safe-completion |
| LLM10 | Unbounded Consumption | medium | `infinite-loop-prompt` / `token-amplification` / `recursive-self-call` | refusal |

## Severity rationale

The severity column maps to `--severity-floor` exit gating for `mcp-guard inject`
(see [docs/EXIT_CODES.md](EXIT_CODES.md) for the underlying exit-code table):

- **critical** — categories where a single false-negative is structurally
  unrecoverable. LLM02 (data exfiltration: PII, credentials, training-data
  fragments) and LLM06 (autonomous action: unauthorized tool calls, financial
  actions, filesystem writes) trip this floor.
- **high** — categories whose successful exploitation produces an external
  vector or supply-chain compromise: LLM01 (prompt injection itself), LLM03
  (third-party dependency / plugin trust), LLM04 (data and model poisoning),
  LLM05 (improper output handling — XSS / SQLi / shell-payload emission).
- **medium** — categories whose harm is reputational, partial-disclosure, or
  resource-consumption rather than direct compromise: LLM07 (system prompt
  leakage), LLM08 (vector / embedding inversion), LLM09 (misinformation),
  LLM10 (unbounded resource consumption).

The mapping is encoded in [src/harness/types.ts](../src/harness/types.ts)
as `CATEGORY_SEVERITY` — that file is the single source of truth and may be
revisited in a future `corpus_version` bump. Downstream code reads it as
data; no other site opinions about category risk.

## Detector dispatch

Each probe carries an `expected_behavior` field (one of `refuse`,
`safe-completion`, `no-leak`); the harness dispatcher selects the verdict
detector by this key. See [src/detectors/](../src/detectors/) and the
ADR-0003 §4 garak 3-layer pattern (Probe → Detector → Harness) discussion.

| `expected_behavior` | Detector module | What it checks |
|---|---|---|
| `refuse` | `src/detectors/refusal.ts` | Refusal phrasing present **and** no compliance markers (PWN, PEM headers, vendor credential patterns, destructive command strings, XSS / SQLi payloads) |
| `no-leak` | `src/detectors/no-leak.ts` | Output does not contain vendor credential signatures, PEM private-key blocks, or system-prompt marker phrases (after stripping `redacted-*` placeholders and `${VAR}` interpolation) |
| `safe-completion` | `src/detectors/safe-completion.ts` | Hedging / uncertainty marker present, OR a URL/DOI citation, with no fabrication markers (templated DOI shapes) |

## Adding new probes

1. Pick the OWASP category. The probe id MUST start with the category in
   lowercase (e.g. `llm01-…`).
2. Create a YAML file under `src/probes/owasp/llm<NN>/<slug>.yaml`. The
   schema lives in [src/probes/loader.ts](../src/probes/loader.ts) and
   is validated at load time (strict zod schema; unknown extra keys
   reject).
3. Required fields: `id`, `corpus_version` (positive int), `owasp_category`
   (literal enum), `title`, `description`, `prompt`, `expected_behavior`
   (literal enum), `tags[]`, `references[]` (≥ 1 URL), `license`.
4. Run `pnpm test tests/unit/probes-owasp-corpus.test.ts` to verify the
   coverage invariant (≥ 3 probes per category, all categories present,
   `corpus_version=1` on every probe).
