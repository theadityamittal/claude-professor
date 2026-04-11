# Spec: claude-professor v4.0.0 — Quality Architecture Implementation

## Date
2026-04-11

## Source
- Design document: `docs/professor/designs/2026-04-11-v4-quality-architecture.md`
- Whiteboard session: 77-exchange design conversation covering requirements, HLD (B'' architecture), and LLD

## Approach
Bottom-up (Approach A): build infrastructure scripts first, then consumers (skills, agents). Each layer is tested before the next layer depends on it.

## Implementation Order

1. Foundation: `utils.js` envelope → `gate.js` → `session.js` → `update.js`
2. Envelope: `lookup.js` + `graph.js` CLI wrapping
3. Data: concept file schema v4 + `migrate-v4.js`
4. Testing: contract tests (1 per script) + integration tests (3 chains)
5. Consumers: SKILL.md template → rewrite all skills → professor-teach rewrite → concept-agent update

---

## 1. Envelope Standardization (utils.js)

### New helpers in `utils.js`

```javascript
function envelope(data) {
  return { status: 'ok', data };
}

function envelopeError(level, message) {
  return { status: 'error', error: { level, message } };
}
```

### Output contract

**Success:**
```json
{"status": "ok", "data": { ... }}
```

**Error:**
```json
{"status": "error", "error": {"level": "fatal|blocking|warning", "message": "..."}}
```

### Rules

- `data` present only when `status === "ok"`. `error` present only when `status === "error"`. Never both, never neither.
- **CLI boundary only.** Each script's `if (require.main === module)` block wraps results through `envelope()` before writing to stdout. Exported functions return raw data as today — no envelope in programmatic API.
- Error tiers:
  - **fatal** — session.js crash (no session state), malformed session file
  - **blocking** — gate.js checkpoint blocked, missing required args
  - **warning** — subagent soft failure, degraded mode, non-critical script failure
- Exit codes: `process.exit(1)` on fatal/blocking, `process.exit(0)` on warning (error still in envelope).
- Breaking change to all CLI output. Consumers must parse the envelope. Justified by major version bump (v4.0.0).

### Exports added to `utils.js`

```javascript
module.exports = {
  // existing
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
  // new
  envelope, envelopeError,
};
```

---

## 2. gate.js — New Script

Thin scope: teaching schedule storage, per-step checkpoint enforcement, append-only session logging.

### Data ownership

gate.js owns these fields in `.session-state.json`:
- `teaching_schedule` — array of concept assignments with step keys
- `checkpoint_history` — array of checkpoint results
- `circuit_breaker` — string: `"closed"`, `"open"`, or `"half-open"`

gate.js owns the entire `.session-log.jsonl` file (append-only).

gate.js never touches session.js-owned fields (`phase`, `feature`, `branch`, `concepts_checked`, `decisions`, `chosen_option`, `session_id`).

### Subcommand: `schedule`

```bash
node scripts/gate.js schedule \
  --session-dir docs/professor/ \
  --phase 1 \
  --concepts '[{"concept_id":"x","domain":"y","status":"new","step":"phase1_checkpoint1"}]'
```

- Reads `.session-state.json`, writes `teaching_schedule` field
- Appends to existing schedule — calling schedule for phase 2 adds entries, does not replace phase 1 entries
- `--concepts` accepts a JSON string (array of objects). The skill constructs this from concept-agent results.
- Step key format: `phase{m}_checkpoint{n}` (e.g., `phase1_checkpoint1`, `phase2_checkpoint1`)
- Output: `{status: "ok", data: {scheduled: N, total: N}}`

### Subcommand: `checkpoint`

```bash
node scripts/gate.js checkpoint \
  --session-dir docs/professor/ \
  --step phase1_checkpoint1
```

- Reads `teaching_schedule` and `concepts_checked` from session state
- Finds all concepts assigned to the given step key
- Compares against `concepts_checked`: if any assigned concept is missing, returns `blocked`
- Three outcomes:
  - **passed** — all assigned concepts for this step are in `concepts_checked`
  - **blocked** — one or more assigned concepts not yet taught
  - **degraded** — `circuit_breaker` is `"open"`, warn and allow passage
- Appends to `checkpoint_history`: `{step, result, timestamp}`
- Output: `{status: "ok", data: {result: "passed|blocked|degraded", missing: [...]}}`

### Subcommand: `log`

```bash
node scripts/gate.js log \
  --session-dir docs/professor/ \
  --entry '{"event":"checkpoint","step":"phase1_checkpoint1","result":"passed"}'
```

