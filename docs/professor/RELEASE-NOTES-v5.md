# v5.0.0 — Whiteboard Redesign

**Date:** 2026-04-20
**Type:** Major release (breaking changes)

## Summary

v5 is a single-PR rewrite of the whiteboard skill that replaces the v4 prompt-level scheduling with a **JIT iterator** in `scripts/whiteboard.js`. The iterator structurally enforces "teach before discuss" — there is no way to advance a session without going through `next-concern` / `next-component`, each of which returns the concepts that must be taught before discussion. Professor-teach now runs **inline** (visible to the user) rather than as a background subagent, and concept resolution is handled by a **haiku two-stage retrieve-rerank** matcher. Requirements are driven by a new **research-backed 19-concern catalog** (ISO 25010, AWS Well-Architected, DDIA, Google SRE, OWASP, 12-Factor) that accounts for all 407 L1 seed concepts.

## Breaking changes

### Removed flags

| Script | Flag | Replacement |
|--------|------|-------------|
| `update.js` | `--add-alias` | Aliases removed from v5 concept model |
| `update.js` | `--notes` | `update.js` writes teaching notes to `## Teaching Guide` directly |
| `lookup.js reconcile` | `--mode alias` | Alias reconciliation removed |
| `gate.js` | `--force-proceed` | Gate is now a post-hoc audit; bypass is no longer meaningful |

### Removed features

- `gate.js schedule` subcommand — replaced by `whiteboard.js register-selection` and `register-components`.
- `gate.js checkpoint` outcomes `circuit_breaker` and `degraded` — gate is now 2-outcome: `passed` / `blocked`.
- Concept profile frontmatter fields: `aliases`, `related_concepts`, `scope_note`, `documentation_url`.
- Concept profile body sections: `## Notes` and `## Key Points` — consolidated into `## Teaching Guide`.
- `agents/concept-agent.md` — replaced by `agents/concept-matcher.md`.
- `skills/whiteboard/protocols/concept-check.md` — subsumed into the rewritten `SKILL.md`.

### Behavior changes

- **Registry-driven metadata in `update.js`.** When a concept exists in `data/concepts_registry.json`, caller-supplied `--level` / `--parent-concept` / `--is-seed-concept` are ignored and a warning is emitted to stderr. Registry is the source of truth.
- **Explicit parent required for L2.** Non-registry concepts now **require** `--parent-concept <L1_id>` on `update.js` create. The parent must itself exist in the registry.
- **Sessions in v4 schema cannot be auto-migrated.** The session shape changed significantly; v4 sessions must be discarded via `whiteboard.js init-session --force-new`.

## New features

### `scripts/whiteboard.js` — 15 subcommands

JIT iterator + phase orchestration. Replaces `gate.js schedule` and the ad-hoc skill prose that drove v4 phase flow.

| Phase | Subcommands |
|-------|-------------|
| Phase 0 | `init-session`, `resume-session` |
| All phases | `phase-start`, `phase-complete` |
| Phase 1 | `register-selection`, `next-concern`, `mark-concern-done` |
| Phase 2 / 3 | `register-components`, `next-component`, `mark-component-done` |
| Teaching loop | `record-concept`, `record-discussion`, `mark-skipped` |
| Phase 4 | `export-design-doc`, `finish` |

The only way to advance through concerns or components is through `next-*`, which returns the unit plus the concepts that must be taught first.

### `agents/concept-matcher.md`

Replaces `concept-agent.md` with a **haiku two-stage retrieve-rerank**:

- **Stage 1 — Retrieve:** returns top-K candidates from a thin universe (IDs + one-line scope). Cheap, high-recall.
- **Stage 2 — Rerank:** makes the final `match` / `no_match` / `propose_l2` decision over the top-K with full metadata.

The matcher is also the chokepoint for novel L2 creation — a proposed L2 must flow through `lookup.js record-l2-decision` before `update.js` will create it. This is what prevents duplicate orphan L2s.

