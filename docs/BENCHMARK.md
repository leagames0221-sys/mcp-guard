# Benchmark — F-001 scanner TP / FP rate (AC-α-5)

`mcp-guard`'s benchmark methodology is **labelled-fixture differential**:
each input config has a sibling `<name>.expected.json` that names the
ruleIds the scanner is expected to emit. The benchmark script runs every
fixture through the real scanner registry and reports per-rule TP / FP /
FN counts.

Run locally:

```bash
pnpm exec tsx scripts/benchmark.ts
```

The script emits a text table to stdout (suitable for paste into PR
review notes) and writes
[docs/BENCHMARK.generated.md](BENCHMARK.generated.md) so the latest
machine-readable output is committed alongside the human-curated table
on this page. Exit code is 0 when TP / FP / FN are all zero of error;
non-zero on any drift so a future CI gate can branch.

## Methodology

| Aspect | Choice |
|---|---|
| Sample | 5 hand-curated MCP server configs covering all 4 scanner categories + 1 clean baseline |
| Scoring | Per-rule per-fixture binary (rule fired on fixture or not). Multiplicity ignored — the load-bearing question is detection, not count. |
| FP definition | Rule emitted but not in expected set |
| FN definition | Rule in expected set but not emitted |
| Ground truth | Hand-labelled `.expected.json` alongside each fixture; rationale captured in `note` field |

The fixture set is intentionally small + focused at this phase. The
labels are derived from the scanner's documented behaviour, so any
fixture that produces FP or FN is either (a) a scanner regression or
(b) a fixture mistake — both worth surfacing.

## Sample composition

| Fixture | Category exercise | Expected rule count |
|---|---|---:|
| `01-clean-production.json` | None (negative control) | 0 |
| `02-cloud-metadata-ssrf.json` | SSRF | 1 |
| `03-supply-chain-mixed.json` | Supply chain (3 rules at once) | 3 |
| `04-auth-gap-cluster.json` | Auth gap (4 rules in one config) | 4 |
| `05-command-injection.json` | Command injection (3 rules) | 3 |

11 expected rule firings across 5 fixtures. Real-world MCP configs would
typically exhibit clusters like fixture 04 (one auth-gap-shaped error
trips multiple rules); the test harness handles multi-rule fixtures
naturally because expected.json is a list.

## Current results (2026-05-19)

| Rule | TP | FP | FN |
|---|---:|---:|---:|
| AUTH-GAP-BASIC-AUTH-PLAINTEXT | 1 | 0 | 0 |
| AUTH-GAP-NO-AUTHORIZATION | 1 | 0 | 0 |
| AUTH-GAP-URL-CREDENTIAL | 1 | 0 | 0 |
| AUTH-GAP-WEAK-BEARER | 1 | 0 | 0 |
| CMDINJ-CURL-PIPE-SHELL | 1 | 0 | 0 |
| CMDINJ-SHELL-INTERPRETER | 1 | 0 | 0 |
| CMDINJ-SHELL-METACHAR | 1 | 0 | 0 |
| SSRF-CLOUD-METADATA | 1 | 0 | 0 |
| SUPPLY-CHAIN-EPHEMERAL-HOST | 1 | 0 | 0 |
| SUPPLY-CHAIN-UNPINNED-VERSION | 1 | 0 | 0 |
| SUPPLY-CHAIN-UNSCOPED-PACKAGE | 1 | 0 | 0 |
| **TOTAL** | **11** | **0** | **0** |

Per-fixture scan time on developer hardware (Node v24, Windows) is
sub-millisecond per detector except for the cold-load on the first
fixture (a few ms). Net: the benchmark suite runs end-to-end in under
20 ms — well within the 60-second F-001 perf budget (AC-001-1).

## Coverage gaps (known, deliberate)

The current sample covers 11 of 18 ruleIds (≈ 61 %). Untested-in-benchmark
rules:

| Rule | Reason untested in benchmark |
|---|---|
| SSRF-LOOPBACK | Already covered by unit + e2e tests; not duplicated here |
| SSRF-PRIVATE-IP | Same |
| SSRF-NON-HTTP-SCHEME | Same |
| CMDINJ-INTERPRETER-EVAL | Same |
| CMDINJ-ENV-INJECTION | Same |
| AUTH-GAP-PLAINTEXT-CREDENTIAL | Already covered by unit tests with full vendor matrix |
| SUPPLY-CHAIN-RAW-CONTENT | Already covered by unit + F-001 e2e dirty fixture |

The benchmark is a **differential** signal layered on top of unit + e2e
coverage — its job is to catch drift across the scanner registry, not to
replace per-rule unit tests. Each of the rules above has a dedicated
fixture in `tests/fixtures/mcp/` driving the scanner unit tests.

## Adding new benchmark fixtures

1. Place `tests/fixtures/benchmark/NN-name.json` with a realistic
   MCP-server-shaped config.
2. Add `tests/fixtures/benchmark/NN-name.expected.json` with:
   - `ruleIds[]` — the set of ruleIds the scanner should fire on this
     fixture.
   - `note` — one-line rationale (why these rules, why not others) so a
     future reviewer can understand the labelling decision.
3. Run `pnpm exec tsx scripts/benchmark.ts` to verify the labels match
   the scanner's actual emission.
4. Commit both files in the same change so the fixture and its ground
   truth never drift apart.

## Future work

- **Public MCP server config sample.** The current fixture set is
  synthetic. Once a public MCP server registry (or a representative
  cross-vendor sample) is available, fold it in to widen coverage
  beyond hand-curated cases.
- **Per-IDE config dialect.** Different MCP-host IDEs use slightly
  different `.mcp.json` shapes (Claude Code vs Cursor vs Windsurf). The
  benchmark can be extended with per-IDE fixtures once the parser
  supports those dialects. See [ADR-0004](adr/0004-golf-scanner-audit-outcome.md)
  for the reference-only IDE list informing this future-work scope.
