# Phase 2: Architecture Analysis & System Design

## Date
2026-04-06

## Status
Validated

## Spec Reference
`INSTRUCTIONS-v2.md` (complete specification), `phase2-implementation-plan.md` (task-level implementation guide)

## Overview

Expand claude-professor with architecture analysis and backend system design capabilities. Three new commands (`/analyze-architecture`, `/backend-architect`, `/professor-teach`), a storage migration from JSON to markdown, and supporting scripts for session state, architecture graphs, and structural change detection.

Builds on Phase 1 (FSRS-5 spaced repetition, `/professor` teaching flow, 57 tests passing).

---

## Storage Migration

### What Changes

Profile storage moves from JSON arrays per domain to individual markdown files with JSON frontmatter.

**Before (Phase 1):**
```
~/.claude/professor/profile/databases.json    # JSON array of concept objects
```

**After (Phase 2):**
```
~/.claude/professor/concepts/databases/connection_pooling.md    # Individual concept file
```

### Scripts Affected

- **utils.js** — gains `readMarkdownWithFrontmatter`, `writeMarkdownFile`, `listMarkdownFiles`, `expandHome`
- **lookup.js** status mode — reads markdown files instead of JSON arrays; search mode unchanged
- **update.js** — writes individual markdown files; generates human-readable markdown body (title + notes)
- **migrate-v2.js** (new) — one-time, idempotent JSON-to-markdown conversion
- **professor SKILL.md** — `--profile-dir` updates from `~/.claude/professor/profile/` to `~/.claude/professor/concepts/`

### Critical Gate

After storage migration (Tasks 1-4), Task 5 verifies all Phase 1 tests pass and `/professor` works end-to-end with markdown storage. Nothing proceeds until this gate passes. If something breaks, fix it before moving to Phase 2 features.

---

## New Scripts

### session.js — Design Session State

Manages ephemeral session state at `docs/professor/.session-state.json`. Five modes:

| Mode | Purpose |
|------|---------|
| `create` | Initialize with feature name, branch, timestamp |
| `load` | Return full state JSON, or `{"exists": false}` |
| `update` | Modify specific fields (phase, context-snapshot, etc.) |
| `add-concept` | Append to `concepts_checked` array, deduplicate by concept_id |
| `clear` | Delete the session file |

### graph.js — Architecture Graph Management

Manages architecture markdown files. Three modes:

| Mode | Purpose |
|------|---------|
| `create-component` | Write component markdown with wiki-links for dependencies, backtick identifiers for concepts |
| `update-index` | Scan existing component files, rebuild `_index.md` with component table |
| `detect-changes` | Compare scan dirs against existing components, return JSON with `structural_changes_detected` boolean |

### detect-changes.js — Git Hook Script

PostToolUse hook on Bash tool. Reads tool input from stdin, checks if it's a git push/pull/merge on the base branch. If structural changes detected, prints advisory warning to stderr. Always exits 0 — never blocks operations.

### Independence

session.js and graph.js are independent of each other and independent of the storage migration. After the Task 5 gate, they can be built in parallel.

---

## Skills

### professor-teach

**Frontmatter:** `context: fork`, `agent: general-purpose`, `user-invocable: false`

Lightweight single-concept teaching skill. Invoked by `/backend-architect` when a concept gap is detected. Runs in an isolated subagent context — teaching content stays in the fork, only the grade and a one-sentence summary return to the caller.

**Flow:** identify concept -> check registry -> explain (analogy + example tied to task context) -> recall question -> wait for answer -> grade (FSRS 1-4) -> update score via update.js -> return summary

Under 400 words total teaching content per concept.

### analyze-architecture

**Frontmatter:** `disable-model-invocation: true`

Scans the current codebase and produces a multi-file architecture graph. Uses two parallel Explore subagents (file scanner + dependency analyzer), then synthesizes results.

**Output structure:**
```
docs/professor/architecture/
  _index.md                    # Component index + overview
  components/                  # Individual component files
  data-flow.md                 # Mermaid diagrams
  tech-stack.md                # Dependencies, versions
```

**Modes:**
- Default: full analysis, write all files
- `--update`: refresh changed components, preserve unchanged
- `--branch {name}`: generate delta file comparing branch against base architecture

**Accuracy strategy:** Package manifests are ground truth. Config files are ground truth. Directory structure is evidence, not proof. Ask the developer when uncertain.

### backend-architect

**Frontmatter:** `disable-model-invocation: true`

Interactive system design conversation for backend features. Seven phases:

1. **Context loading** — read architecture doc if available; if not, do a lightweight codebase scan (read package manifest for tech stack, scan top-level directory structure for components, read 2-3 entry point files for routing/patterns) and suggest `/analyze-architecture` for a persistent, comprehensive graph in future sessions
2. **Requirements clarification** — one question at a time, multiple-choice preferred
3. **Architecture fit** — how the feature fits existing system, surface hidden constraints
4. **Design options** — 2-3 approaches with tradeoffs, lead with recommendation
5. **Finalization** — present complete design section by section
6. **Write design document** — output to `docs/professor/designs/`
7. **Cleanup** — delete session state, flag architecture for refresh if needed

**Lazy concept checking:** Throughout all phases, whenever a technical concept arises:
1. Check session state (skip if already checked this session)
2. Run lookup.js (use `status` field directly — never re-implement thresholds)
3. Act: skip (known), inline review (decaying), delegate to professor-teach (new/weak)

**Constructive debate:** Present opinion with reasoning -> present 2-3 options -> challenge risks if developer's choice has unaddressed issues -> accept and record reasoning when sound.

**Resume:** `--continue` reads `.session-state.json` and resumes from recorded phase. Previously checked concepts are not re-checked.

---

## Integration Points

### How Pieces Connect