- Appends one JSONL line to `.session-log.jsonl` (sibling of `.session-state.json`)
- Each line: `{timestamp, ...entry}` — timestamp injected by the script
- Append-only: never reads, edits, or truncates the file
- Output: `{status: "ok", data: {logged: true}}`

### Subcommand: `status`

```bash
node scripts/gate.js status --session-dir docs/professor/
```

- Read-only view of `teaching_schedule`, `checkpoint_history`, `circuit_breaker`
- Output: `{status: "ok", data: {schedule: [...], checkpoints: [...], circuit: "closed|open|half-open"}}`

### Failure mode

gate.js is local file I/O — failures are deterministic, not intermittent. No circuit breaker on gate.js itself. If gate.js crashes, the skill warns the developer and continues without enforcement (degraded mode).

### Module exports

```javascript
module.exports = { schedule, checkpoint, log, status };
```

---

## 3. session.js — Enhanced

6 subcommands: create, load, update, add-concept, finish, clear. Gate subcommand removed (replaced by gate.js checkpoint).

### Changes to `create`

New fields in initial session state:

```javascript
const state = {
  version: 2,
  session_id: crypto.randomUUID(),   // NEW — unique session identifier
  feature,
  branch,
  started: isoNow(),
  last_updated: isoNow(),
  phase: 'context_loading',
  architecture_loaded: false,
  architecture_components_read: [],
  requirements: { functional: [], non_functional: {} },
  concepts_checked: [],
  decisions: [],
  design_options_proposed: [],
  chosen_option: null,
  context_snapshot: null,
  // gate.js-owned fields (initialized here, managed by gate.js)
  teaching_schedule: [],
  checkpoint_history: [],
  circuit_breaker: 'closed',
};
```

`session_id` is generated once at creation and never changes. Used by skills to construct idempotency nonces for update.js.

### Removed: `gate`

The binary `session.js gate --require concepts` is removed. Replaced by `gate.js checkpoint` which does per-step enforcement against the teaching schedule.

### New: `finish`

```bash
node scripts/session.js finish --session-dir docs/professor/
```

1. Reads session state
2. Collects warnings:
   - Concepts in `teaching_schedule` not in `concepts_checked` → "N concepts scheduled but not taught"
   - Checkpoints with `result: "blocked"` never re-checked as `passed` → "N checkpoints never resolved"
   - `circuit_breaker` is `"open"` → "Session completed with open circuit breaker"
3. Sets `phase: "complete"`, `last_updated: now`
4. Output: `{status: "ok", data: {verified: true, warnings: [...]}}`

Finish is generic — checks session health, not skill-specific outputs. Called once at session end, not after every phase.

### Unchanged

- `load` — no changes
- `update` — no changes
- `add-concept` — no changes
- `clear` — deletes `.session-state.json`. Does NOT delete `.session-log.jsonl` (retained for post-mortem)

### Finish ordering

The skill calls `gate.js log` first (write the log entry), then `session.js finish` (flip phase to complete). Log-first ordering: if crash occurs between the two calls, the log entry exists for recovery. Reverse ordering would cause an unrecoverable gap.

---

## 4. update.js — Idempotency Nonce

### Problem

If professor-teach grades a concept and the FSRS update succeeds but the session state write fails, the skill retries. Without protection, the concept gets double-graded — two `review_history` entries for one teaching event.

Additionally, the current whiteboard Phase 4.2 calls `update.js --grade` for every taught concept at session end, but professor-teach already calls `update.js --grade` during teaching (Step 6). This is an existing double-grade risk in v3.

### Solution

New optional `--nonce` parameter:

```bash
node scripts/update.js \
  --concept "cache_invalidation" \
  --domain "databases" \
  --grade 3 \
  --nonce "a1b2c3d4-cache_invalidation" \
  --profile-dir ~/.claude/professor/concepts/
```

### Behavior

When `--nonce` is provided:
1. Read existing concept file
2. If `operation_nonce` in frontmatter matches the provided nonce → return `{status: "ok", data: {action: "idempotent_skip"}}` without writing
3. If no match → proceed with normal grade update, write new nonce to frontmatter

When `--nonce` is not provided: behave exactly as today. Backward compatible. `--create-parent`, `--add-alias`, `--body` paths are unaffected (no grade involved, no nonce needed).

### Nonce format

`{session_id}-{concept_id}`

