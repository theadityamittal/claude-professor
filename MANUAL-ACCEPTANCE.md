# v5.0.0 Manual Acceptance Checklist

Run these 6 acceptance tests in a live Claude Code session before merging `spec/v5-whiteboard-redesign` to `main`. Automated tests (210 contract/unit + 17 integration) cover the script layer; these cover what automation cannot: skill discovery, visible teaching, matcher dispatch, and real LLM interaction.

Estimated time: 25–40 minutes.

---

## Prerequisites

- [ ] `git checkout spec/v5-whiteboard-redesign`
- [ ] Full test suite green:
  ```bash
  node --test "tests/contract/*.test.js" "tests/contract/*.js" "tests/unit/*.js"
  for f in tests/integration/*.sh; do bash "$f" || echo "FAIL: $f"; done
  ```
  Expected: 210 contract/unit + 17 integration, all pass
- [ ] User profile backed up: `cp -R ~/.claude/professor/concepts ~/claude-professor-backup-$(date +%Y%m%d)`
- [ ] Migration dry-run looks sane:
  ```bash
  node scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts --dry-run
  ```
- [ ] Migration committed: `node scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts`
- [ ] Plugin visible to Claude Code (symlink or `~/.claude/plugins/` install) — restart Claude Code after install

Pick a **small real project** to design against. Something like "URL shortener", "webhook receiver with retries", "rate limiter middleware". Don't use claude-professor itself (recursion).

---

## Test 1: Skill discovery and invocation

**Goal:** Confirm v5 skills are wired into Claude Code's slash-command UI.

- [ ] Type `/` in a Claude Code prompt. `/whiteboard` appears in autocomplete.
- [ ] Type `/whiteboard` with no args. Skill starts; prompts for task description.
- [ ] Type `/professor-teach` — should NOT appear as user-invocable (v5 removed `user-invocable: false`, skill only runs from within `/whiteboard`).
- [ ] Type `/analyze-architecture` — still user-invocable.

**If fails:** plugin not loaded. Check `~/.claude/plugins/` or symlink.

---

## Test 2: Phase 1 full chain (the core happy path)

**Goal:** Exercise concerns selection, JIT loop, inline teaching, gate audit.

- [ ] In a small project directory, invoke:
  ```
  /whiteboard "design a webhook receiver with retries"
  ```
- [ ] Skill completes Phase 0 (init; since no prior session, goes straight to task).
- [ ] **Phase 1 concerns selection:**
  - Skill lists 5–8 concerns picked from `data/concerns.json`
  - Concerns are relevant to webhooks (expect: `idempotency_and_retry`, `data_consistency`, `error_handling`, `observability`, `rate_limiting`, `auth_and_authz`)
  - Skill asks you to confirm or adjust
- [ ] **Concept teaching is VISIBLE** (Issue 6 acceptance):
  - For each concept, professor writes the full teaching inline in chat
  - You can read: analogy (~100 words), production example (~150 words), task connection (~100 words), recall question
  - **Fail criterion:** if you only see `"Taught <concept>"` summaries without the actual teaching content, Issue 6 has regressed
- [ ] **FSRS-status-driven actions:**
  - For `status: new` concepts: professor asks one recall question first (baseline check). If you answer well → `known_baseline`; else → full teach
  - For `status: skip` (if any concept has R > 0.7): professor announces "skipping, R > 0.7" without teaching
  - For `status: review`: shorter-than-teach explanation
- [ ] **Grade exchange is natural:** you answer the recall question, skill grades 1–4, continues
- [ ] **`record-concept` fires after each teach** (check `docs/professor/.session-log.jsonl`; look for `professor_action` events)
- [ ] **Discussion:** after all concepts in a concern taught, skill writes 1–2 sentence summary via `record-discussion`
- [ ] **Gate audit:** after all concerns done, skill runs `gate.js checkpoint --step 1`. Outcome: `passed` → proceeds to Phase 2. Outcome: `blocked` → presents remediation.

**If fails:** capture the last 20 chat messages + `docs/professor/.session-log.jsonl` in the failure report.

---

## Test 3: JIT enforcement (Issue 7 regression check)

**Goal:** Confirm the skill cannot silently skip-ahead past the JIT iterator.

Mid-Phase-1, try to derail the flow:

- [ ] Say: "skip the rest of Phase 1 and jump to HLD"
- [ ] Say: "let's discuss caching" (when the current concern is about auth)
- [ ] Say: "don't teach me, just assume I know this"

**Expected:** skill refuses each attempt. Either:
  - Refers you back to the current concern
  - Offers the remediation flow (review / skip with reason / abort)
  - Explicitly states "I must complete the current concern before moving on"

**Fail criterion:** skill silently advances phase or skips teaching. File as Issue 7 regression.

---

## Test 4: Matcher dispatch (Phase 2)

