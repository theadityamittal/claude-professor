# Design: Fix professor-teach Step Ordering for New Concepts

**Date:** 2026-04-21  
**File to change:** `skills/professor-teach/SKILL.md`

## Problem

`update.js --body` requires the concept's profile file to already exist on disk. `update.js --grade` is what creates the file on first call (when `!existing`). The skill instructions put Step 6 (--body) before Step 7 (--grade), which works for `review` status (file already exists) but fails for `new`, `teach_new`, `encountered_via_child`, and `known_baseline` statuses (file doesn't exist yet).

Root cause in `update.js`:
- `--body` path (line 108–111): returns `blocking` error if `!existing`
- `--grade` path (line 159–180): calls `writeMarkdownFile` unconditionally when `!existing` → creates the file

## Solution

Swap Step 6 and Step 7 in `skills/professor-teach/SKILL.md` so `--grade` always runs first (creating the file if needed), then `--body` patches the Teaching Guide into the now-existing file.

## Changes

Single file edit in `skills/professor-teach/SKILL.md`:

| # | Change |
|---|--------|
| 1 | Step 6 header → "Update FSRS state with grade + nonce" (move --grade content here) |
| 2 | Step 7 header → "Write/overwrite Teaching Guide section" (move --body content here) |
| 3 | New Step 7 skip condition: "Skip Step **7** entirely…" (was "Step 6") |
| 4 | New Step 7 failure mode: "…continue to Step **8**. FSRS state is already persisted." (was "continue to Step 7. The grade must still be recorded.") |

No changes to `update.js`, `whiteboard.js`, or any other file.

## Data Flow After Fix

```
new / teach_new / encountered_via_child / known_baseline:
  Step 6 (--grade) → creates file with placeholder body + FSRS frontmatter
  Step 7 (--body)  → overwrites body with Teaching Guide  ✓

review:
  Step 6 (--grade) → updates FSRS frontmatter, preserves existing body
  Step 7 (--body)  → overwrites body with Teaching Guide  ✓

skipped_not_due:
  Skip Steps 6 and 7 entirely → Step 8  ✓
```

## Cross-reference Preserved

The `known_baseline` branch in Step 2 says "Go to Step 6 with this grade." After the swap, Step 6 is `--grade` — the correct first call for a new file. No change needed to Step 2.

## Error Handling

If Step 6 (--grade) fails for a new concept, Step 7 (--body) also fails (file still doesn't exist). Both failures are noted in `notes_for_session_log`; the envelope still returns action + grade. Same degradation contract as today.

## Scope

This is a skill-text-only fix. No script changes, no data migrations, no API changes.