- `session_id` is generated once by `session.js create` (UUID)
- `concept_id` is fixed for the teaching event
- Together they uniquely identify "this concept in this session"
- Deterministic: retries produce the same nonce

### Nonce propagation chain

```
session.js create (generates session_id)
  → skill reads session_id from state
    → skill passes --session-id to professor-teach subagent
      → professor-teach constructs {session_id}-{concept_id}
        → professor-teach passes --nonce to update.js
```

### Phase 4.2 fix

With nonces, the whiteboard's Phase 4.2 batch FSRS update becomes a safe fallback:
- professor-teach already graded with nonce `{session_id}-{concept_id}`
- Phase 4.2 constructs the same nonce for the same concept
- update.js sees nonce matches → `idempotent_skip`
- If professor-teach's update had failed (nonce not in file) → Phase 4.2 succeeds as the actual write

### Envelope

update.js CLI output wrapped in `{status, data, error}` per Section 1. Exported `update()` function returns raw data as today.

---

## 5. lookup.js, graph.js — Envelope Only

No functional changes. CLI output wrapped in the standard envelope.

### lookup.js (4 subcommands: search, status, list-concepts, reconcile)

- Success: `{status: "ok", data: {matched_concepts: [...], ...}}`
- Error: `{status: "error", error: {level: "blocking", message: "..."}}`

### graph.js (4 subcommands: scan, create-component, update-index, detect-changes)

- Same envelope wrapping pattern

### Rules

- Exported functions unchanged — internal callers and tests use raw returns
- Envelope is CLI boundary only
- Consumer impact: concept-agent.md and all SKILL.md files must parse the envelope (handled in skill rewrites)

---

## 6. Concept File Schema v4

### New frontmatter fields

```json
{
  "schema_version": 4,
  "operation_nonce": null
}
```

- `schema_version` — integer. v3 files implicitly have version 3 (field absent). v4 files have `4` explicitly.
- `operation_nonce` — string or null. Set by update.js on grade writes when `--nonce` provided. Format: `{session_id}-{concept_id}`.

### Existing fields

All current frontmatter preserved as-is: `concept_id`, `domain`, `level`, `parent_concept`, `is_seed_concept`, `difficulty_tier`, `aliases`, `related_concepts`, `scope_note`, `first_encountered`, `last_reviewed`, `review_history`, `fsrs_stability`, `fsrs_difficulty`.

### Rich markdown body

professor-teach writes structured markdown body (Key Points + Notes sections). v4 formalizes the structure but does not change the write mechanism — professor-teach continues using `update.js --body`.

### Backward compatibility

- **v4 reads v3 files:** missing `schema_version` defaults to `3`, missing `operation_nonce` defaults to `null`. No crash, no migration required.
- **v3 reads v4 files:** unknown frontmatter fields ignored by `readMarkdownWithFrontmatter` (JSON parse is permissive). Markdown body preserved.
- **No data loss on rollback** from v4 to v3. v4 fields are additive.

---

## 7. migrate-v4.js — New Script

Batch migration of v3 concept files to v4 schema. Optional — files upgrade lazily on first `update.js` write regardless.

### Usage

```bash
node scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/
node scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/ --dry-run
```

### Behavior

1. Walks all domain subdirectories under `--profile-dir`
2. For each `.md` file, reads frontmatter via `readMarkdownWithFrontmatter`
3. If `schema_version` is absent or `< 4`:
   - Adds `schema_version: 4`
   - Adds `operation_nonce: null` (if absent)
   - Writes file back (atomic tmp+rename via `writeMarkdownFile`)
4. If `schema_version` is already `4`: skips (idempotent)
5. Per-file error handling: if one file fails, logs the error and continues to next file

### `--dry-run` mode

Reports what would change without writing.

### Output

```json
{
  "status": "ok",
  "data": {
    "migrated": 12,
    "skipped": 3,
    "errors": 0,
    "dry_run": false
  }
}
```

### Module exports

```javascript
module.exports = { migrate };
```

---

## 8. SKILL.md Template

Every skill follows a structural contract with three parts: frontmatter declaration, lifecycle skeleton, and degradation section.

### Frontmatter additions

```yaml
inputs:
  - name: "type, description"
outputs:
  - name: "path or description"
failure_modes:
  - mode_name: "action"
lifecycle:
  phases: [phase_names]
  checkpoints:
    step_key: "description"
```

### Example: whiteboard