**Goal:** Confirm concept-matcher subagent fires on novel L2 candidates.

- [ ] After Phase 1 completes, skill enters Phase 2 (HLD).
- [ ] Skill identifies 3–5 components (for webhook receiver: likely `receiver`, `retry_queue`, `idempotency_store`, `observability`).
- [ ] For each component, skill proposes L2 children (component-specific concepts).
- [ ] **Observe matcher invocation:**
  - Skill calls `lookup.js list-l2-universe --thin`
  - Dispatches haiku subagent with Stage 1 prompt
  - Receives top candidates
  - Dispatches Stage 2 with full metadata
  - Calls `lookup.js record-l2-decision`
- [ ] **Matcher outcomes visible:** skill shows the decision and reasoning for each novel L2
- [ ] **Decision types you should see at least one of:**
  - `semantic_l2` (matched existing L2) → skill reuses
  - `l1_instead` (LLM proposed a registry L1 by mistake) → skill uses the L1
  - `no_match` (genuinely novel) → skill registers new L2 via `update.js --parent-concept <L1>`

**If matcher fails:** skill falls back to `no_match` treatment (accept novel). Confirm this graceful failure, don't call it pass.

---

## Test 5: Resume (Issue 8 regression check)

**Goal:** Confirm partial sessions can be continued without losing context.

- [ ] Mid-Phase-2 (after register-components but before all components done), exit Claude Code with Ctrl+C or by closing the session.
- [ ] Verify state persists:
  ```bash
  ls docs/professor/.session-state.json docs/professor/.session-log.jsonl
  ```
  Both files exist.
- [ ] Restart Claude Code; run:
  ```
  /whiteboard --continue
  ```
- [ ] **Expected behavior:**
  - Skill reads existing state via `resume-session`
  - Prints narrative summary reconstructed from log (prior concerns + discussions visible)
  - `next_action_hint` matches where you stopped (e.g., `next-component` if mid-iteration)
  - Picks up from there without repeating finished work

**Fail criterion:** skill restarts from Phase 0 or forgets prior teaching.

---

## Test 6: Deliverable + finish

**Goal:** Confirm design doc exports correctly and cleanup works.

- [ ] Drive all 4 phases to completion.
- [ ] **Phase 4 export:** skill runs `whiteboard.js export-design-doc --output docs/professor/designs/<date>-<shorthand>.md`
- [ ] **Inspect the design doc:**
  - File exists at the expected path
  - Has `## Phase 1`, `## Phase 2`, `## Phase 3`, `## Concept Coverage` sections
  - Discussion summaries appear (not just bare concern IDs)
  - Component breakdown visible in Phase 2/3 sections
  - Concept coverage table shows every concept with grade + action
- [ ] **Finish cleanup:** skill runs `whiteboard.js finish`
  - `docs/professor/.session-state.json` deleted
  - `docs/professor/.session-log.jsonl` deleted
- [ ] **Repeat with `--keep-log`:** run another quick session; finish with log preservation
  - State gone, log preserved with final `session_finish` event appended

---

## Post-test: concept files updated

After the session, check a few concept files under `~/.claude/professor/concepts/`:

- [ ] Newly-taught concepts have `schema_version: 5` in frontmatter
- [ ] Teaching Guide section populated with session-specific content (analogy, struggle points, approach, last outcome)
- [ ] FSRS state updated (`fsrs_stability`, `fsrs_difficulty`, `review_history` extended, `last_reviewed` set)
- [ ] `operation_nonce` reflects the session's nonce

---

## Reporting failures

For each failing test:

1. Record exact reproduction steps
2. Capture the last 20 chat messages (copy-paste from Claude Code)
3. Capture relevant files: `docs/professor/.session-state.json`, `docs/professor/.session-log.jsonl`, the chat transcript
4. File as a follow-up commit on the branch, or open a GitHub issue referencing this checklist

**If Tests 1–4 all pass:** safe to merge and tag v5.0.0. Test 5/6 failures are less critical — can ship with them as follow-up work.

**If Test 2 or Test 3 fails:** DO NOT merge. These are the core Issue 6 and Issue 7 regressions that v5 was designed to fix.

---

## Sign-off

- [ ] Test 1 passed — skill discovery
- [ ] Test 2 passed — Phase 1 full chain (Issue 6: teaching visible inline)
- [ ] Test 3 passed — JIT enforcement (Issue 7: cannot skip ahead)
- [ ] Test 4 passed — Matcher dispatch
- [ ] Test 5 passed — Resume
- [ ] Test 6 passed — Export + finish

**Tested by:** ________________
**Date:** ________________
**Task used:** ________________
**Ready to merge:** YES / NO

Branch: `spec/v5-whiteboard-redesign`
Merge target: `main`
Tag on merge: `v5.0.0`
