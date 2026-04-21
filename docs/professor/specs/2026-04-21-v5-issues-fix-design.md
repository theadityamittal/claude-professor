# v5.0.0 Issues Fix — Design Spec

**Date:** 2026-04-21
**Branch:** spec/v5-whiteboard-redesign
**Scope:** Issues 1, 3, 4, 6 from v5-manual-run-issues.txt (documentation bugs + behavior bugs; missing features deferred)

---

## Issues in Scope

| Issue | Type | Description |
|-------|------|-------------|
| 1 | Behavior bug | `disable-model-invocation: true` blocks professor-teach from being invoked inline by whiteboard |
| 3 | Doc bug | whiteboard SKILL.md shows `--concern-id`/`--component-id` but script only accepts `--unit-id` |
| 4 | Behavior bug | `record-concept` re-fetches live FSRS state after `update.js` has already advanced it, causing false-invalid rejections |
| 6 | Doc bug | whiteboard SKILL.md shows `seeds`/`l2_decisions` but script reads `concepts_seed`/`concepts_proposed`/`L2_decisions` |

## Issues Deferred

Issues 2, 5, 7 (missing features: task-context filtering, task_skipped action, Phase 3 skip) are out of scope for this sprint.

---

## Design

### Issue 3 & 6 — Documentation fixes

**File:** `skills/whiteboard/SKILL.md`

Two sets of examples in the SKILL.md don't match what the scripts accept.

**Issue 3:** All `record-concept` examples use `--concern-id <id>` (Phase 1) and `--component-id <id>` (Phase 2/3). The script (`scripts/whiteboard/record-concept.js`) only accepts `--unit-id`. Update all examples to use `--unit-id` consistently.

**Issue 6:** The `register-components` example JSON uses `"seeds"` and `"l2_decisions"` as field names. The script (`scripts/whiteboard/register-components.js`) reads `concepts_seed`, `concepts_proposed`, and `L2_decisions` (capital L). Update the example JSON to match.

No script changes. Docs only.

---

### Issue 1 — Remove `disable-model-invocation`

**File:** `skills/professor-teach/SKILL.md`

**Problem:** `disable-model-invocation: true` in the frontmatter prevents the Skill tool from invoking professor-teach even when called from within another skill (whiteboard). The changelog fix only applies to user-typed slash commands, not programmatic Skill tool calls.

**Fix:** Remove the `disable-model-invocation: true` line from the frontmatter. Professor-teach becomes directly invokable via the Skill tool.

**Why this is safe:** The `argument-hint` in the frontmatter is complex enough to signal that direct invocation requires session context. Future standalone teaching mode will use this direct invocability intentionally.

---

### Issue 4 — Remove FSRS re-fetch from record-concept

**File:** `scripts/whiteboard/record-concept.js`

**Problem:** `record-concept` calls `fetchConceptState` to re-fetch the live FSRS status, then validates the recorded action against `ACTION_BY_STATUS[status]`. This fires after `professor-teach` has already called `update.js --grade`, which advances the FSRS state. A concept that was `"review"` at `next-concern` time becomes `"skip"` after a grade-3 update — so `record-concept` sees `"skip"`, and rejects `"reviewed"` as invalid for that status.

**Root cause:** The re-fetch was over-engineered. `next-concern` already validated FSRS status when it issued the status to the orchestrator. `record-concept` is a session bookkeeper writing to a temp state file — it has no business re-validating FSRS.

**Fix:** Delete the `fetchConceptState` function call and the `ACTION_BY_STATUS` validation block. Keep:
- Concept-scheduled-in-unit check (reads session state, no FSRS)
- Valid action string check (`taught | reviewed | known_baseline | skipped_not_due`)
- Grade/action pairing check (grade required for `taught`/`reviewed`, null for `skipped_not_due`)

**What stays unchanged:**
- `professor-teach` SKILL.md — no changes to teaching flow or update.js calls
- `update.js` — no changes
- whiteboard SKILL.md — no new arguments needed
- Standalone teaching mode — unaffected (record-concept is a whiteboard-only concern)

---

## Files Changed

| File | Change |
|------|--------|
| `skills/whiteboard/SKILL.md` | Fix `--concern-id`/`--component-id` → `--unit-id`; fix `seeds`/`l2_decisions` → `concepts_seed`/`concepts_proposed`/`L2_decisions` |
| `skills/professor-teach/SKILL.md` | Remove `disable-model-invocation: true` from frontmatter |
| `scripts/whiteboard/record-concept.js` | Remove `fetchConceptState` call and `ACTION_BY_STATUS` validation block |

---

## What Is Not Changing

- No new script arguments
- No changes to professor-teach teaching flow
- No changes to update.js
- No changes to how whiteboard calls professor-teach
- No changes to standalone invocation path