```yaml
---
name: whiteboard
description: ...
model: sonnet
inputs:
  - feature_description: "free text"
  - continue: "boolean, optional"
outputs:
  - design_document: "docs/professor/designs/{date}-{shorthand}.md"
  - session_log: "docs/professor/.session-log.jsonl"
failure_modes:
  - concept_agent_timeout: "warn, continue without tracking"
  - professor_teach_failure: "warn, skip concept, log gap"
  - gate_js_crash: "warn, continue without enforcement"
  - session_js_crash: "fatal, stop"
lifecycle:
  phases: [context_loading, requirements, hld, lld, deliverable]
  checkpoints:
    phase1_checkpoint1: "L1 concepts resolved and scheduled before requirement discussion"
    phase2_checkpoint1: "L2 concepts resolved and scheduled before design proposals"
    phase3_checkpoint1: "L2 concepts resolved and scheduled per component"
---
```

### Lifecycle skeleton

Each phase section in the SKILL.md body follows this pattern:

```markdown
## Phase N: {Name}

### Checkpoint: phase{N}_checkpoint{M}

Before proceeding, call:
  gate.js schedule --concepts [...] --phase N
  gate.js checkpoint --step phaseN_checkpointM

If blocked: teach missing concepts via professor-teach, then re-check.
If degraded: warn developer, continue.

### {Phase content — LLM-driven discussion}

### Phase Transition

  gate.js log --entry {phase event}
  session.js update --phase {next_phase}
```

### Degradation section

Every SKILL.md ends with an explicit section listing what happens when each declared failure mode fires. No ambiguity.

### Template scope

The template enforces structure at **boundaries** — phase entry checkpoints, phase exit logging, and failure handling. The conversational flow within a phase (debating options, teaching, asking questions) remains LLM-driven.

### Skills affected

All 5 rewritten: whiteboard, professor-teach, analyze-architecture, backend-architect, professor. Frontmatter values differ per skill, structural pattern is identical.

---

## 9. professor-teach — Rewritten Output Contract

### Structured output — four elements every time

1. **Analogy** (~100 words) — concrete, visual comparison to everyday life
2. **Real-world production example** (~150 words) — how it's used at scale
3. **Task connection** (~100 words) — "In your {context}, this means..."
4. **Recall question** — application question tied to the developer's task

These are declared in the skill's frontmatter as outputs. The degradation section specifies fallback if the subagent produces fewer elements.

### New argument: `--session-id`

```
argument-hint: "{concept_id} [--context \"...\"] [--status ...] [--domain \"...\"] [--session-id \"...\"]"
```

professor-teach receives `--session-id` from the calling skill. Used to construct the idempotency nonce: `{session_id}-{concept_id}`.

### Nonce on grade write

Step 6 (Update Score) passes `--nonce`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{concept_id}" \
  --domain "{domain}" \
  --grade {1-4} \
  --nonce "{session_id}-{concept_id}" \
  --profile-dir ~/.claude/professor/concepts/
```

### Adaptive re-teaching

On re-encounter (status is `teach_new` or `review`), professor-teach reads the existing markdown body from the concept file before teaching:

- **Different analogy** — don't repeat what was used last time
- **Target the weakness** — if prior notes say the developer struggled with X, lead with X
- **Acknowledge progress** — reference prior session context

### Rich notes on write-back

- **First teach** (status `new` or `encountered_via_child`): Key Points + "Learned in context of {task}"
- **Re-teach/review** (status `teach_new` or `review`): Append to Notes section: "Reviewed in context of {task}. {What clicked / what struggled}. Grade: {N}."

Notes accumulate across sessions. On re-encounter, the professor reads these notes and adapts teaching approach.

---

## 10. concept-agent — Updated for Envelope

### Changes

- All `lookup.js` and `update.js` script calls return the envelope. Agent instructions updated to parse `data` field from `{status, data, error}`.
- Self-healing retry protocol unchanged — `error` field in envelope aligns with circuit breaker classification.
- Output format unchanged — concept-agent returns its own JSON (`resolved`, `ambiguous`, `created` arrays). Envelope is what it *consumes*, not what it *produces*.

### No other changes

Resolution flow (exact → alias → semantic → create) and FSRS status computation unaffected.

---

## 11. Test Pyramid

### Tier 1: Unit tests

- Existing shell-based tests in `tests/cli/` continue as-is
- New unit tests for: `envelope()`, `envelopeError()` in utils.js, `finish()` in session.js, all four gate.js subcommands
- Framework: Node `node:test` + `node:assert` for function-level testing

### Tier 2: Contract tests (new — 1 per script)

Each script gets a contract test validating:
- Success output matches `{status: "ok", data: {...}}`
- Error output matches `{status: "error", error: {level: "...", message: "..."}}`
- `data` and `error` are mutually exclusive (never both, never neither)
- Script-specific data shape (e.g., gate.js checkpoint returns `{result, missing}`)

Contract tests run against the CLI boundary (spawn process, capture stdout), not exported functions.

### Tier 3: Integration tests (new — 3 chains)

**Chain 1: Teaching schedule lifecycle**
```
session.js create
  → gate.js schedule (phase 1 concepts)
  → gate.js checkpoint phase1_checkpoint1 (expect: blocked)
  → session.js add-concept (teach the concept)
  → gate.js checkpoint phase1_checkpoint1 (expect: passed)