### `data/concerns.json` — research-backed 19-concern catalog

19 concerns spanning the design space. Every one of the 407 L1 seeds is accounted for: **291 mapped + 116 explicit orphans**, with each L1 mapped to at most 4 concerns. Sources: ISO/IEC 25010, AWS Well-Architected, Kleppmann DDIA, Google SRE, OWASP, 12-Factor App.

Invariants enforced by `scripts/validate-concerns.js`:

- Every registry L1 appears in either some concern's `mapped_seeds` or in `orphan_l1s` (disjoint).
- Each L1 is mapped to at most 4 concerns.

### Registry-driven L1 / L2 hierarchy

Hard rule: **in `data/concepts_registry.json` → L1, else → L2**. Levels are looked up, never LLM-inferred. L2 creation requires an explicit `--parent-concept <L1_id>` that exists in the registry. This eliminates a large class of classification errors present in v4.

### New `lookup.js` subcommands

- `session-exists` — idempotent session presence check for `--continue` flow.
- `concept-state` — FSRS-status derivation at resolution time.
- `list-l2-universe` — thin universe (id + scope) for matcher Stage 1.
- `find-l2-children` — reverse lookup from L1 parent to existing L2 children.
- `record-l2-decision` — idempotency barrier for novel L2 proposals.

## Migration

### User profile migration

`scripts/migrate-v5.js` operates against `~/.claude/professor/concepts/`. It:

- Drops deprecated frontmatter fields (`aliases`, `related_concepts`, `scope_note`, `documentation_url`).
- Merges `## Notes` and `## Key Points` content into a `## Teaching Guide` section.
- Preserves `## Description` and FSRS state untouched.
- Sets `schema_version: 5`.
- Is **idempotent** — safe to re-run.

**Recommended:** back up `~/.claude/professor/concepts/` before upgrading.

```bash
# Back up
cp -R ~/.claude/professor/concepts ~/claude-professor-backup-$(date +%Y%m%d)

# Preview (no changes written)
node scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts --dry-run

# Commit
node scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts
```

### Active v4 sessions

v4 sessions cannot be auto-migrated — the v5 session schema is structurally different. Discard the old session and start fresh:

```bash
node scripts/whiteboard.js init-session \
  --task "<your task>" \
  --session-dir docs/professor/ \
  --force-new
```

## Architecture changes

v5 is a **three-layer separation** with a **post-hoc audit**:

- **`scripts/whiteboard.js`** — JIT iterator + phase orchestration. Owns the session lifecycle.
- **`scripts/session.js` / `lookup.js` / `update.js`** — state I/O, read queries, registry-validated writes.
- **`scripts/gate.js checkpoint`** — post-hoc 2-outcome audit (`passed` / `blocked`). Does not gate mid-conversation progress.

The whiteboard skill prose is a **thin narrator** over `whiteboard.js`. The skill's only job is to drive the conversation, dispatch the matcher (as a subagent) and professor-teach (**inline**), and feed structured outputs back into the script. Every advance through concerns or components is gated by `next-concern` / `next-component`. The 4-phase flow (requirements → HLD → LLD → deliverable) structurally enforces "teach before discuss" — there is no other way to move forward.

## Test suite

- **210+ contract tests** under `tests/contract/` covering each `whiteboard.js` / `lookup.js` / `update.js` / `session.js` / `gate.js` subcommand, plus schema validation for matcher and professor-teach outputs.
- **13 integration scripts** under `tests/integration/` validating end-to-end CLI chains (phase flows, resume, finish, export-design-doc, matcher stage 1 & 2, migration, status mapping, smoke test).
- **Migration fixtures** under `tests/fixtures/profiles-v4/` and `tests/fixtures/profiles-v5-expected/` — 6 fixture pairs with diff-based assertions.
- **Matcher regression suite** — 20-30 fixtures across Stage 1 / Stage 2 under `tests/fixtures/matcher-regression/`.