- `/backend-architect` reads architecture from `docs/professor/architecture/` (produced by `/analyze-architecture`)
- `/backend-architect` delegates teaching to `/professor-teach` (forked context)
- `/backend-architect` manages session state via `session.js` throughout the conversation
- `/backend-architect` writes FSRS scores via `update.js` and design docs to `docs/professor/designs/`
- `detect-changes.js` hook monitors git operations and advises when architecture may be stale

### Decoupling

- `/analyze-architecture` is fully standalone
- `/backend-architect` works without an architecture doc (lightweight codebase scan + developer input)
- `/professor-teach` is designed to be called by other skills; tested through `/backend-architect`

### Error Handling

| Failure | Behavior |
|---------|----------|
| lookup.js fails | Warn, continue without teaching |
| update.js fails | Warn, still produce design document |
| Corrupt session state | Warn, start fresh |
| Architecture doc deleted mid-session | Continue from developer description |
| professor-teach subagent fails | Log failure, continue design conversation |

---

## Lessons from Phase 1

Issues encountered during Phase 1 implementation that must be addressed in Phase 2:

| Issue | What Happened | Phase 2 Action |
|-------|---------------|----------------|
| Return value references (#3033) | Immutability refactor left return statement referencing old variable | Verify return values after update.js rewrite |
| Grade validation (#3031) | Invalid grades corrupted profile data | Preserve grade 1-4 validation in markdown-writing update.js |
| CLI argument validation (#3034) | Missing args caused cryptic TypeErrors | Preserve validation in lookup.js after status mode rewrite |
| Threshold duplication (#3015) | Knowledge-agent re-applied different thresholds over lookup.js | backend-architect uses lookup.js `status` field directly |
| Status fetch fallback (#3014) | Unknown status left agent unable to classify | backend-architect warns and continues without teaching on failure |

---

## Testing Strategy

### Automated Tests

| Test File | Coverage |
|-----------|----------|
| `utils.test.js` | Markdown frontmatter round-trip, malformed JSON, empty body, parent dir creation, expandHome |
| `lookup.test.js` | Updated for markdown concept files; search mode unchanged |
| `update.test.js` | Markdown file creation, frontmatter updates, body preservation, notes |
| `migrate-v2.test.js` | JSON-to-markdown conversion, idempotency, empty source |
| `session.test.js` | Full lifecycle: create -> load -> update -> add-concept (deduplicate) -> clear |
| `graph.test.js` | create-component with wiki-links, update-index table, detect-changes |

### Hard Gate

Task 5: All Phase 1 tests pass + `/professor` end-to-end with markdown storage. This gate must pass before any Phase 2 feature work begins.

### Manual Testing

- **analyze-architecture**: run on a real codebase, verify output files and Mermaid rendering
- **backend-architect**: full design conversation verifying lazy concept checking, teaching delegation (professor-teach), session state, design doc output, resume with `--continue`

### Integration Tests (Task 12)

- Full pipeline: analyze-architecture -> backend-architect -> verify design doc references architecture
- Context pressure: verify professor-teach in forked context doesn't bloat main conversation
- Error scenarios: deleted architecture doc, corrupt session state, script failures

---

## Implementation Order

Bottom-up. Each layer testable before the next.

| Task | What | Depends On |
|------|------|------------|
| 1 | utils.js markdown functions | — |
| 2 | lookup.js markdown reading | Task 1 |
| 3 | update.js markdown writing | Task 1 |
| 4 | migrate-v2.js | Task 1 |
| **5** | **Phase 1 compatibility gate** | **Tasks 1-4** |
| 6 | session.js | Task 5 gate |
| 7 | graph.js | Task 5 gate |
| 8 | professor-teach skill | Task 5 gate |
| 9 | analyze-architecture skill | Task 7 |
| 10 | detect-changes.js hook | Task 7 |
| 11 | backend-architect skill | Tasks 6, 8, 9 |
| 12 | Integration testing | All |

Tasks 6, 7, and 8 are independent and can be parallelized after the Task 5 gate.

---

## Architecture Decisions

| # | Decision | Reasoning |
|---|----------|-----------|
| P2-1 | Lazy concept identification | Concepts emerge during conversation. Upfront identification over-identifies and under-identifies. |
| P2-2 | Phase-agnostic concept checking | Technical concepts surface during any phase, not just design phases. |
| P2-3 | JSON frontmatter in markdown | `JSON.parse()` is zero-dependency, zero-ambiguity. |
| P2-4 | Wiki-links for components, identifiers for concepts | Wiki-links enable Obsidian visualization. Concept files live in a different directory so wiki-links would be broken cross-vault. |
| P2-5 | professor-teach as forked skill | Context window preservation. Teaching stays in subagent, only grade returns. |
| P2-6 | Backend-specialized first | A generalist giving mediocre advice is worse than none. Backend has clear best practices and heavy registry coverage. |
| P2-7 | Architecture tracks base branch only | One source of truth. Feature branches tracked as deltas. |
| P2-8 | Advisory hook (never blocks) | Developer autonomy. Auto-update on every push is wasteful for non-structural changes. |
| P2-9 | Session state in local JSON file | Conversation history can be compacted. Local JSON is deterministic and resumable. |
| P2-10 | `/backend-architect` not `/design-feature` | Honest about scope. Add siblings for other domains later. |
| P2-11 | Design skill in main conversation, not subagent | Interactive back-and-forth needs full conversation access. Can spawn subagents for teaching. |
| P2-12 | No MCQ quiz during design sessions | Design conversation itself tests understanding. Post-PR quiz planned for Phase 3. |
| P2-13 | Lightweight codebase scan when no architecture doc | Avoids dead-end "go run another command first." analyze-architecture remains valuable for persistence and reuse across sessions. |