```

**Chain 2: Idempotency nonce**
```
update.js --grade 3 --nonce "test-session-concept_a" (expect: created)
  → update.js --grade 3 --nonce "test-session-concept_a" (expect: idempotent_skip)
  → verify: single review_history entry
```

**Chain 3: Full session lifecycle**
```
session.js create
  → gate.js schedule + checkpoint
  → session.js add-concept (multiple)
  → gate.js log (multiple entries)
  → session.js finish (expect: verified, check warnings)
  → verify: .session-log.jsonl has all entries
```

---

## Nonce Propagation Summary

The idempotency nonce flows through 4 hops:

| Hop | Component | Action |
|-----|-----------|--------|
| 1 | `session.js create` | Generates `session_id` (UUID) |
| 2 | Skill (e.g., whiteboard) | Reads `session_id` from session state |
| 3 | professor-teach subagent | Receives `--session-id`, constructs `{session_id}-{concept_id}` |
| 4 | `update.js` | Receives `--nonce`, checks against `operation_nonce` in concept file |

**Phase 4.2 safety:** Whiteboard's batch FSRS update at session end constructs the same nonce (`{session_id}-{concept_id}`) as professor-teach. If professor-teach already wrote the grade, update.js returns `idempotent_skip`. If professor-teach's write failed, Phase 4.2 succeeds as the actual write. No double-grading in either case.

---

## File Inventory

### New files
| File | Purpose |
|------|---------|
| `scripts/gate.js` | Teaching schedule, checkpoint enforcement, session logging |
| `scripts/migrate-v4.js` | Batch v3→v4 concept file migration |
| `tests/unit/test-envelope.js` | Unit tests for envelope helpers |
| `tests/unit/test-gate.js` | Unit tests for gate.js subcommands |
| `tests/unit/test-finish.js` | Unit tests for session.js finish |
| `tests/contract/test-*.js` | Contract tests, one per script |
| `tests/integration/test-chain-*.js` | Integration chain tests |

### Modified files
| File | Changes |
|------|---------|
| `scripts/utils.js` | +`envelope()`, +`envelopeError()` |
| `scripts/session.js` | +`finish`, -`gate`, +`session_id` in create, +gate.js-owned field initialization |
| `scripts/update.js` | +`--nonce` parameter, idempotency check before grade write |
| `scripts/lookup.js` | CLI output wrapped in envelope |
| `scripts/graph.js` | CLI output wrapped in envelope |
| `skills/whiteboard/SKILL.md` | Rewritten to template |
| `skills/professor-teach/SKILL.md` | +`--session-id` arg, structured output contract, adaptive re-teaching |
| `skills/analyze-architecture/SKILL.md` | Rewritten to template |
| `skills/backend-architect/SKILL.md` | Rewritten to template |
| `skills/professor/SKILL.md` | Rewritten to template |
| `agents/concept-agent.md` | Updated to parse envelope from script output |
| `.claude-plugin/plugin.json` | Version bump to `4.0.0` |

---

## Migration & Rollback

### Migration steps
1. Install v4.0.0 — v3 profiles work immediately (lazy upgrade)
2. Optional: `node scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/ --dry-run`
3. Optional: `node scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/`
4. Files upgrade lazily on first `update.js` write if not batch-migrated

### Rollback
- Revert plugin to v3.x. v3 code ignores unknown frontmatter fields. Markdown body notes preserved but unused.
- `.session-log.jsonl` is a new file — v3 ignores it.
- No data loss on rollback.

---

## Versioning

- **v4.0.0**: Breaking changes to script CLI output (envelope), session state schema (version 2, new fields), concept file schema (version 4). SKILL.md contract rewrite.
- **v4.x patches**: professor-teach quality tuning, difficulty-tier filtering, domain summary stats. No breaking changes.
