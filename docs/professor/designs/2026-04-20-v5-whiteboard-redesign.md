# v5.0.0 — Whiteboard Redesign: Concept Lifecycle & JIT Enforcement

**Status:** Spec — ready for implementation plan
**Date:** 2026-04-20
**Target version:** 5.0.0
**Type:** Major rewrite (single ship)
**Source brainstorm:** 2026-04-20 conversation thread

---

## Table of contents

1. [Scope and issues addressed](#1-scope-and-issues-addressed)
2. [Core model](#2-core-model)
3. [Data schemas](#3-data-schemas)
4. [Concerns catalog research plan](#4-concerns-catalog-research-plan)
5. [Script contracts](#5-script-contracts)
6. [Concept-matcher agent contract](#6-concept-matcher-agent-contract)
7. [Skill contracts](#7-skill-contracts)
8. [Migration: migrate-v5.js](#8-migration-migrate-v5js)
9. [Test strategy (5-tier TDD)](#9-test-strategy-5-tier-tdd)
10. [Failure modes and degradation](#10-failure-modes-and-degradation)
11. [Implementation order](#11-implementation-order)
12. [Out of scope (deferred)](#12-out-of-scope-deferred)

---

## 1. Scope and issues addressed

### 1.1 Issues this spec resolves

| # | Issue (one-line recap) | Resolution mechanism |
|---|---|---|
| 1 | Non-registry concepts block checkpoints indefinitely (`lazy_migration`, `dual_write_pattern`, etc.) | Hard L1/L2 rule — if not in registry, treated as L2 by definition. Phase 2/3 creates them via JIT loop, never reaches gate as "missing." |
| 2 | Registry seeds block because no profile file exists (`feature_flags`) | Gate predicate checks `concepts_checked` coverage, not profile file existence. Registry presence is sufficient for "known." Profile materialized lazily on actual teach/review. |
| 4 | Concept-agent creates L2s as orphan L1s (level=1, parent=null) | `update.js` reads `level` and `is_seed_concept` from registry lookup. Caller-supplied flags ignored when registry has the concept. L2 creation requires explicit `--parent <L1>`; rejected without it. |
| 6 | professor-teach output hidden in subagent dispatch | professor-teach runs **inline** in whiteboard skill turn. `context: fork, user-invocable: false` removed. User sees teaching directly. |
| 7 | LLD phase started without gate checkpoint or concept-agent call | New `whiteboard.js` JIT iterator: `next-component` is the only way to advance. Skill structurally cannot skip the scheduling step. |
| 9 | `update.js` doesn't validate `is_seed_concept` against registry | `update.js` cross-checks registry on every write. `--is-seed-concept` and `--level` flags become advisory only — registry is authoritative. Mismatch logged as warning, registry value used. |

### 1.2 Architectural changes (in service of the above)

- **New script** `scripts/whiteboard.js` — JIT iterator + phase orchestration
- **New agent** `agents/concept-matcher.md` — replaces `concept-agent.md`, haiku-based, semantic match only
- **New data file** `data/concerns.json` — research-backed concerns catalog with `mapped_seeds`
- **New migration script** `scripts/migrate-v5.js` — one-time Notes → Teaching Guide conversion
- **Modified** `scripts/session.js` — refactored in place; keeps state I/O role; v5 schema
- **Modified** `scripts/gate.js` — simplified to 2-outcome post-hoc audit; circuit breaker removed
- **Modified** `scripts/lookup.js` — adds `find-l2-children`, `list-l2-universe`, `record-l2-decision`, `concept-state`, `session-exists`; alias mode removed
- **Modified** `scripts/update.js` — registry-driven metadata; `--add-alias` and `--notes` removed
- **Modified** `skills/whiteboard/SKILL.md` — rewrites around JIT iterator; thin narrator
- **Modified** `skills/professor-teach/SKILL.md` — inline invocation; Teaching Guide responsibility; FSRS-status-driven action
- **Deleted** `agents/concept-agent.md`
- **Deleted** `skills/whiteboard/protocols/concept-check.md` (subsumed into SKILL.md)

### 1.3 Design philosophy

**OOP-proactive over reactive-if-else.** Throughout this spec:

- Components have one responsibility (concept-matcher does semantic match; that's it)
- Contracts are explicitly typed (seed/proposed structure, action vocabulary, envelope shape)
- State transitions are declared (closed action set with input-state preconditions)
- Validation happens at boundaries upfront (registry check rejects unknowns at `register-selection`)
- Ownership is separated by file (session.js = state I/O; gate.js = audit; whiteboard.js = iteration)

The wrong direction is: scattered defensive conditionals, late type inference from context, recovery from states that shouldn't have been reachable.

### 1.4 Out of scope (resolved separately)

- **Cluster ii** (Issues 3, 5, 8) — `--notes` flag bug, `add-concept` idempotency, `finish` warnings. These become **moot in v5.0.0** because `--notes` is removed, `session.js` is refactored with new contracts, and `whiteboard.js finish` gets explicit lifecycle handling.
- **Professor-teach v2** — source-backed teaching, web search, citations, `preferred_sources.json` integration. Deferred to its own spec.
- **Permission allow-listing** — UX improvement for `settings.json` to auto-approve plugin script commands. Deferred.

---

## 2. Core model

### 2.1 Source of truth

| Question | Answer |
|---|---|
| What concepts exist? | `data/concepts_registry.json` (407 L1 seeds across 18 domains) — authoritative |
| What concepts has the user touched? | `~/.claude/professor/concepts/<domain>/<concept_id>.md` (per-user gradebook) |
| What concerns exist? | `data/concerns.json` (research-backed catalog) — authoritative |
| What domains exist? | `data/domains.json` + `data/domains/` markdown files |
| What's the current session doing? | `<session_dir>/.session-state.json` (mechanics) + `.session-log.jsonl` (narrative) |

### 2.2 The hard L1/L2 rule

```
For any concept_id encountered in any phase:
  level = 1 if registry.has(concept_id) else 2
  is_seed_concept = (level == 1)
  parent_concept = null if level == 1 else <explicit caller-supplied L1 id>
```

Three consequences:

1. **No LLM-inferred levels.** Lookup, not judgment.
2. **L1 placement is canonical.** A concept either is or isn't a seed.
3. **L2 creation requires a parent.** If `update.js` is called for a non-registry concept without `--parent`, it errors with `envelopeError('blocking', 'L2 concept requires --parent')`.

### 2.3 Three notions of "known"

| State | Meaning | Established by |
|---|---|---|
| Registered | Exists as a valid concept | Registry presence (L1) or successful L2 creation |
| Familiar | User has touched this concept | Profile file exists with any status |
| Mastered | FSRS state reflects retention | `fsrs_stability` + recent `last_reviewed` → status `skip` (R > 0.7) |

The gate checks **familiarity coverage** (was the concept formally handled this phase). FSRS handles mastery. Registration is a precondition both presume.

### 2.4 Lazy materialization

Profile files are written **only on actual teach/review/baseline**, not at concern selection or scheduling. Scheduling references concept IDs; the file appears when professor first writes one via `update.js`.

Practical consequence: a Phase 1 session that schedules 8 concerns and discovers the user already knew 5 produces 5 `status: known` files (from baseline checks) + 3 `status: taught` files (from full teaching) — not 8 empty stubs.

### 2.5 Component ownership

Each file in v5.0.0 has one responsibility. No mixed-purpose files.

| Component | Responsibility | NOT responsible for |
|---|---|---|
| `scripts/whiteboard.js` | JIT iterator + phase orchestration; calls into session.js for state mutations | FSRS interpretation, concept content, teaching delivery |
| `scripts/session.js` | Raw session-state read/write; nonce-based idempotency | Phase logic, iterator advancement, gate audit |
| `scripts/gate.js` | Post-hoc audit (2 outcomes: passed/blocked); append-only session-log | Blocking iterator advancement (that's the iterator's job) |
| `scripts/lookup.js` | Registry queries, profile queries, FSRS state computation | Decisions, writes |
| `scripts/update.js` | Concept `.md` writes; registry-validated metadata; nonce idempotency | Reading any state outside the concept being written |
| `agents/concept-matcher.md` | Semantic match for novel L2 candidates; two-stage retrieve-rerank | Resolution beyond match (no `resolve-or-create`); FSRS computation; teaching |
| `skills/whiteboard/SKILL.md` | Narrator/orchestrator; calls scripts in order; invokes professor inline; dispatches matcher subagent | Direct state writes (must go through session.js); FSRS judgments; concept teaching |
| `skills/professor-teach/SKILL.md` | Inline teaching delivery; FSRS-status-driven action choice; Teaching Guide write; grade return | Concept resolution, scheduling, session state |

### 2.6 Closed action vocabulary

professor-teach receives an FSRS status (input vocabulary) and produces an action (output vocabulary). The pairing is constrained — `whiteboard.js record-concept` rejects invalid input/output pairings.

**Input vocabulary (FSRS status, derived from gradebook + registry):**

| Status | Trigger condition |
|---|---|
| `new` | No profile file exists |
| `encountered_via_child` | Profile exists (created as L2 parent placeholder), `review_history` is empty |
| `teach_new` | Profile exists, `R < 0.3` (computed from FSRS) |
| `review` | Profile exists, `0.3 ≤ R ≤ 0.7` |
| `skip` | Profile exists, `R > 0.7` |

**Output vocabulary (professor's action):**

| Action | Valid input statuses | Grade required |
|---|---|---|
| `taught` | `new`, `encountered_via_child`, `teach_new` | Yes (1-4) |
| `reviewed` | `review`, `teach_new` (alternate path) | Yes (1-4) |
| `known_baseline` | `new` only (with strong recall answer) | Optional (derived) |
| `skipped_not_due` | `skip` only | None (null) |

`record-concept` validates: invalid pairings rejected with `envelopeError('blocking', 'Invalid action <X> for status <Y>')`.

### 2.7 Phase semantics

| Phase | Discussion unit | Concept source | Concept levels |
|---|---|---|---|
| 1 (Requirements) | Concern | `data/concerns.json` → `mapped_seeds` | L1 only |
| 2 (HLD) | Component | LLM picks seed L1s + proposes L2s; matcher validates | L1 + L2 (typed seed/proposed) |
| 3 (LLD) | Component (finer) | Same as P2; reuses Phase 2 L2s heavily | L1 + L2 (typed seed/proposed) |
| 4 (Deliverable) | (none) | (none) | (none) |

### 2.8 JIT iterator principle

The skill **cannot advance phase state without calling the iterator**. The iterator is the only producer of "what's next." Specifically:

- The skill does not know which concern/component comes next until it calls `next-concern` / `next-component`
- The skill cannot mark progress without `record-concept`, `record-discussion`, `mark-concern-done`, `mark-component-done`
- Phase transition requires `phase-complete --phase N` (which validates audit passed)

This is structural enforcement of "teach before discuss" (Issue 7). Promised by the script layer; consumed by SKILL.md prose.

### 2.9 Gate as post-hoc audit

`gate.js checkpoint --step N` is no longer a blocking enforcement mechanism mid-phase. It's a **safety net** at phase end:

- Returns `{ status: "passed" | "blocked", missing: [concept_ids], timestamp }`
- `passed` = every concept in the schedule has a matching `concepts_checked` entry
- `blocked` = the iterator was bypassed somehow (a bug or user-interrupted flow)

Under JIT iterator, `blocked` should be exceptional. When it does fire, `whiteboard.js` SKILL prompts user with remediation: `review` (teach missing concepts inline), `skip` (mark skipped with reason), `abort` (exit with state preserved for `--continue`).

No more `degraded` state. No circuit breaker.

---

## 3. Data schemas

### 3.1 `data/concerns.json` (new)

```json
{
  "schema_version": 5,
  "concerns": {
    "data_consistency": {
      "description": "Correctness across distributed writes, replicas, and concurrent modifications.",
      "keywords": ["consistency", "race", "transaction", "acid", "replica", "concurrent"],
      "mapped_seeds": [
        "optimistic_concurrency",
        "eventual_consistency",
        "two_phase_commit",
        "vector_clocks",
        "saga_pattern"
      ],
      "canonical_sources": [
        "Kleppmann DDIA ch.7",
        "ISO/IEC 25010 reliability"
      ]
    },
    "rate_limiting": {
      "description": "...",
      "keywords": ["..."],
      "mapped_seeds": ["..."],
      "canonical_sources": ["..."]
    }
  }
}
```

**Fields:**

- `description` (string, required) — one-line summary; shown to LLM at concern selection
- `keywords` (string[], required) — selection aid; LLM uses to match task context
- `mapped_seeds` (string[], required, non-empty) — L1 concept IDs; every entry must exist in `concepts_registry.json`
- `canonical_sources` (string[], optional) — provenance for audit

**Constraints (validated by `scripts/validate-concerns.js`):**

- Every `mapped_seeds` entry exists in registry
- Every L1 in registry appears in at least one concern (no orphan seeds)
- No L1 appears in more than 4 concerns (prevents over-claiming while allowing L1s that legitimately span topics like `caching_strategies` → caching + cost + scalability + performance)
- Each concern has ≥ 3 mapped seeds (narrower concerns lack teaching depth); no upper cap (some concerns like `data_consistency` or `security_and_secrets` legitimately span 15+ L1s)
- All concern IDs are unique
- Catalog count: 15-25 concerns (research-determined; not strictly enforced)

### 3.2 `<session_dir>/.session-state.json` (v5 schema)

```json
{
  "schema_version": 5,
  "session_id": "uuid-v4",
  "task": "Design a RAG pipeline with hybrid search",
  "started_at": "2026-04-20T14:30:00Z",
  "updated_at": "2026-04-20T15:12:00Z",
  "current_phase": 2,
  "concerns_catalog_version": "sha256:abc123...",
  "phases": {
    "1": {
      "status": "complete",
      "concerns": [
        {
          "id": "data_consistency",
          "source": "catalog",
          "concepts": ["optimistic_concurrency", "eventual_consistency"]
        },
        {
          "id": "webhook_retry_semantics",
          "source": "proposed",
          "concepts": ["exponential_backoff", "idempotency_key"]
        }
      ],
      "current_concern_index": null,
      "discussions": [
        {
          "concern_id": "data_consistency",
          "summary": "...",
          "open_questions": [],
          "timestamp": "..."
        }
      ]
    },
    "2": {
      "status": "in_progress",
      "components": [
        {
          "id": "retrieval",
          "concepts_seed": ["information_retrieval", "ranking_algorithms"],
          "concepts_proposed": [
            { "id": "sparse_vectors", "parent": "information_retrieval" },
            { "id": "dense_retrieval", "parent": "information_retrieval" },
            { "id": "reciprocal_rank_fusion", "parent": "ranking_algorithms" }
          ],
          "L2_decisions": [
            {
              "proposed": "rrf",
              "decision": "accept_novel",
              "matched_id": "reciprocal_rank_fusion",
              "confidence": 0.85,
              "reasoning": "..."
            }
          ],
          "concepts_checked": ["information_retrieval", "sparse_vectors"],
          "status": "in_progress"
        }
      ],
      "current_component_index": 0,
      "discussions": []
    }
  },
  "concepts_checked": [
    {
      "concept_id": "optimistic_concurrency",
      "concern_or_component": "data_consistency",
      "phase": 1,
      "grade": 3,
      "timestamp": "2026-04-20T14:45:00Z"
    }
  ]
}
```

**Removed from v4 schema:**

- `circuit_breaker` — no longer needed (gate has 2 outcomes)
- `chosen_option`, `design_options_proposed` — replaced by per-phase `discussions`
- `requirements.functional`, `requirements.non_functional` — superseded by phase 1 concerns model
- `decisions` (top-level) — folded into per-phase discussions
- `architecture_loaded`, `architecture_components_read` — read at session start; not persisted
- `feature`, `branch` — replaced by `task` (free-text)

**Migration from v4:** any active v4 session is treated as orphan; user prompted to discard or archive manually (covered in §8).

### 3.3 `<session_dir>/.session-log.jsonl` (v5)

Append-only JSONL. One event per line. Used by `--continue` for narrative reconstruction.

Event types and required fields:

| `type` | Payload fields |
|---|---|
| `session_start` | `task`, `session_id` |
| `phase_start` | `phase` |
| `concerns_selected` | `concerns: [{id, source}]`, `proposed_count` |
| `components_selected` | `components: [id]` |
| `next_concern` | `concern_id`, `concepts: [id]` |
| `next_component` | `component_id`, `concepts: [id]` |
| `professor_action` | `concept_id`, `action`, `grade`, `notes` (1-2 sentences) |
| `l2_decision` | `proposed`, `decision`, `matched_id` (if any), `confidence`, `reasoning` |
| `discussion_recorded` | `unit_id`, `summary`, `open_questions: [string]` |
| `concern_done` / `component_done` | `id` |
| `gate_audit` | `phase`, `status`, `missing: [id]` |
| `remediation_choice` | `phase`, `choice` (`review`/`skip`/`abort`), `affected: [id]` |
| `phase_complete` | `phase` |
| `session_resumed` | `from_phase`, `from_position` |
| `session_finish` | `outcome` (`completed` / `aborted`) |

**Required substance for `discussion_recorded.summary` and `professor_action.notes`:** these fields drive the resume narrative reconstruction. Both must contain meaningful 1-2 sentence content (not just "discussed X" or "taught Y"). Specified in skill prose; not enforced by script.

**Cleanup:** deleted on `whiteboard.js finish` unless `--keep-log` flag passed.

### 3.4 Concept `.md` v5 frontmatter

Same shape as v4 with these changes:

**Removed fields:**

- `aliases` (deprecated; existing field tolerated for read but not written)
- `related_concepts` (unused)
- `scope_note` (unused)
- `documentation_url` (replaced by future `preferred_sources.json` integration in professor-teach v2)

**Kept fields (unchanged from v4):**

- `concept_id` (string, required)
- `domain` (string, required)
- `schema_version` (number, set to 5 by all v5 writes)
- `level` (1 | 2)
- `parent_concept` (string | null)
- `is_seed_concept` (boolean) — derived from registry by update.js, not caller-supplied
- `difficulty_tier` (foundational | intermediate | advanced)
- `first_encountered` (ISO datetime)
- `last_reviewed` (ISO datetime | null)
- `review_history` (array of `{date, grade}`)
- `fsrs_stability` (number)
- `fsrs_difficulty` (number)
- `operation_nonce` (string | null) — v4.0.0 idempotency

### 3.5 Concept `.md` v5 body structure

```markdown
---json
{
  "concept_id": "sparse_vectors",
  ...frontmatter...
}
---

## Description

(Stable, one paragraph. Authored at concept creation. Rarely updated.)

Sparse vectors represent text as high-dimensional weighted term vectors where
most dimensions are zero. They contrast with dense embeddings...

## Teaching Guide

(Overwritten by professor on each teach/review/baseline. Bounded; current
session's actionable guidance for next teaching of this concept.)

- **Preferred analogy:** inverted index as "phone book"
- **User struggle points:** IDF intuition — took an extra pass; benefits from concrete example before formula
- **Recommended approach:** build up from BM25 → contrast with dense retrieval → introduce TF-IDF weighting
- **Recall question style:** concrete-scenario questions land better than definitional ones
- **Last outcome:** taught, grade 3/4 (2026-04-20)
```

**Sections removed from v4:**

- `## Notes` — replaced by Teaching Guide; migrated by `migrate-v5.js`
- `## Key Points` — folded into Teaching Guide

### 3.6 Validation invariants

These are enforced by their respective scripts (test fixtures in §9 verify):

| Invariant | Enforced by |
|---|---|
| `level: 1` concept must be in registry | `update.js` (registry lookup) |
| `level: 2` concept must have non-null `parent_concept` | `update.js` (rejects without `--parent`) |
| `parent_concept` must reference a registry L1 | `update.js` (registry lookup on parent) |
| Concern `mapped_seeds` reference registry L1 IDs | `validate-concerns.js` |
| Component `concepts_proposed` parent must be registry L1 | `whiteboard.js register-components` |
| FSRS state monotonic on grade update | `fsrs.js` (existing) |
| `operation_nonce` prevents double-grading | `update.js` (existing v4 logic) |

---

## 4. Concerns catalog research plan

### 4.1 Time-box

**Hard cap: 6 hours total** for the catalog build. Composed of:

- **3 hours research synthesis** — literature review + draft concern list
- **2 hours seed mapping** — assign `mapped_seeds` against registry, manual review
- **1 hour validation** — replay against PR #446/#447 sessions

If 6 hours is exceeded, ship with what exists; gaps fill organically via session-driven additions later.

### 4.2 Canonical sources

In priority order:

1. **ISO/IEC 25010** — software product quality model; 8 quality attributes
2. **AWS Well-Architected Framework** — 6 pillars (operational excellence, security, reliability, performance efficiency, cost optimization, sustainability)
3. **Designing Data-Intensive Applications** (Kleppmann) — Ch 7-12 cover consistency, replication, partitioning, transactions
4. **Software Architecture: The Hard Parts** (Ford et al.) — trade-off taxonomies
5. **Google SRE Book** — operational concerns (SLIs/SLOs, error budgets, monitoring)
6. **12-factor app methodology** — config, processes, port binding, etc.
7. **OWASP Top 10** — security concerns
8. **Existing whiteboard SKILL.md 15-item list** — battle-tested baseline

### 4.3 Synthesis method

For each candidate concern, document:

- **Provenance:** which sources name it
- **Description:** one sentence
- **Keywords:** 4-8 task-context-matching terms
- **Boundary:** what it does NOT cover (avoids overlap with sibling concerns)

Aim: 15-25 concerns at "meeting-topic" level — broader than specific patterns, narrower than ISO 25010 quality attributes.

### 4.4 Seed mapping rules

For each concern, select L1 concepts from the registry (minimum 3, no upper cap):

1. **Coverage:** every registry L1 maps to at least one concern (run `validate-concerns.js`). With 407 L1s and ~19 concerns, average mapping load is ~21 seeds per concern; concerns that are naturally narrow (e.g., `caching`) have fewer, broad ones (e.g., `data_consistency`) have more.
2. **Bounded:** any L1 maps to at most 4 concerns (prevents dilution while allowing legit cross-cutting L1s)
3. **Reasoning:** include per-seed rationale in `data/concerns-mapping-notes.md` (sibling file, human-readable)

Mapping is done by Claude with full registry in context, reviewed by maintainer in PR. The mapping-notes file makes the rationale auditable.

### 4.5 Validation

Replay PR #446 task description against the draft catalog: would it produce a sensible 5-8 concern selection? If no, identify the missing concern. Same for PR #447. This is a **smoke test**, not a formal validation — it just catches gross omissions.

### 4.6 Implementation tasks (referenced in §11)

- T-CAT-1: Research synthesis — produce `data/concerns.json` draft (3h budget)
- T-CAT-2: Seed mapping + `concerns-mapping-notes.md` (2h budget)
- T-CAT-3: Implement `scripts/validate-concerns.js` (deterministic checks)
- T-CAT-4: Run validation; fix any orphan seeds or over-mappings
- T-CAT-5: Sanity smoke against PR #446/#447 transcripts

---

## 5. Script contracts

All scripts emit JSON envelope on stdout: `{ status, data, error }`. Errors emit on stderr with non-zero exit code.

Envelope shape (existing from v4):

```json
{ "status": "ok", "data": { ... } }
{ "status": "error", "error": { "level": "fatal" | "blocking" | "warning", "message": "..." } }
```

Exit codes:

- `0` — success (status: ok)
- `1` — fatal error (script-level failure)
- `2` — blocking error (input/permission)

### 5.1 `scripts/whiteboard.js` (new, 16 commands)

#### 5.1.1 `init-session`

```
node scripts/whiteboard.js init-session --task "<text>" --session-dir <path> [--force-new]
```

**Inputs:**
- `--task` (required, string) — free-text task description
- `--session-dir` (required, path) — directory for state file (typically `docs/professor/`)
- `--force-new` (optional, flag) — discard existing state file if present

**Behavior:**
1. If `--session-dir/.session-state.json` exists and `--force-new` absent → return `envelopeError('blocking', 'Session state exists. Use --force-new to discard or call resume-session.')`
2. If `--force-new`: delete existing state + log
3. Create new state with `schema_version: 5`, `session_id: <uuid>`, `task`, `started_at: <now>`, `updated_at: <now>`, `current_phase: null`, `concerns_catalog_version: <sha256 of concerns.json>`, `phases: {}`, `concepts_checked: []`
4. Append `session_start` event to log

**Output (success):**
```json
{
  "status": "ok",
  "data": {
    "session_id": "uuid",
    "session_dir": "<path>",
    "task": "<task>",
    "schema_version": 5
  }
}
```

**Errors:**
- `blocking`: existing state without `--force-new`
- `blocking`: missing required arg
- `blocking`: `session-dir` not writable
- `fatal`: cannot read `concerns.json`

**Test fixtures (Tier 1):** `tests/contract/test-whiteboard-init-session.test.js`

#### 5.1.2 `resume-session`

```
node scripts/whiteboard.js resume-session --session-dir <path>
```

**Behavior:**
1. Read `.session-state.json` (error if missing or `schema_version != 5`)
2. Read `.session-log.jsonl` (error if missing)
3. Filter log events to narrative-bearing types: `discussion_recorded`, `professor_action`, `l2_decision`, `remediation_choice`
4. Extract human-readable fields (`summary`, `notes`, `reasoning`, `choice`) in chronological order
5. Append `session_resumed` event

**Output:**
```json
{
  "status": "ok",
  "data": {
    "session_id": "uuid",
    "current_phase": 2,
    "current_position": "components[0].concepts_checked.length=2 of 5",
    "task": "...",
    "started_at": "...",
    "narrative_summary": "Markdown-formatted reconstruction of what was discussed",
    "next_action_hint": "next-component"
  }
}
```

**Errors:**
- `blocking`: no state file
- `blocking`: `schema_version != 5` (suggest discard or migrate)
- `fatal`: corrupted JSON

**Test fixtures:** `tests/contract/test-whiteboard-resume-session.test.js`

#### 5.1.3 `phase-start`

```
node scripts/whiteboard.js phase-start --session-dir <path> --phase <1|2|3|4>
```

**Behavior:**
1. Read state
2. Validate transition: `current_phase` must be `null` (for phase 1) or `phase - 1` with status `complete`
3. Set `current_phase = phase`, initialize `phases[phase] = { status: "in_progress" }` (and other phase-specific empty fields)
4. Append `phase_start` event to log

**Output:**
```json
{ "status": "ok", "data": { "phase": 2, "transitioned_from": 1 } }
```

**Errors:**
- `blocking`: invalid phase number (must be 1-4)
- `blocking`: previous phase not complete
- `blocking`: phase already started

#### 5.1.4 `register-selection` (Phase 1 only)

```
node scripts/whiteboard.js register-selection --session-dir <path> --concerns-json '<json>'
```

**Inputs:**
- `--concerns-json` — JSON-encoded `{ concerns: [{ id, source, mapped_seeds? }] }`
  - For `source: "catalog"`: `id` must exist in `data/concerns.json`; `mapped_seeds` ignored (read from catalog)
  - For `source: "proposed"`: `id` must NOT collide with catalog; `mapped_seeds` must be supplied; each seed must exist in registry

**Behavior:**
1. Validate phase = 1, status = in_progress
2. Validate every catalog `id` exists in `concerns.json`
3. For each proposed: validate `id` not in catalog, every `mapped_seeds` entry resolves in registry (via `lookup.js reconcile --mode exact`)
4. Build `phases.1.concerns` array with `{ id, source, concepts: [<resolved L1 ids>] }`
5. Set `current_concern_index: 0`
6. Append `concerns_selected` event to log

**Output:**
```json
{
  "status": "ok",
  "data": {
    "concerns_count": 7,
    "catalog_count": 6,
    "proposed_count": 1,
    "total_concepts": 24,
    "warnings": []
  }
}
```

**Errors:**
- `blocking`: catalog ID not found
- `blocking`: proposed ID collides with catalog
- `blocking`: proposed `mapped_seeds` empty
- `blocking`: proposed seed not in registry
- `blocking`: wrong phase

**Test fixtures:** `tests/contract/test-whiteboard-register-selection.test.js`

#### 5.1.5 `register-components` (Phase 2/3, with full scheduling)

```
node scripts/whiteboard.js register-components --session-dir <path> --components-json '<json>'
```

**Inputs:**
- `--components-json` — full pre-scheduled plan:
  ```json
  {
    "components": [
      {
        "id": "retrieval",
        "concepts_seed": ["information_retrieval", "ranking_algorithms"],
        "concepts_proposed": [
          { "id": "sparse_vectors", "parent": "information_retrieval" },
          { "id": "dense_retrieval", "parent": "information_retrieval" }
        ],
        "L2_decisions": [
          { "proposed": "sparse_vectors", "decision": "accept_novel", "matched_id": "sparse_vectors", "confidence": 0.91, "reasoning": "..." }
        ]
      }
    ]
  }
  ```

**Behavior:**
1. Validate phase ∈ {2, 3}, status = in_progress
2. For each component:
   - Validate `concepts_seed` entries exist in registry
   - Validate `concepts_proposed` parent for each entry exists in registry
   - Validate `L2_decisions` covers every `concepts_proposed` entry
3. Write `phases.<N>.components` with full structure + `current_component_index: 0`
4. Append `components_selected` event

**Output:**
```json
{
  "status": "ok",
  "data": {
    "components_count": 3,
    "total_concepts": 14,
    "novel_l2_count": 5
  }
}
```

**Errors:**
- `blocking`: seed not in registry
- `blocking`: proposed parent not in registry
- `blocking`: L2_decisions doesn't cover all proposals
- `blocking`: wrong phase

**Test fixtures:** `tests/contract/test-whiteboard-register-components.test.js`

#### 5.1.6 `next-concern` (Phase 1)

```
node scripts/whiteboard.js next-concern --session-dir <path>
```

**Behavior:**
1. Validate phase = 1
2. Read `phases.1.concerns[current_concern_index]`
3. If index out of bounds → return `{ done: true }`
4. For each concept in the concern:
   - Call `lookup.js concept-state --concept <id>` to get fresh FSRS status
5. Return concern + concepts with current FSRS status
6. Append `next_concern` event

**Output:**
```json
{
  "status": "ok",
  "data": {
    "done": false,
    "concern_id": "data_consistency",
    "source": "catalog",
    "concepts": [
      {
        "concept_id": "optimistic_concurrency",
        "registry_meta": { "level": 1, "domain": "distributed_systems", "is_seed_concept": true, "difficulty_tier": "intermediate" },
        "fsrs_status": "review",
        "profile_path": "~/.claude/professor/concepts/distributed_systems/optimistic_concurrency.md"
      }
    ]
  }
}
```

When done:
```json
{ "status": "ok", "data": { "done": true, "concerns_completed": 7 } }
```

**Errors:**
- `blocking`: wrong phase
- `blocking`: no concerns scheduled (register-selection not called)

**Test fixtures:** `tests/contract/test-whiteboard-next-concern.test.js`

#### 5.1.7 `next-component` (Phase 2/3)

```
node scripts/whiteboard.js next-component --session-dir <path>
```

**Behavior:** Same as `next-concern` but for components. Returns full pre-scheduled `concepts_seed + concepts_proposed` (resolved to flat list) with fresh FSRS status per concept.

**Output:**
```json
{
  "status": "ok",
  "data": {
    "done": false,
    "component_id": "retrieval",
    "concepts": [
      { "concept_id": "information_retrieval", "registry_meta": {...}, "fsrs_status": "skip", "profile_path": "..." },
      { "concept_id": "sparse_vectors", "registry_meta": {...}, "fsrs_status": "new", "profile_path": null }
    ]
  }
}
```

**Test fixtures:** `tests/contract/test-whiteboard-next-component.test.js`

#### 5.1.8 `record-concept`

```
node scripts/whiteboard.js record-concept --session-dir <path> --concept-id <id> --unit-id <concern_or_component_id> --action <taught|reviewed|known_baseline|skipped_not_due> [--grade <1-4>] --notes "<text>"
```

**Inputs:**
- `--concept-id`, `--unit-id`, `--action` — required
- `--grade` — required when action is `taught` or `reviewed`; rejected when action is `skipped_not_due`
- `--notes` — required, 1-2 sentence summary from professor for session log (substantive content; "Taught X via analogy Y" not "taught X")

**Behavior:**
1. Read state and `phases.<current_phase>`
2. Validate `unit_id` is the current scheduled unit (concern_index or component_index)
3. Validate `concept_id` is in that unit's concept list
4. Validate `action` is in closed vocabulary
5. Validate action ↔ FSRS-status pairing (per §2.6 table) — fetches fresh FSRS status to compare
6. Validate `--grade` per action requirements
7. Append entry to `concepts_checked` (top-level): `{ concept_id, concern_or_component, phase, grade, timestamp }`
8. Append entry to component's `concepts_checked` (if Phase 2/3)
9. Append `professor_action` event to log with `notes` from `--notes` flag

**Output:**
```json
{ "status": "ok", "data": { "recorded": true } }
```

**Errors:**
- `blocking`: invalid action for FSRS status
- `blocking`: concept not scheduled in current unit
- `blocking`: missing grade for action that requires it
- `blocking`: wrong phase

**Test fixtures:** `tests/contract/test-whiteboard-record-concept.test.js`

#### 5.1.9 `record-discussion`

```
node scripts/whiteboard.js record-discussion --session-dir <path> --unit-id <id> --summary "<text>" [--open-questions '<json-array>']
```

**Inputs:**
- `--summary` — 1-2 sentences (substantive content; not "discussed X")
- `--open-questions` — JSON array of strings

**Behavior:**
1. Validate unit is current
2. Append to `phases.<current_phase>.discussions`
3. Append `discussion_recorded` event to log

**Test fixtures:** `tests/contract/test-whiteboard-record-discussion.test.js`

#### 5.1.10 `mark-concern-done` (Phase 1)

```
node scripts/whiteboard.js mark-concern-done --session-dir <path> --id <concern_id>
```

**Behavior:**
1. Validate phase = 1
2. Validate `id` matches current concern
3. Validate every concept in current concern has a `concepts_checked` entry
4. Increment `current_concern_index`
5. Append `concern_done` event

**Errors:**
- `blocking`: concept(s) not yet recorded for this concern (lists missing IDs)
- `blocking`: id doesn't match current

#### 5.1.11 `mark-component-done` (Phase 2/3)

Identical shape to `mark-concern-done` for components.

#### 5.1.12 `mark-skipped`

```
node scripts/whiteboard.js mark-skipped --session-dir <path> --phase <N> --ids '<json-array>' --reason "<text>"
```

**Behavior:** Used in remediation flow when user chose `skip`. Records affected concept IDs as skipped with reason. Appends `remediation_choice` event.

#### 5.1.13 `phase-complete`

```
node scripts/whiteboard.js phase-complete --session-dir <path> --phase <N>
```

**Behavior:**
1. Validate every scheduled unit has `status: done`
2. Set `phases.<N>.status = "complete"`
3. Append `phase_complete` event
4. Note: this does NOT auto-advance `current_phase` — that's `phase-start`'s job

#### 5.1.14 `export-design-doc` (Phase 4)

```
node scripts/whiteboard.js export-design-doc --session-dir <path> --output <path> [--template <name>]
```

**Behavior:** Aggregates all phases' synthesis from session state + log into a markdown design document. Template names: `default` (only one for now).

**Output:**
```json
{ "status": "ok", "data": { "output_path": "...", "sections_written": 7 } }
```

#### 5.1.15 `finish`

```
node scripts/whiteboard.js finish --session-dir <path> [--keep-log]
```

**Behavior:**
1. Validate `phases.4.status == "complete"` OR explicit `--abort` flag
2. Delete `.session-state.json` and `.session-log.jsonl` (unless `--keep-log`)
3. Append `session_finish` event before deletion (only if `--keep-log`)

#### 5.1.16 `pause-session` (implicit)

There's no explicit `pause-session` command. Session is "paused" when the skill exits without calling `finish`. State + log persist on disk. `resume-session` picks up from there.

### 5.2 `scripts/lookup.js` (extended)

Existing commands kept: `search`, `status`, `list-concepts`, `reconcile` (with **alias mode removed**).

#### 5.2.1 `find-l2-children` (new)

```
node scripts/lookup.js find-l2-children --parent <L1_id> --profile-dir <path>
```

**Behavior:** Walk profile dir for `.md` files where frontmatter `parent_concept == <L1_id>`. Return all matches with current FSRS state.

**Output:**
```json
{
  "status": "ok",
  "data": {
    "parent": "information_retrieval",
    "children": [
      {
        "concept_id": "sparse_vectors",
        "domain": "natural_language_processing",
        "fsrs_status": "review",
        "fsrs_stability": 4.2,
        "last_reviewed": "...",
        "teaching_guide_summary": "Preferred analogy: inverted index..."
      }
    ]
  }
}
```

#### 5.2.2 `list-l2-universe` (new — for matcher Stage 1)

```
node scripts/lookup.js list-l2-universe --profile-dir <path> --registry-path <path> [--thin]
```

**Behavior:** Returns thin or full universe of all L2s + nearby L1s.

**Thin mode (Stage 1):** `[{id, parent, scope_1line}]` for L2s, `[{id, domain, scope_1line}]` for L1s. ~5-15 tokens per entry.

**Full mode (Stage 2):** `[{id, parent_or_domain, full_description, teaching_guide_summary}]`. ~100-150 tokens per entry. Used when caller passes top-K candidate IDs.

**Output (thin):**
```json
{
  "status": "ok",
  "data": {
    "l2s": [{ "id": "sparse_vectors", "parent": "information_retrieval", "scope_1line": "..." }],
    "l1s": [{ "id": "information_retrieval", "domain": "natural_language_processing", "scope_1line": "..." }]
  }
}
```

#### 5.2.3 `record-l2-decision` (new)

```
node scripts/lookup.js record-l2-decision --session-dir <path> --proposed <id> --decision-json '<json>'
```

**Inputs:**
- `--decision-json` — matcher output: `{ match: "semantic_l2"|"l1_instead"|"parent_disputed"|"no_match", matched_id?, suggested_parent?, confidence, reasoning }`

**Behavior:**
1. Validate decision shape against schema
2. Append `l2_decision` event to log
3. Return normalized action: `use_existing | use_as_l1 | accept_novel`

**Output:**
```json
{
  "status": "ok",
  "data": {
    "action": "use_existing",
    "id": "sparse_vectors"
  }
}
```

#### 5.2.4 `concept-state` (new — used by next-concern/next-component)

```
node scripts/lookup.js concept-state --concept <id> --registry-path <path> --profile-dir <path>
```

**Behavior:** Returns merged registry + profile + FSRS view of a single concept.

**Output:**
```json
{
  "status": "ok",
  "data": {
    "concept_id": "sparse_vectors",
    "registry_meta": {
      "level": 2,
      "domain": "natural_language_processing",
      "is_seed_concept": false,
      "difficulty_tier": "intermediate",
      "in_registry": false
    },
    "fsrs_status": "new",
    "profile_path": null,
    "profile_meta": null
  }
}
```

For an L2 with a profile:
```json
{
  "status": "ok",
  "data": {
    "concept_id": "sparse_vectors",
    "registry_meta": { "level": 2, "in_registry": false, ... },
    "fsrs_status": "review",
    "profile_path": "~/.claude/professor/.../sparse_vectors.md",
    "profile_meta": {
      "fsrs_stability": 4.2,
      "fsrs_difficulty": 6.1,
      "last_reviewed": "...",
      "review_count": 3
    }
  }
}
```

#### 5.2.5 `session-exists` (new — for new-session prompt)

```
node scripts/lookup.js session-exists --session-dir <path>
```

**Output:**
```json
{
  "status": "ok",
  "data": {
    "exists": true,
    "session_id": "uuid",
    "task": "...",
    "current_phase": 2,
    "started_at": "...",
    "progress_summary": "Phase 2 of 4, 5 concerns done, 2 remaining"
  }
}
```

When no session:
```json
{ "status": "ok", "data": { "exists": false } }
```

#### 5.2.6 `reconcile` — alias mode removed

```
node scripts/lookup.js reconcile --candidate <id> --mode exact --registry-path <path> --profile-dir <path>
```

`--mode alias` is removed (returns `envelopeError('blocking', '--mode alias is removed in v5')`).

`--mode exact` unchanged: returns `{ match_type: "exact" | "no_match", concept_id?, domain?, source? }`.

### 5.3 `scripts/update.js` (modified)

#### 5.3.1 Removed flags

- `--add-alias` — registry `aliases` field deprecated
- `--notes` — Notes section removed; Teaching Guide section is body content from `--body`

#### 5.3.2 New behavior — registry-driven metadata

When `update.js` is called with `--concept <id>`:

1. Look up `<id>` in registry (`lookup.js reconcile --mode exact`)
2. If found:
   - Set `level: 1`, `is_seed_concept: true`, `parent_concept: null` (always; ignore caller flags)
   - Set `domain` from registry
   - If caller passed `--level 2` or `--parent X`: log warning, use registry values
3. If not found:
   - Require `--parent <L1_id>` from caller (error if absent: `envelopeError('blocking', 'L2 concept requires --parent')`)
   - Validate parent exists in registry (error if not: `envelopeError('blocking', 'parent_concept must be a registry L1')`)
   - Set `level: 2`, `is_seed_concept: false`, `parent_concept: <parent>`
   - `domain` from registry of parent

#### 5.3.3 Body templates (v5)

**For `--create-parent` path:**

```markdown
---json
{frontmatter}
---

## Description

(Awaiting professor's first teaching of this concept.)

## Teaching Guide

(No teaching history yet.)
```

**For grade-based create path (first teach):** professor will write Description and Teaching Guide via `--body` in a separate call.

**For grade-based update path:** body remains as-is unless `--body` passed.

#### 5.3.4 Test fixtures

`tests/contract/test-update-registry-validation.test.js` — registry-driven metadata
`tests/contract/test-update-removed-flags.test.js` — `--add-alias` and `--notes` rejected
`tests/contract/test-update-l2-parent-required.test.js` — non-registry concepts require `--parent`

### 5.4 `scripts/session.js` (refactored in place)

#### 5.4.1 New schema (v5)

`session.js create` produces v5 state shape (see §3.2).

#### 5.4.2 Removed subcommands

- `gate` (already removed in v4)

#### 5.4.3 Modified subcommands

- `create`: takes `--task` (not `--feature` and `--branch`), produces v5 schema
- `update`: takes new field names matching v5 schema
- `add-concept`: still exists, but called via `whiteboard.js record-concept` which performs v5 validation first; `session.js add-concept` becomes a low-level write

#### 5.4.4 New subcommand: `migrate-from-v4`

```
node scripts/session.js migrate-from-v4 --session-dir <path>
```

**Behavior:** If state file is `schema_version: 2` (v4), prompt user via stderr that it can't be auto-migrated reliably (different model). Recommend discard + restart. This is the intentionally-conservative path; mid-session v4 → v5 migration is too lossy.

#### 5.4.5 Test fixtures

`tests/contract/test-session-v5-schema.test.js`

### 5.5 `scripts/gate.js` (simplified)

#### 5.5.1 Removed

- `circuit_breaker` field in state
- `degraded` outcome
- `--force-proceed` flag
- `schedule` subcommand (replaced by `whiteboard.js register-*` which writes schedule directly)

#### 5.5.2 Kept

- `checkpoint --step N` — now returns 2 outcomes only
- `log` — append to session log
- `status` — read-only

#### 5.5.3 Modified `checkpoint` behavior

```
node scripts/gate.js checkpoint --session-dir <path> --step <1|2|3|4>
```

**Behavior:**
1. Read state
2. For phase N, walk all scheduled concepts (concerns in P1, components in P2/3)
3. Compare against `concepts_checked`
4. Return:

```json
{
  "status": "ok",
  "data": {
    "result": "passed" | "blocked",
    "missing": ["concept_id_1", "concept_id_2"],
    "scheduled_count": 24,
    "checked_count": 22,
    "timestamp": "..."
  }
}
```

#### 5.5.4 Test fixtures

`tests/contract/test-gate-v5-checkpoint.test.js`

---

## 6. Concept-matcher agent contract

### 6.1 File location and frontmatter

`agents/concept-matcher.md` (new file, replaces `concept-agent.md`)

```yaml
---
name: concept-matcher
description: >
  Semantic match for novel L2 concept candidates. Two-stage retrieve-rerank:
  Stage 1 returns top-K candidates from thin universe; Stage 2 makes final
  decision over top-K with full metadata. Returns typed match decision.
  Does NOT teach or interact with users.
tools: Read, Bash
model: haiku
---
```

### 6.2 Input schema

The skill dispatches the matcher with this prompt structure (Stage 1 form):

```
You are a concept-matcher subagent. Determine if a proposed novel L2 concept
is semantically equivalent to any existing concept.

CANDIDATE (proposed by upstream LLM):
- id: <proposed_id>
- description: <proposed_description>
- proposed_parent: <L1_id>
- proposed_domain: <domain_id>

UNIVERSE (thin):
L2s (id, parent, one-line scope):
  <list>

L1s (id, domain, one-line scope):
  <list>

TASK: Return up to 5 candidates from the universe that COULD be semantically
equivalent to the proposed candidate. Use semantic judgment, not just name
similarity. Consider concepts under different parents/domains.

Output JSON only — no prose, no markdown fences:
{
  "top_candidates": [
    { "id": "...", "kind": "l2" | "l1", "reason_for_shortlist": "..." }
  ]
}
```

### 6.3 Stage 2 prompt structure

After Stage 1 returns top candidates, the skill fetches full metadata via `lookup.js list-l2-universe --thin false --ids <comma-list>` (alternate invocation pattern). It then dispatches Stage 2:

```
You are a concept-matcher subagent — Stage 2 (decision).

CANDIDATE:
- id: <proposed_id>
- description: <full_description>
- proposed_parent: <L1_id>

EXISTING CANDIDATES (top-K from Stage 1, with full metadata):
1. id: ..., kind: l2, parent: ..., description: ..., teaching_guide_summary: ...
2. ...

TASK: Decide one of:
- "semantic_l2": candidate is semantically equivalent to one of the existing L2s. Return matched_id.
- "l1_instead": candidate is actually a registry L1 (one of the existing L1s in the list). Return matched_id.
- "parent_disputed": candidate is novel but the proposed parent is wrong. Suggest a better parent.
- "no_match": candidate is genuinely novel and parent claim is reasonable.

Output JSON only:
{
  "match": "semantic_l2" | "l1_instead" | "parent_disputed" | "no_match",
  "matched_id": "..." | null,
  "suggested_parent": "..." | null,
  "confidence": 0.0-1.0,
  "reasoning": "<one sentence>"
}
```

### 6.4 Output validation

Both stages' output validated by `lookup.js record-l2-decision` against schema:

- `top_candidates` array of objects with `id` (string), `kind` ("l2" | "l1"), `reason_for_shortlist` (string)
- `match` in the closed set
- `confidence` in [0.0, 1.0]
- `reasoning` non-empty string
- If `match == "semantic_l2"` or `match == "l1_instead"`: `matched_id` required
- If `match == "parent_disputed"`: `suggested_parent` required

Validation failure → `record-l2-decision` returns `envelopeError('blocking', 'Matcher output schema invalid: <details>')`. Skill retries once; if second failure, abort matcher and treat candidate as `no_match` with reasoning `"matcher schema validation failed twice"`.

### 6.5 Self-healing retry protocol

Concept-matcher inherits the protocol from concept-agent:

- Script error (lookup.js failure during universe gathering) → retry once with corrected args
- LLM output parse failure → retry once
- After 2 failed retries → abort with `envelopeError('warning', 'matcher unavailable')`. Skill treats candidate as `no_match` (accepts as novel) and logs the matcher failure. Sessions don't block on matcher failures.

### 6.6 Removed responsibilities

- ❌ `resolve-only` mode
- ❌ `resolve-or-create` mode
- ❌ FSRS status computation
- ❌ Parent L1 placeholder creation (`--create-parent`)
- ❌ Alias resolution (Step 2 of v4 concept-agent)
- ❌ Status-driven action recommendation

All these are either deterministic (lookup.js) or moved to professor-teach (FSRS interpretation, action choice).

### 6.7 Test fixtures

`tests/integration/test-concept-matcher-stage1.sh` — Stage 1 with fixture universe + candidate, assert top_candidates schema
`tests/integration/test-concept-matcher-stage2.sh` — Stage 2 with fixture top-K + candidate, assert decision schema
`tests/contract/test-matcher-output-validation.test.js` — schema validator standalone

**Regression fixture set:** `tests/fixtures/matcher-regression/*.json` — 20-30 known cases derived from past whiteboard sessions:

- Same-parent same-concept drift cases
- Cross-parent drift cases
- L1 re-invention cases
- Genuinely novel L2 cases
- Parent-disputed cases

Each fixture has `{ input, expected_match, expected_matched_id, tolerance: { confidence_min: 0.5 } }`. Tier 3 tests run all fixtures and assert ≥ 90% match accuracy.

---

## 7. Skill contracts

### 7.1 `skills/whiteboard/SKILL.md` rewrite

#### 7.1.1 Frontmatter

```yaml
---
name: whiteboard
description: >
  Domain-agnostic solutions architect with integrated concept teaching.
  Conducts design conversations through 4 phases (requirements/HLD/LLD/deliverable),
  enforces just-in-time concept teaching before each discussion unit, and produces
  a design document. Use when planning any technical feature or system.
disable-model-invocation: true
argument-hint: "[task description] [--continue]"
model: sonnet
inputs:
  - task: "free text description of what to design"
  - continue: "boolean, optional — resume an existing session"
outputs:
  - design_document: "docs/professor/designs/{date}-{shorthand}.md"
  - session_log: "docs/professor/.session-log.jsonl (deleted on finish)"
failure_modes:
  - script_call_failure: "warn user, attempt recovery via remediation flow if applicable; abort if foundational"
  - matcher_failure: "treat candidate as no_match, log, continue"
  - professor_failure: "inline error to user, allow user to retry or skip concept"
  - session_state_corruption: "fatal — abort with diagnostic"
lifecycle:
  phases: [phase_0_init, phase_1_requirements, phase_2_hld, phase_3_lld, phase_4_deliverable]
---
```

Note: `model: sonnet`. Matcher invocation creates haiku subagent inline; professor runs as inline call (not Agent tool dispatch).

#### 7.1.2 Skill structure (high-level)

The SKILL.md prose follows this strict structural order. The user-facing skill is mostly orchestration around script calls.

```
0. Phase 0: Init / Resume
   0.1: Check session-exists
   0.2: If exists: prompt continue/discard
   0.3: If continue: resume-session, summarize narrative to user
   0.4: If new: init-session, then read arch context

1. Phase 1: Requirements
   1.1: phase-start --phase 1
   1.2: LLM picks 5-8 concerns from concerns.json (catalog + optional proposed)
   1.3: register-selection
   1.4: JIT loop:
        a. next-concern → {concern, concepts}
        b. For each concept:
           i. invoke professor-teach inline (concept_id, concern_context, fsrs_status from concept-state)
           ii. record-concept (validates action ↔ status pairing)
        c. LLM discusses concern grounded in just-taught concepts
        d. record-discussion
        e. mark-concern-done
   1.5: gate.js checkpoint --step 1
   1.6: If passed: phase-complete --phase 1
        If blocked: remediation UX (review/skip/abort)

2. Phase 2: HLD
   2.1: phase-start --phase 2
   2.2: LLM ONE big call: identify components + per-component concepts (seed + proposed)
   2.3: For each proposed L2:
        a. lookup.js list-l2-universe --thin
        b. Dispatch concept-matcher Stage 1 → top candidates
        c. lookup.js list-l2-universe --thin false --ids <top>
        d. Dispatch concept-matcher Stage 2 → decision
        e. record-l2-decision → normalized action
   2.4: register-components (full plan with L2_decisions)
   2.5: JIT loop (same shape as Phase 1, with components):
        a. next-component → {component, concepts}
        b. For each concept (seeds first, proposed after):
           i. invoke professor-teach inline
           ii. record-concept
        c. LLM discusses component
        d. record-discussion
        e. mark-component-done
   2.6: gate.js checkpoint --step 2
   2.7: phase-complete --phase 2 OR remediation

3. Phase 3: LLD
   Same as Phase 2 but with finer components. Phase 2's L2s now in gradebook
   so reuse rate is high; matcher fires less.

4. Phase 4: Deliverable
   4.1: phase-start --phase 4
   4.2: export-design-doc
   4.3: phase-complete --phase 4
   4.4: finish (deletes state + log)
```

#### 7.1.3 Critical SKILL.md prose requirements

These statements MUST appear in SKILL.md (specified for the writing-skills implementer to enforce):

1. **"You MUST call `next-concern` (or `next-component`) before discussing any concept or unit."** (Anti-Issue-7)
2. **"You MUST invoke professor-teach INLINE (in the conversation turn). Do NOT dispatch it as a background subagent via Agent tool."** (Anti-Issue-6)
3. **"You MUST call `record-concept` after each professor-teach invocation, before discussing the concern/component."**
4. **"You MUST NOT call `update.js` directly to create an L2 without first calling `record-l2-decision` for that L2."** (Matcher choke point)
5. **"You MUST call `mark-concern-done` (or `mark-component-done`) before requesting the next unit. The script will reject `next-*` if the previous unit isn't marked done."** (Note: this enforcement is in `next-concern`/`next-component`; the prose echoes it.)
6. **"For each concern's `record-discussion` summary, write 1-2 sentences of substantive content. Avoid 'discussed X' or 'covered Y' — these are useless on resume."**

#### 7.1.4 Script invocation patterns (examples in SKILL.md)

Each script call documented with example invocation. SKILL.md becomes longer but more deterministic. Implementer uses `superpowers:writing-skills` if available; otherwise directly authored following these requirements.

#### 7.1.5 Test fixtures

`tests/integration/test-skill-phase1-flow.sh` — full Phase 1 flow with mocked LLM responses
`tests/integration/test-skill-phase2-flow.sh` — full Phase 2 flow with mocked matcher and professor

### 7.2 `skills/professor-teach/SKILL.md` rewrite

#### 7.2.1 Frontmatter changes

```yaml
---
name: professor-teach
description: >
  Teach or review a single technical concept inline. Invoked by /whiteboard
  during JIT loop. Decides action based on FSRS status, executes teaching,
  writes Teaching Guide to concept .md, returns grade and notes.
disable-model-invocation: true
argument-hint: "<concept_id> --status <fsrs_status> --domain <id> [--parent <l1_id>] --task-context '<text>' --concern-or-component <id> --session-id <uuid>"
model: sonnet
inputs:
  - concept_id: "snake_case identifier"
  - status: "FSRS status: new | encountered_via_child | teach_new | review | skip"
  - domain: "concept's domain (from registry or matcher decision)"
  - parent: "L1 parent id (for L2 concepts only)"
  - task_context: "1-2 sentence summary of what user is designing"
  - concern_or_component: "id of the unit this concept supports in this session"
  - session_id: "session UUID for nonce construction"
outputs:
  - action: "taught | reviewed | known_baseline | skipped_not_due"
  - grade: "1-4 or null (per action)"
  - notes_for_session_log: "1-2 sentence summary of what happened"
failure_modes:
  - update_script_failure: "return action and grade anyway with error note"
  - user_skip: "grade as Again (1), action as taught"
---
```

**Removed from v4:** `context: fork`, `agent: general-purpose`, `user-invocable: false`. Skill now runs inline.

#### 7.2.2 Step structure

```
1. Read existing profile (if status != "new"): load Teaching Guide for prior context
2. Decide action based on status:
   - status "skip": return action: skipped_not_due, grade: null, notes: "FSRS R > 0.7, skipped"
   - status "new": baseline check first
       a. Ask one recall question (1 sentence, contextual to task)
       b. Wait for user answer
       c. Grade answer 1-4
       d. If grade ≥ 3: action: known_baseline
       e. If grade < 3: action: taught — proceed to step 3
   - status "encountered_via_child" or "teach_new": full teach (step 3)
   - status "review": light review (step 3 with shorter explanation)
3. Teaching delivery (under 400 words):
   - Analogy (~100 words)
   - Real-world production example (~150 words)
   - Task connection (~100 words tying to user's context)
   - Recall question (application-style, contextual)
4. Wait for user answer
5. Grade 1-4
6. Write/overwrite Teaching Guide section in concept .md via update.js --body
7. Update FSRS state via update.js with grade + nonce
8. Return result envelope
```

#### 7.2.3 Output envelope

```json
{
  "status": "ok",
  "data": {
    "concept_id": "sparse_vectors",
    "domain": "natural_language_processing",
    "action": "taught",
    "grade": 3,
    "notes_for_session_log": "Taught sparse_vectors via inverted-index analogy; IDF intuition took an extra pass."
  }
}
```

#### 7.2.4 Teaching Guide write template

```markdown
## Teaching Guide

- **Preferred analogy:** {analogy used this session}
- **User struggle points:** {what the user struggled with}
- **Recommended approach:** {teaching sequence that worked}
- **Recall question style:** {what worked or what to try differently}
- **Last outcome:** {action} — grade {N} ({YYYY-MM-DD})
```

Always overwrite (no append). The Teaching Guide is current actionable guidance, not a journal.

#### 7.2.5 Test fixtures

`tests/integration/test-prof-teach-status-mapping.sh` — for each FSRS status, professor returns valid action
`tests/contract/test-prof-teach-output-schema.test.js` — output envelope shape

---

## 8. Migration: migrate-v5.js

### 8.1 Purpose

One-time migration of existing user concept profiles from v4 schema to v5. Specifically:

- Lift any non-placeholder `## Notes` content into `## Teaching Guide`
- Remove `## Notes` and `## Key Points` sections (consolidated into Teaching Guide)
- Add `schema_version: 5` to frontmatter
- Remove deprecated frontmatter fields (`aliases`, `related_concepts`, `scope_note`, `documentation_url`)

### 8.2 Invocation

```
node scripts/migrate-v5.js --profile-dir <path> [--dry-run]
```

**Inputs:**

- `--profile-dir` (required) — typically `~/.claude/professor/concepts/`
- `--dry-run` (optional) — report what would change without writing

**Behavior:**

1. Walk directory tree for all `.md` files
2. For each file:
   - Read frontmatter
   - If `schema_version` already 5: skip (idempotent)
   - If `schema_version == 4`:
     - Parse body sections
     - Build new Teaching Guide from `## Key Points` (if present) + `## Notes` (if non-placeholder)
     - Construct new body: Description (preserved or seeded from `## Concept Name` heading) + Teaching Guide
     - Construct new frontmatter: copy preserved fields, set `schema_version: 5`, drop deprecated fields
     - Write atomically (temp file + rename)
   - If unrecognized schema: log warning, skip
3. Output summary

### 8.3 Notes content migration rules

For each existing `## Notes` section:

- If exactly `"No notes yet."` → drop (no Teaching Guide entry)
- If contains substantive content (any non-whitespace beyond placeholder) → seed Teaching Guide:
  ```
  ## Teaching Guide

  - **Migrated notes (pre-v5.0.0):**
  {original notes content, indented}
  ```
- If contains structured Key Points + Notes:
  ```
  ## Teaching Guide

  - **Migrated key points:**
  {original Key Points content, indented}
  - **Migrated notes:**
  {original Notes content, indented}
  ```

### 8.4 Output

```json
{
  "status": "ok",
  "data": {
    "files_scanned": 47,
    "files_migrated": 32,
    "files_skipped_already_v5": 8,
    "files_skipped_unknown_schema": 0,
    "files_with_notes_lifted": 14,
    "files_with_key_points_lifted": 27,
    "errors": []
  }
}
```

### 8.5 Idempotency

Running migrate-v5 twice on the same directory must be safe. The schema_version check ensures already-v5 files are not touched.

### 8.6 Failure handling

- File-level errors are non-fatal: logged in `errors` array, processing continues
- If write fails: temp file cleaned up, original file untouched
- Errors don't roll back successful migrations earlier in the run

### 8.7 When to run

Migration runs on first `whiteboard` invocation after v5.0.0 install:

```
On whiteboard invocation:
  Check ~/.claude/professor/.migration-state.json
  If not present or version < 5:
    Run migrate-v5.js
    Write .migration-state.json with version: 5, ran_at: <now>
```

This is implemented in SKILL.md prose; not a separate script step.

### 8.8 Rollback

No automatic rollback. Users who need to roll back to v4 should restore from git or manual backup. Recommended in v5.0.0 release notes: "back up `~/.claude/professor/concepts/` before upgrading."

### 8.9 Test fixtures

`tests/integration/test-migrate-v5.sh` — runs against fixture profile dir

`tests/fixtures/profiles-v4/` — diverse v4 fixture profiles:
- `placeholder-only.md` (Notes is "No notes yet.")
- `with-substantive-notes.md`
- `with-key-points-only.md`
- `with-key-points-and-notes.md`
- `malformed-frontmatter.md` (should warn and skip)
- `already-v5.md` (should be no-op)

`tests/fixtures/profiles-v5-expected/` — expected output for each fixture, used for diff assertion

### 8.10 Session-state migration

`migrate-v5.js` does NOT migrate `.session-state.json` files. v4 sessions are intentionally not auto-migrated (covered by `session.js migrate-from-v4` which prompts user to discard).

---

## 9. Test strategy (5-tier TDD)

### 9.1 Philosophy

**Write tests before implementation.** Each task in the implementation plan (§11) starts with writing the test fixture for the function or command, then implements until green. Tests are the contract.

Coverage targets:

- Script layer: 80%+ statement coverage, 100% schema validation at I/O boundaries
- Migration script: 100% (small, well-defined)
- Skills: not unit-testable (LLM-invoked); validated via Tier 5 smoke + Tier 2 CLI chains
- Concept-matcher agent: regression set ≥ 90% accuracy

### 9.2 Tier 1 — Script contract tests

**Location:** `tests/contract/`

**Framework:** Node's built-in `node:test` runner + `node:assert/strict`. Existing convention in repo.

**Pattern:** each command gets one test file. Tests use `child_process.spawnSync` to invoke the actual script as a subprocess. Stdin/stdout/stderr/exit-code asserted.

**Example structure:**

```javascript
// tests/contract/test-whiteboard-init-session.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '../../scripts/whiteboard.js');

function run(args, opts = {}) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8', ...opts });
}

test('init-session creates fresh state with valid envelope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
  try {
    const result = run(['init-session', '--task', 'test task', '--session-dir', dir]);
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.task, 'test task');
    assert.equal(out.data.schema_version, 5);
    assert.match(out.data.session_id, /^[0-9a-f-]{36}$/);
    assert.ok(fs.existsSync(path.join(dir, '.session-state.json')));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('init-session rejects existing state without --force-new', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
  try {
    run(['init-session', '--task', 'first', '--session-dir', dir]);
    const result = run(['init-session', '--task', 'second', '--session-dir', dir]);
    assert.notEqual(result.status, 0);
    const err = JSON.parse(result.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Session state exists/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

// ... more cases per command
```

**Files (one per command):**

- `tests/contract/test-whiteboard-init-session.test.js`
- `tests/contract/test-whiteboard-resume-session.test.js`
- `tests/contract/test-whiteboard-phase-start.test.js`
- `tests/contract/test-whiteboard-register-selection.test.js`
- `tests/contract/test-whiteboard-register-components.test.js`
- `tests/contract/test-whiteboard-next-concern.test.js`
- `tests/contract/test-whiteboard-next-component.test.js`
- `tests/contract/test-whiteboard-record-concept.test.js`
- `tests/contract/test-whiteboard-record-discussion.test.js`
- `tests/contract/test-whiteboard-mark-concern-done.test.js`
- `tests/contract/test-whiteboard-mark-component-done.test.js`
- `tests/contract/test-whiteboard-mark-skipped.test.js`
- `tests/contract/test-whiteboard-phase-complete.test.js`
- `tests/contract/test-whiteboard-export-design-doc.test.js`
- `tests/contract/test-whiteboard-finish.test.js`
- `tests/contract/test-lookup-find-l2-children.test.js`
- `tests/contract/test-lookup-list-l2-universe.test.js`
- `tests/contract/test-lookup-record-l2-decision.test.js`
- `tests/contract/test-lookup-concept-state.test.js`
- `tests/contract/test-lookup-session-exists.test.js`
- `tests/contract/test-lookup-reconcile-no-alias.test.js` (verifies alias mode rejected)
- `tests/contract/test-update-registry-validation.test.js`
- `tests/contract/test-update-removed-flags.test.js`
- `tests/contract/test-update-l2-parent-required.test.js`
- `tests/contract/test-session-v5-schema.test.js`
- `tests/contract/test-gate-v5-checkpoint.test.js`
- `tests/contract/test-matcher-output-validation.test.js`
- `tests/contract/test-prof-teach-output-schema.test.js`

Per command: 5-15 test cases (happy path + each error condition). Total ~250 contract tests.

### 9.3 Tier 2 — CLI integration chains

**Location:** `tests/integration/`

**Framework:** Bash scripts. `set -euo pipefail` for strict mode. `jq` for JSON parsing.

**Pattern:** one bash script per logical end-to-end flow. Asserts intermediate state (state file fields) and final state.

**Example:**

```bash
#!/usr/bin/env bash
# tests/integration/test-phase1-happy-path.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SESSION_DIR=$(mktemp -d)
trap "rm -rf $SESSION_DIR" EXIT

cd "$SCRIPT_DIR"

# Init
out=$(node scripts/whiteboard.js init-session --task "test" --session-dir "$SESSION_DIR")
echo "$out" | jq -e '.status == "ok"' > /dev/null

# Phase start
node scripts/whiteboard.js phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# Register selection (catalog concerns)
node scripts/whiteboard.js register-selection --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' > /dev/null

# Next concern returns expected concern
out=$(node scripts/whiteboard.js next-concern --session-dir "$SESSION_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
[[ "$concern_id" == "data_consistency" ]]

concept=$(echo "$out" | jq -r '.data.concepts[0].concept_id')

# Simulate professor decision: record-concept (status: review → reviewed)
# (skipping actual prof teach for this test; assumes status is "review")
node scripts/whiteboard.js record-concept --session-dir "$SESSION_DIR" \
  --concept-id "$concept" --unit-id "$concern_id" --action reviewed --grade 3 > /dev/null

# (More record-concept calls for remaining concepts...)

# Mark done
node scripts/whiteboard.js mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null

# Next concern returns done
out=$(node scripts/whiteboard.js next-concern --session-dir "$SESSION_DIR")
[[ $(echo "$out" | jq -r '.data.done') == "true" ]]

# Gate audit passes
out=$(node scripts/gate.js checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]]

# Phase complete
node scripts/whiteboard.js phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

echo "PASS: phase 1 happy path"
```

**Files:**

- `tests/integration/test-phase1-happy-path.sh`
- `tests/integration/test-phase1-with-proposed-concerns.sh`
- `tests/integration/test-phase1-blocked-audit-review.sh`
- `tests/integration/test-phase1-blocked-audit-skip.sh`
- `tests/integration/test-phase1-blocked-audit-abort.sh`
- `tests/integration/test-phase2-happy-path.sh` (with matcher mocked via env-var fixture)
- `tests/integration/test-phase2-l2-reuse.sh`
- `tests/integration/test-phase2-l2-novel.sh`
- `tests/integration/test-phase23-cross-phase-reuse.sh`
- `tests/integration/test-resume-mid-phase1.sh`
- `tests/integration/test-resume-mid-phase2.sh`
- `tests/integration/test-resume-with-catalog-drift.sh`
- `tests/integration/test-init-rejects-existing.sh`
- `tests/integration/test-init-force-new-discards.sh`
- `tests/integration/test-finish-deletes-state-and-log.sh`
- `tests/integration/test-finish-keep-log.sh`
- `tests/integration/test-export-design-doc.sh`
- `tests/integration/test-concept-matcher-stage1.sh` (real Stage 1 invocation against fixture universe)
- `tests/integration/test-concept-matcher-stage2.sh` (real Stage 2 invocation)
- `tests/integration/test-prof-teach-status-mapping.sh` (mocked LLM responses for each FSRS status)
- `tests/integration/test-migrate-v5.sh`

Total: ~20 integration tests.

### 9.4 Tier 3 — Agent contract & regression tests

**Location:** `tests/agents/`, `tests/fixtures/matcher-regression/`

#### 9.4.1 Schema validator

`tests/contract/test-matcher-output-validation.test.js` — pure schema validation, no agent invocation. Asserts that `record-l2-decision` rejects malformed inputs.

#### 9.4.2 Stage 1 fixtures

`tests/fixtures/matcher-regression/stage1/*.json`:

```json
{
  "name": "sparse_vectors_drift_under_different_parent",
  "candidate": {
    "id": "sparse_vector_repr",
    "description": "...",
    "proposed_parent": "machine_learning",
    "proposed_domain": "machine_learning"
  },
  "universe_thin": { "l2s": [...], "l1s": [...] },
  "expected_top_candidate_ids": ["sparse_vectors"],
  "min_confidence": 0.5
}
```

#### 9.4.3 Stage 2 fixtures

`tests/fixtures/matcher-regression/stage2/*.json`:

```json
{
  "name": "rrf_genuinely_novel",
  "candidate": {
    "id": "reciprocal_rank_fusion",
    "description": "...",
    "proposed_parent": "ranking_algorithms"
  },
  "candidates_full": [...],
  "expected_match": "no_match",
  "expected_confidence_min": 0.7
}
```

#### 9.4.4 Regression set composition

20-30 fixtures total covering:

- 5 same-parent same-concept drift (different name spellings)
- 5 cross-parent drift (concept exists under different parent)
- 5 L1 re-invention (LLM proposed L2 that's a registry seed)
- 5 parent-disputed cases
- 5 genuinely novel cases (no_match expected)
- 5 edge cases (empty universe, very long descriptions, etc.)

#### 9.4.5 Regression test runner

`tests/integration/test-matcher-regression.sh` — invokes matcher for each fixture, asserts:
- Output schema valid
- Decision matches expected
- Confidence ≥ expected_min

Pass threshold: ≥ 90% of fixtures match expected (allows 2-3 LLM-driven misses out of 20-30).

### 9.5 Tier 4 — Migration tests

**Location:** `tests/integration/test-migrate-v5.sh`, `tests/fixtures/profiles-v4/`, `tests/fixtures/profiles-v5-expected/`

**Pattern:** copy `profiles-v4/` to a temp dir, run `migrate-v5.js`, diff against `profiles-v5-expected/`. Assert exit code 0 and zero diff for each file.

Idempotency test: run migrate-v5 twice, second run should report all skipped.

### 9.6 Tier 5 — Smoke tests

**Location:** `tests/integration/test-smoke-full-session.sh`

Full whiteboard session simulation on a tiny task. Mocks LLM responses for:

- Concern selection (returns 2 catalog concerns)
- Components selection (returns 1 component)
- L2 proposals (returns 1 novel L2)
- Matcher Stage 1 (returns empty top_candidates → accept_novel)
- Matcher Stage 2 (skipped due to empty Stage 1)
- Professor (each invocation returns `taught` with grade 3)
- Discussions (1-sentence summaries)

Asserts:
- Session completes through phase 4
- Design doc written to expected path with non-trivial content
- State and log deleted on finish (default behavior)
- No script returned non-zero exit code

Mocking approach: a `tests/integration/mocks/` directory with mock responses + a wrapper that intercepts professor/matcher invocations during the test.

### 9.7 Test execution

Add to `package.json` (or equivalent test runner config):

```
{
  "scripts": {
    "test:contract": "node --test tests/contract/",
    "test:integration": "for f in tests/integration/*.sh; do bash \"$f\" || exit 1; done",
    "test:regression": "bash tests/integration/test-matcher-regression.sh",
    "test:migration": "bash tests/integration/test-migrate-v5.sh",
    "test": "npm run test:contract && npm run test:integration"
  }
}
```

CI runs `npm test` on every PR.

### 9.8 Test fixtures inventory

```
tests/
├── contract/                    (Tier 1, ~28 files)
├── integration/                 (Tier 2, ~20 .sh files)
│   ├── mocks/                   (LLM response fixtures for smoke test)
│   ├── test-matcher-regression.sh
│   └── test-migrate-v5.sh
├── fixtures/
│   ├── matcher-regression/
│   │   ├── stage1/              (~15 fixtures)
│   │   └── stage2/              (~15 fixtures)
│   ├── profiles-v4/             (~6 sample profiles)
│   └── profiles-v5-expected/    (~6 expected outputs)
```

---

## 10. Failure modes and degradation

### 10.1 Script-level failures

| Failure | Behavior | User impact |
|---|---|---|
| `whiteboard.js next-concern` returns error | Skill surfaces to user; offers to retry or abort | Visible error |
| `gate.js checkpoint` crashes | Skill warns, treats as `passed` (degrade open) | Audit lost for this phase; logged |
| `update.js` write fails | Skill returns grade anyway; logs that file write failed; user can re-run later | Grade not persisted; visible warning |
| `lookup.js find-l2-children` returns empty unexpectedly | Treated as "no existing children"; matcher operates on empty universe | Possible duplicate L2 creation; logged |
| `session.js` corrupted state | Fatal: skill aborts with diagnostic | Session unrecoverable; user must discard or manually fix |

### 10.2 Agent failures

| Failure | Behavior | User impact |
|---|---|---|
| Concept-matcher Stage 1 timeout | Retry once; if second timeout, abort matcher | L2 treated as `no_match` (accepted as novel); logged |
| Concept-matcher Stage 1 malformed output | Retry once with corrected schema reminder; if second failure, abort | Same as above |
| Concept-matcher Stage 2 same | Treats candidate as no_match-novel | Same |
| Professor-teach exception | Skill returns grade 0 for that concept; user can retry | Visible error; concept marked as failed |

### 10.3 User-driven interruptions

| Action | Behavior |
|---|---|
| User says "skip" mid-concept | Professor returns action: taught, grade: 1 (Again); concept marked for future review |
| User says "stop" mid-phase | Skill exits without `finish`; state + log preserved; resumable |
| Ctrl-C / process kill | State + log on disk are intermediate but consistent (atomic writes via temp + rename); resume works |
| User edits state file manually | Resume validates schema; rejects if invalid |

### 10.4 Catalog/registry drift during session

| Scenario | Behavior |
|---|---|
| Concerns catalog modified mid-session | `--continue` checks `concerns_catalog_version` hash; warns user if changed; user can proceed (existing schedule unchanged) or restart |
| Registry modified mid-session | Same — warn on resume; existing schedule continues with cached IDs |
| Profile file deleted mid-session | Concept treated as `new` on next encounter |

### 10.5 Migration failures

| Scenario | Behavior |
|---|---|
| `migrate-v5.js` cannot read a file | Logged in `errors`; processing continues with other files |
| `migrate-v5.js` write fails for a file | Original preserved (atomic write); error logged; user can re-run |
| `migrate-v5.js` interrupted | Already-migrated files are at v5; in-progress file is intact (atomic); re-run is idempotent |

### 10.6 What we explicitly do NOT handle

- **Concurrent whiteboard sessions in different repos touching the same user profile**: not protected. User profile dir has no locking. Risk: two simultaneous prof-teach invocations could race on the same concept file. Mitigation: `update.js` uses atomic rename, so neither will be corrupt, but later write wins. Consequence acceptable for personal-project scope.
- **Network failures during haiku subagent invocation**: handled by Anthropic SDK retries. If retries exhausted, treated as agent timeout (above).
- **Cross-machine session state portability**: not supported. State files are absolute-path-bearing in some places.

---

## 11. Implementation order

### 11.1 Sequencing principles

- Tests first per task (TDD)
- Foundation before consumers (data + scripts before agent + skills)
- Migration before consumers that need v5 schema
- Agent and skill last (they depend on everything else)

### 11.2 Tasks (in order)

#### T-FOUND-1: Concerns catalog research and authoring

- [ ] T-FOUND-1.1: Research synthesis (3h) — read canonical sources, draft concern list
- [ ] T-FOUND-1.2: Seed mapping (2h) — assign `mapped_seeds` for each concern; produce `concerns-mapping-notes.md`
- [ ] T-FOUND-1.3: Implement `scripts/validate-concerns.js` with deterministic invariant checks
- [ ] T-FOUND-1.4: Run `validate-concerns.js`; fix any orphans/over-mappings
- [ ] T-FOUND-1.5: Sanity replay against PR #446 transcript

**Output:** `data/concerns.json`, `data/concerns-mapping-notes.md`, `scripts/validate-concerns.js`

#### T-FOUND-2: Migration script

- [ ] T-FOUND-2.1: Write Tier 4 migration test fixtures (`tests/fixtures/profiles-v4/*`, `tests/fixtures/profiles-v5-expected/*`)
- [ ] T-FOUND-2.2: Write `tests/integration/test-migrate-v5.sh`
- [ ] T-FOUND-2.3: Implement `scripts/migrate-v5.js` until tests pass
- [ ] T-FOUND-2.4: Idempotency test: run migrate twice, assert second run is no-op

**Output:** `scripts/migrate-v5.js`, migration tests

#### T-SCRIPT-1: lookup.js extensions

- [ ] T-SCRIPT-1.1: Write Tier 1 contract tests for `find-l2-children`, `list-l2-universe`, `record-l2-decision`, `concept-state`, `session-exists`
- [ ] T-SCRIPT-1.2: Write Tier 1 contract test verifying `--mode alias` is rejected in `reconcile`
- [ ] T-SCRIPT-1.3: Implement new commands until tests pass
- [ ] T-SCRIPT-1.4: Remove alias mode from `reconcile`

#### T-SCRIPT-2: update.js modifications

- [ ] T-SCRIPT-2.1: Write Tier 1 contract tests for registry-driven metadata, removed flags, L2 parent requirement
- [ ] T-SCRIPT-2.2: Implement registry validation, remove `--add-alias`, remove `--notes`, change body templates
- [ ] T-SCRIPT-2.3: Verify backward compatibility for v4 profile reads (frontmatter migration on first write)

#### T-SCRIPT-3: gate.js simplification

- [ ] T-SCRIPT-3.1: Write Tier 1 test for new 2-outcome `checkpoint`
- [ ] T-SCRIPT-3.2: Remove circuit breaker, `degraded` outcome, `--force-proceed`, `schedule` subcommand
- [ ] T-SCRIPT-3.3: Verify tests pass

#### T-SCRIPT-4: session.js refactor for v5 schema

- [ ] T-SCRIPT-4.1: Write Tier 1 test for v5 schema in `create`/`load`/`update`
- [ ] T-SCRIPT-4.2: Refactor `create` to take `--task`, produce v5 state
- [ ] T-SCRIPT-4.3: Implement `migrate-from-v4` (v4 sessions detected and rejected with discard prompt)
- [ ] T-SCRIPT-4.4: Verify nonce idempotency preserved

#### T-SCRIPT-5: whiteboard.js (new script, all 16 commands)

- [ ] T-SCRIPT-5.1: Implement `init-session` + tests
- [ ] T-SCRIPT-5.2: Implement `resume-session` + tests
- [ ] T-SCRIPT-5.3: Implement `phase-start` + tests
- [ ] T-SCRIPT-5.4: Implement `register-selection` + tests
- [ ] T-SCRIPT-5.5: Implement `register-components` + tests
- [ ] T-SCRIPT-5.6: Implement `next-concern` + tests
- [ ] T-SCRIPT-5.7: Implement `next-component` + tests
- [ ] T-SCRIPT-5.8: Implement `record-concept` + tests (including action↔status validation)
- [ ] T-SCRIPT-5.9: Implement `record-discussion` + tests
- [ ] T-SCRIPT-5.10: Implement `mark-concern-done` + `mark-component-done` + tests
- [ ] T-SCRIPT-5.11: Implement `mark-skipped` + tests
- [ ] T-SCRIPT-5.12: Implement `phase-complete` + tests
- [ ] T-SCRIPT-5.13: Implement `export-design-doc` + tests
- [ ] T-SCRIPT-5.14: Implement `finish` + tests

#### T-AGENT-1: concept-matcher

- [ ] T-AGENT-1.1: Write `agents/concept-matcher.md` (frontmatter + Stage 1/2 prompts)
- [ ] T-AGENT-1.2: Author 20-30 regression fixtures (`tests/fixtures/matcher-regression/`)
- [ ] T-AGENT-1.3: Write `tests/integration/test-matcher-regression.sh`
- [ ] T-AGENT-1.4: Run regression set; iterate on prompt until ≥ 90% accuracy
- [ ] T-AGENT-1.5: Delete `agents/concept-agent.md`

#### T-INT-1: Tier 2 CLI integration chains

- [ ] T-INT-1.1: Write `tests/integration/test-phase1-happy-path.sh`
- [ ] T-INT-1.2: Write `tests/integration/test-phase1-with-proposed-concerns.sh`
- [ ] T-INT-1.3: Write `tests/integration/test-phase1-blocked-audit-{review,skip,abort}.sh`
- [ ] T-INT-1.4: Write `tests/integration/test-phase2-happy-path.sh` (matcher mocked)
- [ ] T-INT-1.5: Write `tests/integration/test-phase2-l2-reuse.sh`
- [ ] T-INT-1.6: Write `tests/integration/test-phase2-l2-novel.sh`
- [ ] T-INT-1.7: Write `tests/integration/test-resume-mid-phase{1,2}.sh`
- [ ] T-INT-1.8: Write `tests/integration/test-resume-with-catalog-drift.sh`
- [ ] T-INT-1.9: Write `tests/integration/test-finish-{deletes,keep-log}.sh`
- [ ] T-INT-1.10: Write `tests/integration/test-init-{rejects-existing,force-new}.sh`
- [ ] T-INT-1.11: Write `tests/integration/test-export-design-doc.sh`

All tests must pass before moving to skill rewrite.

#### T-SKILL-1: professor-teach rewrite

- [ ] T-SKILL-1.1: Write Tier 1 schema test for output envelope
- [ ] T-SKILL-1.2: Write Tier 2 mock-driven test `test-prof-teach-status-mapping.sh`
- [ ] T-SKILL-1.3: Rewrite `skills/professor-teach/SKILL.md` per §7.2
- [ ] T-SKILL-1.4: Verify output schema test passes (manual or fixture-driven)
- [ ] T-SKILL-1.5: Verify status-mapping integration test passes

#### T-SKILL-2: whiteboard rewrite

- [ ] T-SKILL-2.1: Rewrite `skills/whiteboard/SKILL.md` per §7.1 (use `superpowers:writing-skills` if available)
- [ ] T-SKILL-2.2: Delete `skills/whiteboard/protocols/concept-check.md`
- [ ] T-SKILL-2.3: Update `skills/whiteboard/templates/design-doc.md` (verify still works for export)

#### T-SMOKE-1: Tier 5 smoke test

- [ ] T-SMOKE-1.1: Author mock LLM responses in `tests/integration/mocks/`
- [ ] T-SMOKE-1.2: Write `tests/integration/test-smoke-full-session.sh`
- [ ] T-SMOKE-1.3: Run; iterate skill prose until smoke passes

#### T-DOC-1: Documentation regeneration

- [ ] T-DOC-1.1: Run `analyze-architecture --update` against the new code
- [ ] T-DOC-1.2: Update `README.md` for v5.0.0 (new commands, removed flags, migration notes)
- [ ] T-DOC-1.3: Update `plugin.json` version to 5.0.0
- [ ] T-DOC-1.4: Add v5.0.0 release notes documenting migration and breaking changes

#### T-SHIP-1: Pre-ship verification

- [ ] T-SHIP-1.1: Full test suite green (`npm test`)
- [ ] T-SHIP-1.2: Run migrate-v5 against your own user profile (real-world test)
- [ ] T-SHIP-1.3: Run a real whiteboard session against an existing project (validate end-to-end)
- [ ] T-SHIP-1.4: Tag v5.0.0; merge PR

### 11.3 Estimated complexity

| Phase | Estimated effort (focused work) |
|---|---|
| T-FOUND-1 (concerns catalog) | 6 hours (time-boxed) |
| T-FOUND-2 (migration) | 4 hours |
| T-SCRIPT-1 to 4 (script modifications) | 8 hours |
| T-SCRIPT-5 (whiteboard.js, all commands) | 12 hours |
| T-AGENT-1 (matcher) | 4 hours + iteration on regression set |
| T-INT-1 (integration tests) | 6 hours |
| T-SKILL-1 + T-SKILL-2 (skill rewrites) | 4 hours |
| T-SMOKE-1 | 2 hours |
| T-DOC-1 | 2 hours |
| T-SHIP-1 | 1 hour |

**Total: ~50 hours focused work.** AI-driven implementation can compress significantly when tests are pre-written.

---

## 12. Out of scope (deferred)

### 12.1 Cluster ii issues (resolved by v5.0.0 architecture changes, no separate spec needed)

- **Issue 3** (`update.js --notes` ignored): `--notes` flag removed entirely in v5; Notes section migrated to Teaching Guide. Issue becomes moot.
- **Issue 5** (`session.js add-concept` not idempotent): `whiteboard.js record-concept` is the v5 entry point; `session.js add-concept` becomes a low-level write only. Idempotency of `record-concept` is required by Tier 1 contract test.
- **Issue 8** (concepts not created across sessions): `whiteboard.js finish` requires `phases.4.status == complete` (which requires all concepts taught). Cannot finish a session with un-materialized concepts.

### 12.2 Professor-teach v2 (separate future spec)

- Source-backed teaching: web search via Exa/MCP for canonical sources per concept
- Citation in teaching output
- Curated `data/preferred_sources.json` integration
- Source caching to avoid repeat fetches
- Recall question generation from sources

This deserves its own spec because: significant new dependencies (web search), new caching strategy, new prompt design, new failure modes.

### 12.3 Permission allow-listing (UX improvement)

- Plugin ships with recommended `settings.json` `permissions.allow` snippet for plugin script commands
- Reduces user prompt fatigue during whiteboard sessions
- Verification of current Claude Code plugin permission API needed

Deferred because: not blocking; UX-only; needs Claude Code API verification.

### 12.4 Concurrent session protection

Per §10.6, concurrent whiteboard sessions in different repos touching the same user profile dir are unprotected. Acceptable for personal-project scope. If multi-user / multi-machine support is ever needed, add file-lock primitives to `update.js`.

### 12.5 Cross-machine session portability

Session state contains some absolute paths. Resume only works on the machine where the session started. Out of scope for v5.

### 12.6 Concept graph features

- Multi-parent L2s
- Cross-domain concept references (`related_concepts` field re-introduced)
- Graph queries ("what concepts relate to X")

The current design uses tree semantics (each concept has one parent, one domain). Graph extensions would be a v6 concern.

---

## End of spec

**Spec ownership:** This document is the source of truth for v5.0.0 implementation. Any deviation during implementation requires updating this spec first.

**Implementation plan:** generated separately via `writing-plans` skill, referencing this spec by path.

**Test strategy:** all tests are pre-written (or at minimum, test fixtures are pre-written) before implementation per §9.1.

**Migration:** see §8 for user-facing migration story; release notes should mirror §8.7 and §8.8.
