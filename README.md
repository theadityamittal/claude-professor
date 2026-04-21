# claude-professor

**A Claude Code plugin that turns vibe coding into a personalized learning experience.**

claude-professor is a learning layer for AI-assisted development. It ensures you understand the concepts behind any code before it gets written — maintaining your skills and preventing knowledge atrophy while using AI coding tools.

## The Problem

Vibe coding — accepting AI-generated code without deeply understanding it — erodes your ability to reason about systems independently. You trade short-term velocity for long-term skill atrophy. The paradox: the better you are at coding, the more effectively you can use AI tools. But over time, vibe coding erodes the very skills that make it effective.

claude-professor solves this by embedding a teaching layer directly into your development workflow. Before you build, the professor makes sure you understand *why*, not just *what*.

## What It Does

### `/whiteboard` — Design With Teaching

The primary entry point. Conducts a domain-agnostic design conversation for any feature or system, teaching concepts as they arise:

1. **Phase 0 — Init / Resume** — `whiteboard.js init-session` (new) or `resume-session` (continue). v5 session schema.
2. **Phase 1 — Requirements (Concerns)** — picks 5-8 concerns from `data/concerns.json` (19 research-backed concerns), iterates them one-by-one via `next-concern`; the matcher resolves concepts per concern and the professor teaches them **inline** before each concern is discussed.
3. **Phase 2 — High-Level Design (HLD)** — registers components, iterates them via `next-component`; teaches the L1 concepts central to each component decision before discussion.
4. **Phase 3 — Low-Level Design (LLD)** — optional; creates L2 implementation concepts dynamically under registry L1 parents.
5. **Phase 4 — Deliverable** — `export-design-doc` writes the design to `docs/professor/designs/`, `finish` closes the session.

The JIT iterator in `scripts/whiteboard.js` **structurally enforces** the "teach before discuss" contract: `next-concern` / `next-component` return the unit and the concepts that must be taught before discussion. `gate.js checkpoint` runs post-hoc as an audit (2-outcome: `passed` / `blocked`).

Supports `init-session --force-new` to discard v4 sessions that cannot be auto-migrated.

### `/analyze-architecture` — Map Your Codebase

Scans your codebase and produces a high-level architecture graph:

```
docs/professor/architecture/
├── _index.md                    # Component index + overview
├── components/
│   ├── auth-service.md          # Wiki-linked component files
│   └── ...
├── data-flow.md                 # Mermaid diagrams
├── tech-stack.md                # Dependencies, versions
└── concept-scope.json           # Detected domains + tech stack
```

Supports `--update` (refresh) and `--branch {name}` (delta from base).

### `/professor-teach` — Single Concept Teaching

Teaches a single concept inline in the whiteboard conversation (the user sees the teaching directly — it is never dispatched as a background subagent). Structured output contract:

1. **Analogy** (~100 words) — concrete, visual everyday comparison; always synthetic
2. **Real-world production example** (~150 words) — grounded in a web search anchor snippet if available, otherwise from training data
3. **Task connection** (~100 words) — tied to what you're building; references same anchor snippet for coherence
4. **Recall question** — application, not definition; grounded in same anchor scenario

Action (`taught` / `reviewed` / `skipped`) is determined by FSRS status from `lookup.js concept-state`. Writes notes into the concept's `## Teaching Guide` section.

**Web search integration (v5.1):** The whiteboard skill prefetches one search result per concern at `phase-start` and passes it to professor-teach via `--search-results`. Professor-teach selects a single anchor snippet (concept-match then task-context domain as tiebreaker) and threads it through the real-world example, task connection, and recall question blocks. On degradation (empty, malformed, or timed-out results), an inline signal appears at the top of teaching output with the specific failure reason and search query — teaching always continues from training data.

## What It Is NOT

- **Not a pair programmer** — It doesn't write code or guide you through implementation
- **Not a code generator** — It never writes code. Ever.
- **Not a code reviewer** — It doesn't review existing code quality
- **Not a planner** — It produces designs for your planning tool of choice

