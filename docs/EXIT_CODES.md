# Exit codes

`mcp-guard` exits with codes aligned to [POSIX sysexits.h](https://man.openbsd.org/sysexits.3)
so consumers (shell pipelines, CI gates, watchdogs) can branch on outcome
without parsing stderr. This page is the canonical mapping; `src/errors/types.ts`
is the machine-readable mirror, and the two must stay in sync (a unit test
in `tests/unit/errors.test.ts` asserts equivalence).

## Mapping

| Code | Name                       | Meaning                                                      |
| ---: | -------------------------- | ------------------------------------------------------------ |
|    0 | `Success`                  | Scan completed; no findings at or above the threshold.       |
|    1 | `FindingsExceedThreshold`  | Scan or harness completed; one or more findings at or above the configured severity threshold (per `--severity`). |
|    2 | `InvalidInput`             | Input file (`.mcp.json`, skill, prior report) parsed but failed semantic validation. |
|   64 | `UsageError`               | CLI was invoked with an unknown subcommand, unknown flag, or missing required argument. |
|   65 | `DataFormatError`          | Input file failed structural parsing (malformed JSON / YAML). |
|   70 | `InternalError`            | Bug or unexpected condition inside `mcp-guard`. Please file an issue. |
|   74 | `IoError`                  | Filesystem read / write failure (permission denied, ENOSPC, etc). |
|   78 | `ConfigError`              | Misconfiguration: contradictory flags, env var present but provider unset, schema mismatch. |

## Why sysexits.h alignment

`sysexits.h` is the BSD/POSIX-derived convention for exit codes in the 64–78
band, distinguishing operational misuse from program bugs. CI gates and shell
pipelines that already handle sysexits codes will get useful branching for
free; consumers that only care about success/failure can keep treating
non-zero as a single failure class.

## Convention for adding new codes

1. Reserve the lowest free sysexits-band code that semantically fits (see
   the BSD man page for the canonical table).
2. Add the constant to `src/errors/types.ts` `ExitCode`.
3. Add a corresponding `McpGuardError` subclass in `src/errors/index.ts`.
4. Add a row to the table above.
5. Update `tests/unit/errors.test.ts` so the equivalence assertion still
   passes.
6. Document the introduction in the release notes for the version that
   introduces it; never re-use a code with new semantics across versions.

## See also

- [POSIX sysexits man page](https://man.openbsd.org/sysexits.3)
- `src/errors/` — implementation and typed hierarchy
- ADR-0003 §6 — design rationale for sysexits alignment (AC-005-6)
