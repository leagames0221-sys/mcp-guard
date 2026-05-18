# ADR-0006: Paid-API budget guard (pre-flight reserve, defense-in-depth)

- Status: Accepted
- Date: 2026-05-18
- Supersedes / superseded-by: none
- Related: ADR-0002 (free-tier + local-LLM operational constraints), ADR-0003 (D-004 LlmProvider minimal interface)

## Context

T-13 landed env-var-gated paid-API providers (`AnthropicLlmProvider`,
`OpenAiLlmProvider`). AC-NF-1 gates *construction* — both the provider-
specific API key AND `MCP_GUARD_LLM_PROVIDER=<name>` must be present
or the constructor throws `ConfigError` before any network code runs.

That gate is the load-bearing first line. It is **not sufficient** in
two adjacent threat scenarios the operator has flagged:

1. **Compromised host driving runaway cost.** Recent in-the-wild
   malware on Japanese consumer endpoints has targeted developers'
   API credentials to drive unauthorized billing. If an attacker
   gains code execution on a machine that already holds a valid key
   plus a valid provider flag, they can invoke `generate()` in a
   loop and bill the operator until the provider's own rate limit
   trips — which can be thousands of dollars on cheaper accounts
   before the provider's anti-abuse fires.
2. **Buggy harness loop on the operator's own machine.** A regression
   in the harness's probe iteration (e.g. retry-without-backoff) can
   accidentally fan a single scan into thousands of calls. There is
   no operator intent here — just a defect — but the cost surface
   is identical.

The shared property: the existing gate decides "may I make calls?"
once, but says nothing about "how many, and how big?". Each new
`generate()` invocation today reaches `fetch` unimpeded.

## Decision

Introduce `src/providers/llm/budget.ts` carrying `PaidApiBudget`, a
process-scoped multi-ceiling guard. Each paid `LlmProvider` instance
owns a budget (default: a single shared one created from env) and
calls `budget.reserve(tokensRequested)` BEFORE every `fetch`. The
budget enforces three ceilings simultaneously:

| Ceiling                          | Default | Env override                                |
| -------------------------------- | ------- | ------------------------------------------- |
| per-call `max_tokens`            | 1024    | `MCP_GUARD_LLM_MAX_TOKENS_PER_CALL`         |
| per-process cumulative tokens    | 50,000  | `MCP_GUARD_LLM_MAX_TOKENS_PER_RUN`          |
| per-process call count           | 50      | `MCP_GUARD_LLM_MAX_CALLS_PER_RUN`           |

If any ceiling would be exceeded, `reserve()` throws `ConfigError`
with `{ gate: 'AC-NF-8', ceiling: <which>, requested, observed }`
**before** any network code runs. Once any ceiling has fired, the
budget is **poisoned**: subsequent `reserve()` calls throw without
re-checking individual ceilings, so an attacker who manages to
reset one counter still cannot escape.

`health()` does not consume budget (it does not invoke `fetch` on
paid providers; it returns `true` post-construct by design).

## Tradeoffs considered

- **External library vs. hand-rolled.** LangChain ships a `Budget`
  concept; `openai-cost-tracker` and similar npm packages exist.
  Each is one more dependency in the supply chain audit set for a
  ~80-LOC counter. Decision: hand-rolled, pattern-only adoption of
  the prior art (reserve-then-call, classical resource-pool guard
  pattern).
- **Synchronous reserve vs. async.** Reserve is pure arithmetic on
  in-process counters; no I/O. Synchronous keeps the call site
  simple — `budget.reserve(n); await fetch(...)`.
- **Token estimation precision.** We reserve against the requested
  `max_tokens` ceiling, not against an estimated input-token count.
  Rationale: input tokens are typically the cheaper half of the bill
  on chat-completion APIs, and `max_tokens` is the operator-visible
  knob the user controls. Estimating input tokens precisely requires
  the provider's tokenizer (per-model, often a separate dep). The
  output-cap surface is the high-leverage point; biting off input
  tokens too is a future Phase β refinement.
- **Per-instance vs. process-scoped budget.** Multiple paid provider
  instances in one process must share a single budget (an attacker
  could otherwise construct ten providers and get 10× the headroom).
  Default: the budget is auto-created from env on first paid-provider
  construction and re-used; the constructor accepts an explicit
  `budget` option for tests and for harness composition.
- **Default values chosen to be aggressive but operationally sane.**
  50 calls × 1024 tokens = 51,200 tokens of output ceiling, which is
  comfortably an order of magnitude under "1 USD" on every tier-1
  paid provider the codebase targets at the time of writing. Real
  enterprise consumers can raise via env without code changes.

## Consequences

- +1 source module: `src/providers/llm/budget.ts` (~80 LOC).
- 1 new EARS AC: AC-NF-8 added to `spec.md` § Non-functional.
- Paid providers' `generate()` gain a single `budget.reserve()`
  call before `fetch`. Mock + Ollama untouched (no billing surface).
- `health()` semantics unchanged.
- New env vars documented in `docs/PROVIDERS.md` (folded into the
  L9 task list at T-37).

## Non-goals (deferred)

- Per-second rate limiting (kept out of scope; budget caps the
  total, not the rate).
- Per-account spend tracking across processes (file-backed or
  similar). Out of scope: this is a CLI scanner, not a daemon.
- Multi-region failover or provider rotation under throttle. Out
  of scope for Phase 1.

## Verification

- Unit tests in `tests/unit/providers-llm-budget.test.ts` cover each
  ceiling firing individually, the poisoned-state invariant, env-
  driven configuration, and a behavioural test that confirms paid
  providers do not invoke `fetch` when reserve throws.
- Existing T-13 paid provider tests gain integration coverage: when
  a fresh paid provider is constructed without overriding budget,
  it behaves identically to today for the first 50 calls; the
  51st throws.
