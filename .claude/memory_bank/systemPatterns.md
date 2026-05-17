# System patterns — mcp-guard

> Architectural patterns and conventions used in this codebase. Updated as design solidifies.

## Layering (planned, Phase 1)

```
┌─────────────────────────────────────────────────┐
│ Layer 3: CLI (cli/, vitest-tested)              │
│  - mcp-guard scan <target>                      │
│  - mcp-guard inject <skill>                     │
│  - mcp-guard suggest <report>                   │
└─────────────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────────────┐
│ Layer 2: Probe / Detector / Harness            │
│  (inherited pattern from NVIDIA/garak)          │
│  - probes/   = attack vectors (corpus-based)    │
│  - detectors/= verdict logic per probe          │
│  - harness/  = orchestrator + reporter          │
└─────────────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────────────┐
│ Layer 1: Scanner registry                       │
│  (inherited pattern from protectai/llm-guard)   │
│  - registered modular scanners                  │
│  - fail-fast or warn-only modes                 │
└─────────────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────────────┐
│ Layer 0: I/O + Schema                           │
│  - input parsers (.mcp.json, skill yaml, prompt fixture)
│  - output emitters (SARIF, JSON, console)       │
└─────────────────────────────────────────────────┘
```

## Conventions

- **Module style**: ES modules (Node 20+), no CommonJS
- **Test style**: vitest, colocated `*.test.ts`
- **Naming**: kebab-case files, PascalCase classes, camelCase functions
- **Error handling**: typed errors (no untyped throws), explicit Result<T, E> where useful
- **Logging**: structured (pino or similar), JSON output by default

## ADR cadence

Any decision affecting ≥ 2 modules or external interface → new ADR. Sequential numbering. `Status: Proposed → Accepted → Superseded`.

## Forbidden patterns

- No global mutable state
- No `eval` or `new Function`
- No silent failures (every error path either bubbles or logs)
- No mock data in production code paths
