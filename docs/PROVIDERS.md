# LLM providers

`mcp-guard` ships with four LLM provider implementations behind the
`LlmProvider` interface ([src/providers/llm/types.ts](../src/providers/llm/types.ts)).
Provider selection is **caller-explicit**: the harness and remediation engine
never construct a paid provider automatically.

## Provider matrix

| Provider | Default | Network | Credit card | Notes |
|---|---|---|---|---|
| `mock` | ✅ | none | — | Deterministic sha256-keyed canned table; AC-002-2 mandatory fallback + AC-NF-3 CI-safe default |
| `ollama` | when reachable | localhost only | — | Default model `gemma3:4b`, host pinned to `http://localhost:11434` (AC-NF-5) |
| `anthropic` | env-gated | api.anthropic.com | — (key only) | Requires `ANTHROPIC_API_KEY` + `MCP_GUARD_LLM_PROVIDER=anthropic`; default model `claude-sonnet-4-6` |
| `openai` | env-gated | api.openai.com | — (key only) | Requires `OPENAI_API_KEY` + `MCP_GUARD_LLM_PROVIDER=openai`; default model `gpt-4o-mini` |

## Paid-API defense (load-bearing)

mcp-guard implements a **6-layer paid-API defense** so a misbehaving environment
or a malicious script cannot drive a paid provider to spend operator funds
without explicit consent:

1. **Constructor gate (AC-NF-1)** — both `AnthropicLlmProvider` and
   `OpenAiLlmProvider` require a 2-factor env check at construction time
   (API key + `MCP_GUARD_LLM_PROVIDER=<name>`). Missing either factor →
   `ConfigError` thrown immediately, no instance created.
2. **Pre-flight budget reserve (AC-NF-8, ADR-0006)** — each paid
   `generate()` call decrements a per-process budget before the network
   request: per-call max 1024 tokens, per-process cumulative 50,000
   tokens, per-process call count 50. Once any ceiling is breached, the
   budget enters a poisoned state and every subsequent call literal-blocks
   regardless of remaining headroom. Env overrides (`MCP_GUARD_LLM_MAX_*`)
   let operators raise the ceiling at deploy time.
3. **Key non-leak (D2-Security)** — error messages never include the API
   key literal. Unit tests assert via `.not.toContain('sk-test-…')`.
4. **CI auto-call ban (AC-NF-3)** — the default vitest `beforeEach` swaps
   `fetch` to an unstubbed throw, so an accidental network call in a test
   surfaces immediately rather than billing real credit.
5. **Default provider = mock** — every entry point (harness, remediation
   engine, suggest subcommand) defaults to `MockLlmProvider` when no
   provider is supplied. Auto-selection NEVER swaps to a paid provider;
   only mock fallback is automatic.
6. **Credit-card-required service zero** — every CI dependency (GitHub
   Actions free tier, npm registry, vendored MCP schema mirror) is free-
   tier-accessible without a payment method on file.

For threat-model rationale see [ADR-0006](adr/0006-paid-api-budget-guard.md).

## Selecting a provider

### Mock (default everywhere)

```bash
mcp-guard inject                          # uses mock automatically
mcp-guard suggest report.json             # mock; output labeled source=template
```

### Ollama (default local)

```bash
ollama pull gemma3:4b                     # one-time
ollama serve                              # background daemon on localhost:11434

MCP_GUARD_LLM_PROVIDER=ollama \
  mcp-guard inject                        # uses local Ollama
```

If Ollama health-probe fails (daemon not running, connection refused), the
harness logs a single stderr warning and falls back to mock — never to a
paid provider.

### Anthropic (paid, env-gated)

```bash
export ANTHROPIC_API_KEY=...
export MCP_GUARD_LLM_PROVIDER=anthropic
mcp-guard inject                          # routes through claude-sonnet-4-6

# Optional per-process budget caps (defaults shown):
export MCP_GUARD_LLM_MAX_TOKENS_PER_CALL=1024
export MCP_GUARD_LLM_MAX_TOKENS_PER_RUN=50000
export MCP_GUARD_LLM_MAX_CALLS_PER_RUN=50
```

The constructor refuses to instantiate without **both** env vars. Missing
either factor → `ConfigError` exit 78 with an actionable message naming
the missing factor.

### OpenAI (paid, env-gated)

```bash
export OPENAI_API_KEY=...
export MCP_GUARD_LLM_PROVIDER=openai
mcp-guard inject                          # routes through gpt-4o-mini
```

Same constructor gate + budget guard as Anthropic. Same defense layers
apply.

## Mock provider determinism

The mock provider keys its 8-entry canned response table by SHA-256 of the
prompt, so the same probe corpus produces the same harness report on every
machine. This makes:

- CI reports reproducible across runners.
- The F-002 e2e determinism spec (two-runs-same-projected-report) reliable.
- Local smoke checks comparable to upstream pinning.

See [src/providers/llm/mock.ts](../src/providers/llm/mock.ts) for the
canned table.

## Ollama host containment (AC-NF-5)

The Ollama provider's `DEFAULT_HOST` is hard-pinned to
`http://localhost:11434`. The provider does NOT honour an environment
override that would point at a non-loopback host; if the operator wants to
target a remote Ollama, they must pass an explicit `host` option to the
constructor at the calling site. This is the cheapest place to enforce
"local LLM never beacons out".

## Adding a new provider

1. Implement `LlmProvider` from [src/providers/llm/types.ts](../src/providers/llm/types.ts).
   Required methods: `generate(prompt, opts?): Promise<string>` and
   `health(): Promise<boolean>`.
2. If the provider is paid, add a constructor gate matching the 2-factor
   pattern (API key + `MCP_GUARD_LLM_PROVIDER=<name>` flag).
3. Wire pre-flight `budget.reserve()` into the `generate()` entry point
   before any network call — see [src/providers/llm/anthropic.ts](../src/providers/llm/anthropic.ts)
   for the canonical pattern.
4. Add the provider name to `LlmProviderName` in
   [src/types/index.ts](../src/types/index.ts) and re-export from
   [src/providers/llm/index.ts](../src/providers/llm/index.ts).
5. Add unit tests covering: constructor gate (both factor-missing paths),
   key non-leak in errors, health() honest-false on connection refused,
   `generate()` honors the AbortSignal.
