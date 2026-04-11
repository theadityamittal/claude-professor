# claude-professor

**A Claude Code plugin that turns vibe coding into a personalized learning experience.**

claude-professor is a learning layer for AI-assisted development. It ensures you understand the concepts behind any code before it gets written — maintaining your skills and preventing knowledge atrophy while using AI coding tools.

## The Problem

Vibe coding — accepting AI-generated code without deeply understanding it — erodes your ability to reason about systems independently. You trade short-term velocity for long-term skill atrophy. The paradox: the better you are at coding, the more effectively you can use AI tools. But over time, vibe coding erodes the very skills that make it effective.

claude-professor solves this by embedding a teaching layer directly into your development workflow. Before you build, the professor makes sure you understand *why*, not just *what*.

## What It Does

### `/whiteboard` — Design With Teaching

The primary entry point. Conducts a domain-agnostic design conversation for any feature or system, teaching concepts as they arise:

1. **Loads context** — reads your architecture doc and project domain scope, or does a lightweight codebase scan
2. **Clarifies requirements** — filters 12-15 architectural concerns to the 5-8 relevant to your task, infers constraints from existing architecture
3. **Schedules concept checks** — spawns concept-agent to resolve L1 concepts against the 407-concept seed registry + your profile, stores a teaching schedule via gate.js
4. **Enforces checkpoints** — gate.js verifies scheduled concepts are taught before discussion proceeds at each phase boundary
5. **Teaches lazily** — when a concept is central to a design decision, spawns professor-teach to teach or review it before building on it
6. **Proposes HLD** — 2-3 design options with tradeoffs, debates counter-proposals with escalating critique
7. **Dives into LLD** (optional) — implementation details where L2 concepts arise and get created dynamically
8. **Writes a design document** — structured HLD/LLD to `docs/professor/designs/`
9. **Verifies session** — `finish` checks for untaught concepts, unresolved checkpoints, degraded gates, and open circuit breakers

Supports `--continue` to resume interrupted sessions.

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

Teaches a single concept in a forked context. Used by `/whiteboard` internally, but also available standalone. Structured output contract:

1. **Analogy** (~100 words) — concrete, visual everyday comparison
2. **Real-world production example** (~150 words) — how it's used at scale
3. **Task connection** (~100 words) — tied to what you're building
4. **Recall question** — application, not definition

On re-encounter, reads prior teaching notes and adapts: different analogy, targets weaknesses, acknowledges progress.

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

## Usage

### Design Conversation

```
> /claude-professor:whiteboard I want to add real-time notifications with WebSocket support
```

The whiteboard will:
1. Load your architecture context and identify relevant domains
2. Present filtered requirements with architecture-inferred constraints
3. Schedule concept checks via gate.js and resolve against your FSRS profile
4. Teach weak/new concepts at phase checkpoints before building on them
5. Propose 2-3 design options, debate tradeoffs
6. Write a design document to `docs/professor/designs/`
7. Verify session health and report any gaps via `finish`

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
│   ├── plugin.json               # Plugin manifest (v4.0.0)
│   └── marketplace.json          # Marketplace registry
├── skills/
│   ├── whiteboard/               # Primary design conversation skill
│   │   ├── SKILL.md              # Orchestrator (5-phase flow with gate.js checkpoints)
│   │   ├── templates/
│   │   │   └── design-doc.md     # Design document template
│   │   └── protocols/
│   │       ├── critique.md       # Critique escalation protocol
│   │       └── concept-check.md  # Concept identification protocol
│   ├── professor-teach/
│   │   └── SKILL.md              # Single-concept teaching (structured output contract)
│   └── analyze-architecture/
│       └── SKILL.md              # Codebase scanning
├── agents/
│   └── concept-agent.md          # Concept resolution + L2 creation
├── scripts/
│   ├── fsrs.js                   # FSRS-5 algorithm (pure math)
│   ├── utils.js                  # File I/O, markdown frontmatter, envelope helpers
│   ├── gate.js                   # Teaching schedule, checkpoint enforcement, session logging
│   ├── lookup.js                 # Search, status, list-concepts, reconcile
│   ├── update.js                 # Write scores (with nonce idempotency), create concepts, add aliases
│   ├── session.js                # Session lifecycle (create, load, update, add-concept, finish, clear)
│   ├── graph.js                  # Architecture graph management
│   ├── detect-changes.js         # Structural change detection hook
│   ├── migrate-v4.js             # v3 → v4 concept file migration
│   └── migrate-v3.js             # v2 → v3 migration (legacy)
├── tests/
│   ├── unit/                     # Function-level tests (envelope, gate, finish, nonce, migrate)
│   ├── contract/                 # CLI envelope conformance (1 per script)
│   ├── integration/              # Script-to-script chain tests
│   ├── data/
│   │   └── registry-v3.json      # Fixture registry for integration tests
│   └── cli/
│       ├── test-whiteboard.sh        # CLI integration test
│       └── test-analyze-architecture.sh  # Pipeline + scan integration test
├── data/
│   ├── domains/                  # 18 domain markdown files with boundaries
│   ├── domains.json              # Domain ID list (for script lookups)
│   ├── concepts_registry.json    # 407 L1 seed concepts
│   └── preferred_sources.json    # Curated documentation URLs
├── config/
│   └── default_config.json       # Default settings
└── README.md
```

### Script Output Contract

All scripts use a unified envelope for CLI output (v4.0.0):

```json
// Success
{"status": "ok", "data": { ... }}