## Installation

### From GitHub (Recommended)

```bash
# Add the marketplace (one-time)
/plugin marketplace add theadityamittal/claude-professor

# Install the plugin
/plugin install claude-professor

# Reload
/reload-plugins
```

### Requirements

- Claude Code CLI
- Node.js (already required by Claude Code — no additional dependencies)

### Known Limitation: Opus 4.7 (1M context) sessions

If your Claude Code session is running on **Opus 4.7 with 1M context**, invoking `/whiteboard` or `/analyze-architecture` will fail with:

```
API Error: Extra usage is required for 1M context · run /extra-usage to enable,
or /model to switch to standard context
```

This is an upstream Claude Code behavior, not a plugin issue. When a session is bound to a 1M-context model, **every skill invocation inherits that window**, and skill frontmatter cannot downgrade it (see [anthropics/claude-code#45847](https://github.com/anthropics/claude-code/issues/45847), [#45390](https://github.com/anthropics/claude-code/issues/45390)).

**Workaround:** before invoking either skill, do one of:
- `/model` → switch to a standard-context model (e.g. Sonnet 4.6), or
- `/extra-usage` → opt in to extra-usage billing for the session

On Max/Team/Enterprise plans the 1M context is bundled and the billing gate firing is a documented Anthropic bug — if affected, report it via the linked issues.

## Usage

### Design Conversation

```
> /claude-professor:whiteboard I want to add real-time notifications with WebSocket support
```

The whiteboard will:
1. Initialize a v5 session and load your architecture context
2. Select 5-8 relevant concerns from the research-backed catalog
3. Iterate concerns one at a time, teaching L1 concepts **inline** before each discussion
4. Register components; iterate them, teaching concepts central to each decision
5. Optionally dive into LLD and create L2 concepts dynamically
6. Export a design document and run the post-hoc gate audit

Resume an interrupted session:
```
> /claude-professor:whiteboard --continue
```

### Architecture Analysis

```
> /claude-professor:analyze-architecture
```

Produces a multi-file architecture graph in `docs/professor/architecture/`. Run once per project, refresh with `--update`.

## Architecture

### Plugin Structure

```
claude-professor/
├── .claude-plugin/
│   ├── plugin.json               # Plugin manifest (v5.0.0)
│   └── marketplace.json          # Marketplace registry
├── skills/
│   ├── whiteboard/               # Primary design conversation skill
│   │   ├── SKILL.md              # Thin narrator over whiteboard.js (4-phase flow)
│   │   └── templates/
│   │       └── design-doc.md     # Design document template (v5 schema)
│   ├── professor-teach/
│   │   └── SKILL.md              # Inline single-concept teaching
│   └── analyze-architecture/
│       └── SKILL.md              # Codebase scanning
├── agents/
│   └── concept-matcher.md        # Haiku two-stage retrieve-rerank subagent
├── scripts/
│   ├── whiteboard.js             # JIT iterator + phase orchestration (15 subcommands)
│   ├── fsrs.js                   # FSRS-5 algorithm (pure math)
│   ├── utils.js                  # File I/O, markdown frontmatter, envelope helpers
│   ├── gate.js                   # Post-hoc 2-outcome checkpoint audit
│   ├── lookup.js                 # Read queries + record-l2-decision
│   ├── update.js                 # Registry-validated concept writes
│   ├── session.js                # v5 session lifecycle (create/load/update/add-concept/finish)
│   ├── graph.js                  # Architecture graph management
│   ├── detect-changes.js         # Structural change detection hook
│   ├── validate-concerns.js      # Catalog invariant checker
│   ├── migrate-v5.js             # v4 → v5 profile migration
│   └── migrate-v{2,3,4}.js       # Legacy migrations
├── tests/
│   ├── contract/                 # Per-command contract tests (210+)
│   ├── integration/              # End-to-end shell chains (13 scripts)
│   ├── fixtures/                 # Matcher regression + migration fixtures
│   └── data/
├── data/
│   ├── domains/                  # 18 domain markdown files
│   ├── domains.json              # Domain ID list
│   ├── concepts_registry.json    # 407 L1 seed concepts
│   ├── concerns.json             # 19 research-backed concerns (w/ mapped_seeds)
│   ├── concerns-mapping-notes.md # Rationale for concern ↔ seed mappings
│   └── preferred_sources.json    # Curated documentation URLs
├── config/
│   └── default_config.json       # Default settings
└── README.md
```

### `whiteboard.js` Subcommands

`scripts/whiteboard.js` is the JIT iterator. 15 subcommands drive the 4-phase flow:

| # | Subcommand | When |
|---|------------|------|
| 1 | `init-session` | Phase 0 (new session) — accepts `--force-new` to discard v4 sessions |
| 2 | `resume-session` | Phase 0 (continuing) |
| 3 | `phase-start` | Start of every phase |
| 4 | `register-selection` | Phase 1.3 — persist selected concerns |
| 5 | `register-components` | Phase 2.4 / 3.4 — persist component list |
| 6 | `next-concern` | Phase 1 JIT loop — returns unit + concepts to teach first |
| 7 | `next-component` | Phase 2 / 3 JIT loop — returns unit + concepts to teach first |
| 8 | `record-concept` | After every professor-teach invocation |
| 9 | `record-discussion` | After each unit's discussion (1-2 sentences of substance) |
| 10 | `mark-concern-done` | End of each concern |
| 11 | `mark-component-done` | End of each component |
| 12 | `mark-skipped` | Remediation / user "skip" |
| 13 | `phase-complete` | After `gate.js checkpoint` returns `passed` |
| 14 | `export-design-doc` | Phase 4 — writes to `docs/professor/designs/` |
| 15 | `finish` | Phase 4 — closes session and archives log |

`gate.js checkpoint` runs post-hoc (2-outcome: `passed` / `blocked`).
`lookup.js` adds: `session-exists`, `concept-state`, `list-l2-universe`, `find-l2-children`, `record-l2-decision`.

### Breaking Changes From v4 — Removed Flags

The following v4 flags are **no longer accepted**. Callers that pass them will error with a blocking envelope.

| Removed | Replacement |
|---------|-------------|
| `update.js --add-alias` | Aliases dropped; no replacement needed |
| `update.js --notes` | Teaching notes now write to the `## Teaching Guide` section by `update.js` itself |
| `lookup.js reconcile --mode alias` | Alias reconciliation removed |
| `gate.js --force-proceed` | Gate is a post-hoc audit; bypass no longer meaningful |
| `gate.js schedule` | Scheduling moved into `whiteboard.js register-*` |

Also removed:

- `circuit_breaker` and `degraded` outcomes from `gate.js checkpoint` (now 2-outcome: `passed` / `blocked`)
- Frontmatter fields: `aliases`, `related_concepts`, `scope_note`, `documentation_url`
- Body sections: `## Notes` and `## Key Points` (content consolidated into `## Teaching Guide`)

### Script Output Contract

All scripts use a unified envelope for CLI output:

```json
// Success
{"status": "ok", "data": { ... }}

// Error
{"status": "error", "error": {"level": "fatal|blocking|warning", "message": "..."}}
```

`data` and `error` are mutually exclusive. Error levels: **fatal** (exit 1, session corrupt), **blocking** (exit 2, invalid args / audit failed), **warning** (exit 0, degraded but proceed). Exported functions return raw data — the envelope is CLI boundary only.

### Concept-Matcher (v5)

`agents/concept-matcher.md` replaces `agents/concept-agent.md`. It is a **haiku-based two-stage retrieve-rerank** subagent:

- **Stage 1 — Retrieve:** given a concern or component description, returns the top-K candidate concepts from a thin universe (IDs + one-line scope only). Cheap, high-recall.
- **Stage 2 — Rerank:** given the top-K plus full metadata, makes the final decision (match / no_match / propose_l2).

The matcher is the chokepoint for L2 creation: a novel L2 must go through `lookup.js record-l2-decision` before `update.js` will create it. This prevents duplicate orphan L2s.

### Concerns Catalog

`data/concerns.json` ships with **19 research-backed concerns** covering the span of architectural worries in a typical design conversation. Every L1 seed concept (407 total) is either mapped to a concern (291 mapped) or explicitly declared an orphan (116 orphans), with each L1 mapped to at most 4 concerns. Sources: ISO/IEC 25010, AWS Well-Architected, Kleppmann DDIA, Google SRE, OWASP, 12-Factor App.

Invariants enforced by `scripts/validate-concerns.js`:

- Every registry L1 appears in either some concern's `mapped_seeds` or in `orphan_l1s` (disjoint).
- Each L1 is mapped to at most 4 concerns.

### Registry-Driven L1 / L2 Hierarchy

Hard rule: **in `data/concepts_registry.json` → L1, else → L2**. Levels are looked up, not LLM-inferred.

- **L1 (Seed)** — 407 architectural concepts shipped with the plugin. "A concept you'd draw as a box on a whiteboard." Append-only via plugin updates.
- **L2 (Dynamic)** — Implementation concepts created during LLD sessions. Each has an explicit `--parent-concept <L1_id>` that must exist in the registry.

`update.js` on a non-registry concept **requires** `--parent-concept`. Caller-supplied `--level` / `--is-seed-concept` for registry concepts are ignored (warning to stderr).

### FSRS-Driven Concept Status

Status is **computed at resolution time via `lookup.js concept-state`**, never stored:

| Status | Derivation | Action |
|--------|------------|--------|
| `new` | No user profile file | Professor-teach creates file + teaches |
| `encountered_via_child` | File exists, `review_history` empty | Professor-teach teaches (first teach) |
| `teach_new` | File exists, R < 0.3 | Professor-teach re-teaches |
| `review` | File exists, 0.3 ≤ R ≤ 0.7 | Professor-teach reviews |
| `skip` | File exists, R > 0.7 | No teaching needed |

### Concept File Format (v5)

```markdown
---json
{
  "concept_id": "chunking_strategy",
  "domain": "machine_learning",
  "schema_version": 5,
  "operation_nonce": null,
  "level": 2,
  "parent_concept": "retrieval_augmented_gen",
  "is_seed_concept": false,
  "difficulty_tier": "intermediate",
  "first_encountered": "2026-04-10T14:30:00Z",
  "last_reviewed": "2026-04-10T15:00:00Z",
  "review_history": [
    {"date": "2026-04-10T15:00:00Z", "grade": 3}
  ],
  "fsrs_stability": 2.3,
  "fsrs_difficulty": 6.4
}
---

# Chunking Strategy

## Description
Strategies for splitting documents into chunks for retrieval.

## Teaching Guide
Learned in context of document Q&A design.
Reviewed in context of RAG pipeline optimization. Recall improved on overlap strategy. Grade: 4.
```

## Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| JIT iterator in `whiteboard.js` | Structural enforcement of "teach before discuss" — the only way to advance is through `next-*`. |
| Inline professor-teach | User must see the teaching. Background subagent dispatch hides the lesson. |
| Post-hoc gate audit | 2-outcome `passed` / `blocked` verifies coverage; does not block progress mid-conversation. |
| Research-backed concerns catalog | Replaces ad-hoc concern brainstorming with 19 concerns grounded in ISO 25010, AWS Well-Architected, DDIA, Google SRE, OWASP, 12-Factor. |
| Two-stage haiku matcher | Stage 1 retrieves cheaply from a thin universe; Stage 2 reranks with full metadata. Haiku-grade cost, high precision. |
| Registry-driven levels | L1 vs L2 is looked up, not inferred. Eliminates a large class of LLM errors. |
| `record-l2-decision` chokepoint | Novel L2s must go through an idempotency barrier before `update.js` will create them. |
| FSRS-5 spaced repetition | Scientifically-backed review scheduling. Deterministic math in Node.js. |
| Markdown with JSON frontmatter | LLMs read markdown natively. JSON frontmatter for deterministic script parsing. |
| Three-tier error envelope | Plugin has stateful learning tracking — silent failures mean data loss, not just degraded output. |
| Per-concern web search prefetch | One search fired per concern at `phase-start`, shared across all concepts in that concern. Cost scales with concern count (5-8/session), not concept count. Freshness is the value — no caching. |
| One-anchor model for search injection | A single best snippet (concept-match first, task-context domain as tiebreaker) is threaded through real-world example, task connection, and recall question. Analogy is always synthetic. Coherence across blocks over variety. |
| Graceful degradation, never abort | On empty, malformed, or parse-failed search results: emit an inline signal at the top of teaching output (specific failure + query), then teach from training data. Teaching is never withheld due to search failure. |

## Migrating from v4

### User profile migration

`scripts/migrate-v5.js` operates against `~/.claude/professor/concepts/`. It:

- Drops deprecated frontmatter fields: `aliases`, `related_concepts`, `scope_note`, `documentation_url`.
- Consolidates `## Notes` and `## Key Points` content into a single `## Teaching Guide` section.
- Preserves `## Description` and all FSRS state.
- Sets `schema_version: 5`.
- Is **idempotent** — safe to re-run.

**Strongly recommended:** back up your profile directory first.

```bash
# Back up
cp -R ~/.claude/professor/concepts ~/claude-professor-backup-$(date +%Y%m%d)

# Preview
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts --dry-run

# Apply
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts
```

### Active v4 sessions

v4 sessions cannot be auto-migrated — the v5 session schema is too different. Discard the old session and start fresh:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/whiteboard.js init-session \
  --task "<your task>" \
  --session-dir docs/professor/ \
  --force-new
```

### From v3.x or earlier

Run earlier migrations in order, then v5:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v2.js --source ~/.claude/professor/profile/ --target ~/.claude/professor/concepts/
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v3.js --profile-dir ~/.claude/professor/concepts/
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v5.js --profile-dir ~/.claude/professor/concepts/
```

## Configuration

User config at `~/.claude/professor/config.json`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `web_search_enabled` | boolean | `false` | Whether the professor can search the web during teaching |
| `preferred_sources` | string[] | `[]` | Documentation domains to prefer |
| `handoff_directory` | string | `"docs/professor/"` | Project-relative path for design documents |
| `profile_directory` | string | `"~/.claude/professor/concepts/"` | Where your learning profile is stored |

## Testing

210+ contract tests (one per command + schema) plus 13 end-to-end integration scripts:

```bash
# Contract tests (Node test runner)
node --test tests/contract/

# Integration chain tests (bash + jq)
for f in tests/integration/*.sh; do bash "$f"; done

# Matcher regression (requires CLAUDE_CLI_BIN)
CLAUDE_CLI_BIN=$(which claude) bash tests/integration/test-matcher-regression.sh
```

Migration is covered by 6 fixture pairs under `tests/fixtures/profiles-v4/` and `tests/fixtures/profiles-v5-expected/` with diff-based assertions.

## Contributing

Contributions welcome, especially to the seed concept registry and concerns catalog.

### Adding Concepts

1. Fork the repo
2. Add entries to `data/concepts_registry.json` (concept_id, domain, difficulty_tier, level, parent_concept, is_seed_concept)
3. Assign to one of the 18 domains. Dedup principle: concept lives in the domain where the design decision is made.
4. Either add the new L1 to a concern's `mapped_seeds` in `data/concerns.json` or add it to `orphan_l1s` with a reason.
5. Run `node scripts/validate-concerns.js` to confirm invariants hold.
6. Use `lowercase_snake_case`, max 3 words for concept IDs.
7. Submit a PR.

### Adding Domains

Domains are append-only. Open an issue to discuss before adding. New domains must be permanent SWE knowledge categories backed by academic/industry consensus.

## License

MIT
