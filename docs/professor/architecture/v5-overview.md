# v5 Architecture Overview

> The auto-generated component codemaps under `components/` and the
> `_index.md`, `data-flow.md`, `tech-stack.md` files reflect a v4-era snapshot.
> Re-run `/analyze-architecture --update` to regenerate them against v5 code.
> This file is a hand-written overview of the v5 design changes.

## The v5 Shift

v5 is a single-PR rewrite of the whiteboard skill that replaces v4's
prompt-level concept scheduling with a **JIT iterator** in
`scripts/whiteboard.js`. The iterator structurally enforces "teach before
discuss": advancing through concerns or components is only possible via
`next-concern` / `next-component`, each of which returns the unit plus the
concepts that must be taught first. Skill prose is a **thin narrator**.

## Three-Layer Separation

```
skills/whiteboard/SKILL.md
    └─ drives ─>  scripts/whiteboard.js     (JIT iterator + phase orchestration)
                      │
                      ├─ reads/writes ─>  scripts/session.js   (state I/O)
                      ├─ reads ─────────>  scripts/lookup.js   (read queries)
                      └─ writes ────────>  scripts/update.js   (registry-validated writes)

scripts/gate.js checkpoint   (post-hoc audit — 2-outcome: passed / blocked)
```

- **`whiteboard.js`** owns session lifecycle, phase gates, and JIT concept
  resolution. 15 subcommands.
- **`session.js`** — v5 session schema create / load / update / add-concept /
  finish. Atomic writes via temp+rename.
- **`lookup.js`** — read queries (`session-exists`, `concept-state`,
  `list-l2-universe`, `find-l2-children`) plus the `record-l2-decision`
  idempotency barrier.
- **`update.js`** — registry-validated concept writes. Rejects caller-supplied
  `--level` / `--parent-concept` when the concept exists in the registry
  (registry is truth). Requires `--parent-concept <L1_id>` for non-registry
  concepts.
- **`gate.js checkpoint`** — post-hoc 2-outcome audit. Does not gate
  mid-conversation progress; verifies coverage after each phase.

## Subagent + Inline Split

Concept resolution and teaching are split deliberately:

- **`agents/concept-matcher.md`** — haiku two-stage retrieve-rerank. Dispatched
  via the Agent tool. Replaces v4's `concept-agent.md`.
  - Stage 1: cheap retrieval from a thin universe (id + scope only).
  - Stage 2: rerank over top-K with full metadata → `match` / `no_match` /
    `propose_l2`.
- **`skills/professor-teach/SKILL.md`** — runs **inline** in the conversation.
  The user must see the teaching. Background dispatch is explicitly forbidden.

The matcher is the **chokepoint for novel L2 creation**: proposed L2s must go
through `lookup.js record-l2-decision` before `update.js` will create them.
This prevents duplicate orphan L2s.

## Concerns Catalog (Requirements Phase)

`data/concerns.json` — 19 research-backed concerns. Every one of the 407 L1
seed concepts is accounted for (**291 mapped + 116 explicit orphans**), with
each L1 mapped to at most 4 concerns. Sources: ISO/IEC 25010, AWS Well-Architected,
Kleppmann DDIA, Google SRE, OWASP, 12-Factor App. Invariants are enforced by
`scripts/validate-concerns.js`.

## 4-Phase Flow

| Phase | Responsibility | Key subcommands |
|-------|----------------|-----------------|
| 0 | Init / resume | `init-session`, `resume-session` |
| 1 | Requirements | `register-selection`, `next-concern`, `mark-concern-done`, `gate.js checkpoint` |
| 2 | HLD | `register-components`, `next-component`, `mark-component-done`, `gate.js checkpoint` |
| 3 | LLD (optional) | `register-components`, `next-component`, `mark-component-done`, `gate.js checkpoint` |
| 4 | Deliverable | `export-design-doc`, `finish` |

`phase-start` / `phase-complete` bracket each phase. `record-concept` and
`record-discussion` capture inline teaching and unit discussion.
`mark-skipped` handles user "skip" or remediation paths.

## Registry-Driven Hierarchy

Hard rule: **in `data/concepts_registry.json` → L1, else → L2.** Levels are
looked up, not LLM-inferred. L2 creation requires an explicit
`--parent-concept <L1_id>` that itself exists in the registry.

## New / Renamed Files in v5

| Path | Status | Notes |
|------|--------|-------|
| `scripts/whiteboard.js` | new | JIT iterator (15 subcommands) |
| `scripts/migrate-v5.js` | new | v4 → v5 profile migration |
| `scripts/validate-concerns.js` | new | Catalog invariant checker |
| `agents/concept-matcher.md` | new | Replaces `concept-agent.md` |
| `data/concerns.json` | new | 19 research-backed concerns |
| `data/concerns-mapping-notes.md` | new | Rationale for seed mappings |
| `scripts/gate.js` | refactored | 2-outcome checkpoint; `schedule` removed |
| `scripts/update.js` | refactored | Registry-driven; `--add-alias` / `--notes` removed; `--parent-concept` required for non-registry |
| `scripts/lookup.js` | refactored | 5 new commands; alias-mode `reconcile` removed |
| `scripts/session.js` | refactored | v5 schema; `migrate-from-v4` added |
| `skills/whiteboard/SKILL.md` | rewritten | Thin narrator over `whiteboard.js` |
| `skills/professor-teach/SKILL.md` | rewritten | Inline invocation; FSRS-status-driven |
| `agents/concept-agent.md` | deleted | |
| `skills/whiteboard/protocols/concept-check.md` | deleted | |

## Reference

- Spec: `docs/professor/designs/2026-04-20-v5-whiteboard-redesign.md`
- Implementation plan: `docs/superpowers/plans/2026-04-20-v5-whiteboard-redesign.md`
- Release notes: `docs/professor/RELEASE-NOTES-v5.md`