// Error
{"status": "error", "error": {"level": "fatal|blocking|warning", "message": "..."}}
```

`data` and `error` are mutually exclusive. Error levels: **fatal** (session corrupt, stop), **blocking** (checkpoint failed, missing args), **warning** (subagent failed, degraded mode). Exported functions return raw data — the envelope is CLI boundary only.

### Gate.js — Teaching Schedule Enforcement

The core enforcement mechanism for v4. Replaces prompt-level concept checking (60% compliance in v3.2.0) with structural per-step gates:

| Subcommand | Purpose |
|------------|---------|
| `schedule` | Store concept assignments with `phase{m}_checkpoint{n}` step keys |
| `checkpoint` | Verify assigned concepts are taught before proceeding (passed/blocked/degraded) |
| `log` | Append JSONL entry to `.session-log.jsonl` (crash-safe, append-only) |
| `status` | Read-only view of schedule, checkpoint history, circuit breaker state |

### Idempotency Nonce

`update.js --nonce {session_id}-{concept_id}` prevents double-grading on retry. The nonce propagates through 4 hops:

```
session.js create (generates session_id)
  → skill reads session_id from state
    → professor-teach receives --session-id
      → professor-teach passes --nonce to update.js
```

### 18 Domains

Research-backed from SWEBOK v4, ACM CS2023, DDIA, and university curricula:

| Domain | Display Name | L1 Concepts |
|--------|-------------|-------------|
| `algorithms_data_structures` | Algorithms & Data Structures | 29 |
| `architecture` | Software Architecture & Design | 27 |
| `distributed_systems` | Distributed Systems | 26 |
| `databases` | Data Storage & Management | 28 |
| `operating_systems` | Operating Systems | 19 |
| `networking` | Computer Networks | 16 |
| `security` | Security & Cryptography | 28 |
| `testing` | Software Testing & QA | 23 |
| `concurrency` | Concurrency & Parallelism | 23 |
| `machine_learning` | AI & Machine Learning | 30 |
| `programming_languages` | Programming Languages & Type Systems | 22 |
| `api_design` | API Design & Integration | 21 |
| `reliability_observability` | Reliability & Observability | 24 |
| `performance_scalability` | Performance & Scalability | 15 |
| `data_processing` | Data Processing & Pipelines | 19 |
| `devops_infrastructure` | DevOps & Infrastructure | 26 |
| `frontend` | Frontend Engineering | 18 |
| `software_construction` | Software Construction | 13 |

Each domain is a markdown file in `data/domains/` with boundary definitions that tell the concept-agent where domain edges are.

### Two-Level Concept Hierarchy

- **L1 (Seed)** — 407 architectural concepts shipped with the plugin. "A concept you'd draw as a box on a whiteboard." Append-only via plugin updates.
- **L2 (Dynamic)** — Implementation concepts created by the concept-agent during LLD sessions. Each has a parent L1. Grows organically per user.

### FSRS-Driven Concept Status

Status is **computed at resolution time**, never stored:

| Status | Derivation | Action |
|--------|------------|--------|
| `new` | No user profile file | Professor-teach creates file + teaches |
| `encountered_via_child` | File exists, `review_history` empty | Professor-teach teaches (first teach) |
| `teach_new` | File exists, R < 0.3 | Professor-teach re-teaches |
| `review` | File exists, 0.3 ≤ R ≤ 0.7 | Professor-teach reviews |
| `skip` | File exists, R > 0.7 | No teaching needed |

### Concept File Format (v4)

```markdown
---json
{
  "concept_id": "chunking_strategy",
  "domain": "machine_learning",
  "schema_version": 4,
  "operation_nonce": null,
  "level": 2,
  "parent_concept": "retrieval_augmented_gen",
  "is_seed_concept": false,
  "difficulty_tier": "intermediate",
  "aliases": ["document_chunking", "text_chunking"],
  "related_concepts": ["tokenization"],
  "scope_note": "Strategies for splitting documents into chunks for retrieval.",
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

## Key Points
- Chunk size vs. retrieval precision tradeoff
- Overlap preserves context at boundaries

## Notes
Learned in context of document Q&A design.
Reviewed in context of RAG pipeline optimization. Recall improved on overlap strategy. Grade: 4.
```

## Key Design Decisions

| Decision | Reasoning |
|----------|-----------|
| FSRS-5 spaced repetition | Scientifically-backed review scheduling. Deterministic math in Node.js. |
| Markdown with JSON frontmatter | LLMs read markdown natively. JSON frontmatter for deterministic script parsing. |
| Lazy teaching during design | Concepts emerge in context. Batch analysis over-teaches irrelevant concepts. |
| Two-level hierarchy | L1 maps to HLD, L2 to LLD. Conversation flow guarantees prerequisites. |
| Domain-agnostic whiteboard | One skill covers all 18 SWE domains instead of per-domain specialists. |
| Three-tier error envelope | Plugin has stateful learning tracking — silent failures mean data loss, not just degraded output. |
| Teaching schedule + checkpoints | Structural enforcement via gate.js. Prompt-level instructions had 60% compliance. |
| Skill-driven execute phase | LLM conversation cannot be directed by FSM; skills call gate.js at boundaries. |
| Idempotency nonce | Prevents double-grading on retry. Format: `{session_id}-{concept_id}`. |
| Lazy incremental migration | v4 reads v3 files with defaults. No mandatory migration at install. |

## Migration

### From v3.x to v4.0.0

v3 profiles work immediately on v4 install — no mandatory migration. Files upgrade lazily on first `update.js` write.

Optional batch migration:
```bash
# Preview changes
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/ --dry-run

# Apply migration
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v4.js --profile-dir ~/.claude/professor/concepts/
```

Rollback: revert to v3.x — unknown frontmatter fields (`schema_version`, `operation_nonce`) are ignored. Markdown body notes preserved. No data loss.

### From v2.x to v3.x

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v3.js --profile-dir ~/.claude/professor/concepts/
```

Handles domain renames, merges, backend concept redistribution, and field enrichment. Idempotent.

### From v1.x

Run v2 migration first, then v3:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v2.js --source ~/.claude/professor/profile/ --target ~/.claude/professor/concepts/
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v3.js --profile-dir ~/.claude/professor/concepts/
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

### Three-Tier Test Pyramid

```bash
# Unit tests (envelope, gate, finish, nonce, migrate)
node --test tests/unit/*.js

# Contract tests (CLI envelope conformance, 1 per script)
node --test tests/contract/*.js

# Integration chain tests (schedule lifecycle, nonce idempotency, full lifecycle)
node --test tests/integration/*.js

# All Node.js tests at once
node --test tests/unit/*.js tests/contract/*.js tests/integration/*.js

# Legacy CLI integration tests
bash tests/cli/test-whiteboard.sh
bash tests/cli/test-analyze-architecture.sh
```

55 Node.js tests + 10 CLI tests covering: FSRS math, envelope conformance, gate.js lifecycle, session finish warnings, nonce idempotency, migration, concept lookup, architecture scanning, and full session chains.

## Contributing

Contributions welcome, especially to the seed concept registry.

### Adding Concepts

1. Fork the repo
2. Add entries to `data/concepts_registry.json` following the format (concept_id, domain, difficulty_tier, level, parent_concept, is_seed_concept, aliases, related_concepts, scope_note)
3. Assign to one of the 18 domains. Dedup principle: concept lives in the domain where the design decision is made.
4. Use `lowercase_snake_case`, max 3 words for concept IDs
5. Submit a PR

### Adding Domains

Domains are append-only. Open an issue to discuss before adding. New domains must be permanent SWE knowledge categories backed by academic/industry consensus.

## Deprecated Skills

These skills from Phase 1/2 are superseded by `/whiteboard`:
- `/professor` — batch upfront teaching (replaced by lazy teaching in `/whiteboard`)
- `/backend-architect` — backend-only design conversation (replaced by domain-agnostic `/whiteboard`)

The `knowledge-agent` is replaced by `concept-agent`.

These deprecated skills are not compatible with v4 envelope format.

## License

MIT
