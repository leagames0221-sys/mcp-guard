# ADR-0005: MCP specification upstream pin + drift detection

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: tomohiro takada
- **Supersedes**: none
- **Builds on**: ADR-0003 §D-008 (build-time fetch + vendored snapshot + CI diff)

## Context

mcp-guard scans `.mcp.json` configurations against the structural rules of
the Model Context Protocol. Upstream MCP specification evolves outside this
project's release cadence; an unannounced breaking change to the spec would
either silently produce false negatives (scanner accepting newly invalid
shapes) or false positives (scanner rejecting newly valid shapes) without
warning.

D-008 chose a build-time fetch + vendored snapshot + CI diff strategy to
make spec drift loud and traceable rather than silent. ADR-0003 left the
pin SHA selection open, with the expectation that this ADR captures it.

## Decision

### 1. Canonical upstream

The canonical MCP specification source is
[modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol).
mcp-guard pins to a specific commit SHA from that repository, recorded in
`src/scanners/mcp-schema/upstream-commit.txt`.

### 2. Initial pin

The initial pin is set during the first run of `scripts/update-mcp-schema.ts`
in CI: the script fetches the current HEAD commit SHA from the canonical
repo's default branch, writes it to `upstream-commit.txt`, derives the
local snapshot from the published schema, and commits both files together.
This ADR is accepted with the expectation that the initial pin lands as a
follow-up commit referencing this ADR.

Until that initial-pin commit lands, `upstream-commit.txt` carries the
literal placeholder `UNPINNED-INITIAL-RUN-DEFERRED` and the drift workflow
skips the diff check (an explicit ratchet visible in CI logs).

### 3. Drift detection workflow

`.github/workflows/mcp-schema-drift.yml` runs on push to main and on a
weekly schedule. It executes `scripts/update-mcp-schema.ts --check`, which:

1. Fetches the latest commit SHA from the upstream default branch.
2. Compares to the locally pinned SHA.
3. If different, regenerates the local snapshot, computes a structural diff
   against `src/scanners/mcp-schema/snapshot.json`, and writes the diff to
   `mcp-schema-drift-report.json`.
4. Exits non-zero on any structural change.

A failing run blocks merge to main. The maintainer's response is one of:

- **Adopt**: run the script without `--check`, commit the regenerated
  snapshot + bumped SHA in a single commit that cites this ADR and notes
  any breaking changes for downstream consumers.
- **Defer**: pin to an older SHA explicitly (annotated in
  `upstream-commit.txt`) and document the rationale in a follow-up ADR.

### 4. Re-pin protocol

Updates land via a single commit touching only
`src/scanners/mcp-schema/snapshot.json` + `src/scanners/mcp-schema/upstream-commit.txt`.
The commit message must:

- Reference this ADR.
- Cite the upstream commit being adopted (full SHA + summary line).
- Summarize structural deltas in the snapshot (added / removed / renamed
  fields).
- Note any downstream consumer impact (scanner false-positive / false-
  negative risk windows).

### 5. Snapshot format

`snapshot.json` is a derived JSON Schema (draft-2020-12) representing the
`.mcp.json` configuration shape mcp-guard understands. It is NOT a verbatim
copy of upstream's schema files; instead it is the minimal subset needed for
scanner / detector validation. This keeps the diff signal-to-noise high
when upstream changes unrelated parts of the spec (server registration
lifecycle, protocol message framing, etc).

## Consequences

**Positive**:

- Spec drift becomes a CI signal, not a silent regression.
- Single source of truth (`upstream-commit.txt`) for the version mcp-guard
  is validated against.
- Snapshot regeneration is deterministic and reviewable in PR diffs.

**Negative**:

- One additional GitHub Actions workflow contributes to monthly free-tier
  minutes (~5 minutes/week = 20 minutes/month, well within budget).
- Pin updates are a serialized human-in-the-loop step (the script does not
  auto-merge breaking changes).

**Risks**:

- Upstream renames or moves: if `modelcontextprotocol/modelcontextprotocol`
  is renamed, the script's hard-coded URL breaks. Mitigation: the script
  emits an actionable error referencing this ADR's "canonical upstream"
  section so the maintainer can update both at once.
- Upstream goes private or 404s: the workflow fails loudly; the maintainer
  can pin to the last-known-good local snapshot until upstream re-emerges
  or a successor spec is identified.

## References

- [modelcontextprotocol/modelcontextprotocol on GitHub](https://github.com/modelcontextprotocol/modelcontextprotocol)
- ADR-0003 §D-008 — vendored snapshot tradeoff
- `src/scanners/mcp-schema/` — implementation
- `scripts/update-mcp-schema.ts` — fetcher + diff utility
- `.github/workflows/mcp-schema-drift.yml` — CI drift workflow
