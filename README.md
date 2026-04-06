# claude-professor

**A Claude Code plugin that turns vibe coding into a personalized learning experience.**

claude-professor is a learning layer for AI-assisted development. It ensures you understand the concepts behind any code before it gets written — maintaining your skills and preventing knowledge atrophy while using AI coding tools.

## The Problem

Vibe coding — accepting AI-generated code without deeply understanding it — erodes your ability to reason about systems independently. You trade short-term velocity for long-term skill atrophy. The paradox: the better you are at coding, the more effectively you can use AI tools. But over time, vibe coding erodes the very skills that make it effective.

claude-professor solves this by embedding a teaching layer directly into your development workflow. Before you build, the professor makes sure you understand *why*, not just *what*.

## What It Does

### `/professor` — Learn Before You Build

When you invoke `/professor` with a task description, the plugin:

1. **Analyzes your task** — A dedicated knowledge agent (prompted as a solutions architect) identifies all relevant technical concepts, including foundational prerequisites and adjacent concerns that a keyword search would miss
2. **Checks your knowledge** — Looks up each concept in your personal skill profile, using FSRS (Free Spaced Repetition Scheduler) to determine what you know well, what's decaying, and what's new
3. **Teaches adaptively** — For concepts you know well: a one-liner acknowledgment. For decaying knowledge: a quick flashcard check. For new concepts: a full explanation with analogy, real-world example, and use case, followed by a recall question
4. **Quizzes you** — At the end of the session, a rapid-fire MCQ pop quiz on new and weak concepts to verify retention
5. **Produces a handoff document** — A structured markdown file with an expanded implementation prompt, probing instructions for downstream tools, and a summary of your understanding

### `/analyze-architecture` — Map Your Codebase

Scans your codebase and produces a high-level architecture graph stored as interlinked markdown files:

```
docs/professor/architecture/
├── _index.md                    # Component index + overview
├── components/
│   ├── auth-service.md          # Wiki-linked component files
│   ├── api-gateway.md
│   └── ...
├── data-flow.md                 # Mermaid diagrams
└── tech-stack.md                # Dependencies, versions
```

- Uses parallel subagents for data gathering (file scanner + dependency analyzer)
- Package manifests and config files are ground truth — never guesses tech stack
- Asks the developer when architecture is ambiguous
- Supports `--update` (refresh existing) and `--branch {name}` (delta from base)

### `/backend-architect` — Design With Teaching

Conducts a system design conversation for a new backend feature, grounded in your project's actual architecture:

1. **Loads context** — reads your architecture doc, or does a lightweight codebase scan if none exists
2. **Clarifies requirements** — one question at a time, multiple-choice preferred
3. **Analyzes architecture fit** — which components are affected, what constraints exist
4. **Proposes design options** — 2-3 approaches with tradeoffs, leads with recommendation
5. **Debates constructively** — challenges risky choices with specific failure scenarios, accepts sound reasoning
6. **Teaches lazily** — whenever a concept is central to a design decision, checks your knowledge and teaches if needed (via `/professor-teach` in a forked context)
7. **Writes a design document** — single HLD file to `docs/professor/designs/` suitable as input to planning tools

Supports `--continue` to resume interrupted sessions via session state.

## What It Is NOT

- **Not a pair programmer** — It doesn't write code or guide you through implementation
- **Not a code generator** — It never writes code. Ever.
- **Not a code reviewer** — It doesn't review existing code quality
- **Not a planner** — It doesn't plan implementation steps. It teaches concepts and produces handoffs/designs for your planning tool of choice

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

### From a Specific Branch

```bash
/plugin marketplace add theadityamittal/claude-professor@branch-name
/plugin install claude-professor
/reload-plugins
```

### Requirements

- Claude Code CLI
- Node.js (already required by Claude Code — no additional dependencies)

## Usage

### Teaching Flow

```
> /claude-professor:professor I want to add Redis caching to my API to handle 10k concurrent users
```

The professor will:
1. Spawn a knowledge agent to analyze the task and identify relevant concepts
2. Check your skill profile for each concept
3. Walk you through concepts you need to learn or review
4. Run a quick MCQ quiz at the end
5. Write a handoff document to `docs/professor/`

### Architecture Analysis

```
> /claude-professor:analyze-architecture
```

Produces a multi-file architecture graph in `docs/professor/architecture/`. Run once per project, refresh with `--update` after structural changes.

### System Design

```
> /claude-professor:backend-architect I want to add real-time notifications to my API
```

Interactive design conversation that:
- References your architecture doc (if available)
- Teaches concepts when it detects gaps
- Writes a design document with decisions, tradeoffs, and probing instructions

Resume an interrupted session:
```
> /claude-professor:backend-architect --continue
```

### Using the Handoff/Design Documents

Documents are written to `docs/professor/`:
- **Handoff docs** — from `/professor`, contain expanded implementation prompts and probing instructions
- **Design docs** — from `/backend-architect`, contain full HLD with architecture context, requirements, component changes, and Mermaid diagrams

Feed these into your preferred next step:
- **Superpowers brainstorming:** Reference the document as context for `/brainstorming`
- **Claude Code plan mode:** Point Claude at the document
- **Manual implementation:** Read it yourself as a spec

## Architecture

### Plugin Structure

```
claude-professor/
├── .claude-plugin/
│   ├── plugin.json               # Plugin manifest (v2.0.0)
│   └── marketplace.json          # Marketplace registry
├── skills/
│   ├── professor/
│   │   └── SKILL.md              # Core teaching flow
│   ├── professor-teach/
│   │   └── SKILL.md              # Single-concept teaching (forked context)
│   ├── analyze-architecture/
│   │   └── SKILL.md              # Codebase scanning → architecture graph
│   └── backend-architect/
│       └── SKILL.md              # Design conversation with teaching
├── agents/
│   └── knowledge-agent.md        # Solutions architect agent
├── scripts/
│   ├── fsrs.js                   # FSRS-5 algorithm module (pure math)
│   ├── utils.js                  # File I/O, markdown frontmatter, date math
│   ├── lookup.js                 # Search registry + get mastery status
│   ├── update.js                 # Write FSRS scores to profile
│   ├── session.js                # Design session state management
│   ├── graph.js                  # Architecture graph management
│   ├── detect-changes.js         # Structural change detection hook
│   ├── migrate-v2.js             # One-time JSON → markdown migration
│   └── test/                     # Automated tests (90 tests, node:test)
├── data/
│   ├── domains.json              # Fixed domain taxonomy (append-only)
│   ├── concepts_registry.json    # 150-200 starter concepts
│   └── preferred_sources.json    # Curated documentation URLs
├── config/
│   └── default_config.json       # Default settings
└── README.md
```

### Runtime Data (User's Machine)

```
~/.claude/professor/
├── config.json                   # User config (overrides defaults)
├── concepts/                     # Per-concept markdown files
│   ├── databases/
│   │   ├── connection_pooling.md
│   │   ├── cache_invalidation.md
│   │   └── ...
│   ├── backend/
│   │   ├── rest_api.md
│   │   └── ...
│   └── ...                       # Created as needed per domain
```

### Project Data

```
{project}/docs/professor/
├── architecture/                 # From /analyze-architecture
│   ├── _index.md
│   ├── components/
│   ├── data-flow.md
│   └── tech-stack.md
├── designs/                      # From /backend-architect
│   └── 2026-04-10-redis-caching.md
├── branch-deltas/                # From /analyze-architecture --branch
└── {handoff docs from /professor}
```

### Concept File Format

Concepts are stored as markdown files with JSON frontmatter:

```markdown
---json
{
  "concept_id": "connection_pooling",
  "domain": "databases",
  "is_registry_concept": true,
  "difficulty_tier": "intermediate",
  "first_encountered": "2026-04-01T14:30:00Z",
  "last_reviewed": "2026-04-05T10:15:00Z",
  "review_history": [
    {"date": "2026-04-01T14:30:00Z", "grade": 2},
    {"date": "2026-04-03T09:00:00Z", "grade": 3},
    {"date": "2026-04-05T10:15:00Z", "grade": 3}
  ],
  "fsrs_stability": 12.5,
  "fsrs_difficulty": 4.2,
  "documentation_url": "https://docs.sqlalchemy.org/en/20/core/pooling.html"
}
---

# Connection Pooling

Maintains a pool of reusable database connections instead of opening a new connection for each request.

## Notes
Learned in context of FastAPI async handlers.
```

Scripts read/write only the JSON frontmatter. The markdown body is human-readable context preserved verbatim during updates.

### Component Responsibilities

| Component | Does | Does NOT |
|-----------|------|----------|
| **Professor Skill** | Conducts teaching conversation, asks questions, runs MCQ quiz, writes handoff document | Do math, read/write files directly, identify concepts |
| **Knowledge Agent** | Analyzes task as solutions architect, identifies concepts, runs lookup scripts, produces briefing | Teach, interact with user, write handoff |
| **Backend Architect Skill** | Conducts design conversation, checks concepts lazily, delegates teaching, writes design doc | Write code, teach directly (delegates to professor-teach) |
| **Analyze Architecture Skill** | Scans codebase via subagents, writes component files, generates index and diagrams | Teach, interact beyond clarifying questions |
| **Professor Teach Skill** | Teaches a single concept in forked context, returns grade + summary to caller | Run full teaching sessions, interact beyond one concept |
| **Scripts** | FSRS computation, file I/O, concept search, score updates, session state, graph management | Any reasoning, any teaching, any user interaction |

## Key Design Decisions

### Why FSRS Over Simple Counters

FSRS (Free Spaced Repetition Scheduler) is a spaced repetition algorithm that determines optimal review intervals. When you learn a concept, FSRS calculates when you're likely to forget it. If you review at the right moment, the memory strengthens and the next interval gets longer. If you struggle, the interval shortens.

### Why Markdown with JSON Frontmatter

LLMs read markdown natively and perform better with it than raw JSON arrays. FSRS data lives in JSON frontmatter (parsed deterministically by scripts via `JSON.parse()`), while the human-readable body provides context. Individual files per concept enable granular updates without loading entire domains.

### Why Lazy Concept Checking in Design Sessions

Concepts emerge during design conversation — they can't all be identified upfront. A batch analysis over-identifies (teaches irrelevant concepts) and under-identifies (misses concepts that emerge from specific design choices). Checking lazily when a concept is central to a design decision ensures teaching is relevant and timely.

### Why a Knowledge Agent Instead of Keyword Matching

A prompt like "make my API handle 10k concurrent users" doesn't contain the words "connection pooling", "cache invalidation", or "horizontal scaling." But a solutions architect hearing this prompt would immediately think of all three.

### Why Node.js Scripts Instead of LLM Math

LLMs are non-deterministic. FSRS stability computations (exponential decay, difficulty adjustments) must be deterministic: same inputs, same outputs, every time. Claude Code already requires Node.js, so there are zero additional dependencies.

### Why Backend-Specialized First

A generalist giving mediocre frontend advice is worse than no advice. The backend domain has clear best practices and heavy registry coverage (91 concepts in relevant domains). Other domains (frontend, mobile) are added as separate architect skills later.

## Configuration

User config at `~/.claude/professor/config.json` (created on first run with defaults):

```json
{
  "web_search_enabled": false,
  "preferred_sources": [],
  "handoff_directory": "docs/professor/",
  "profile_directory": "~/.claude/professor/concepts/"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `web_search_enabled` | boolean | `false` | Whether the professor can search the web during teaching. |
| `preferred_sources` | string[] | `[]` | Documentation domains to prefer when searching. |
| `handoff_directory` | string | `"docs/professor/"` | Project-relative path for handoff and design documents. |
| `profile_directory` | string | `"~/.claude/professor/concepts/"` | Where your learning profile is stored. |

## Migration from v1

If you have existing Phase 1 profile data (JSON arrays in `~/.claude/professor/profile/`):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate-v2.js \
  --source ~/.claude/professor/profile/ \
  --target ~/.claude/professor/concepts/
```

The migration is idempotent — running twice doesn't create duplicates. The old `profile/` directory is preserved (not deleted automatically).

## Roadmap

### Phase 1 (Complete)
- Core teaching flow with FSRS-based adaptive learning
- Knowledge agent for intelligent concept discovery
- Node.js scripts for deterministic computation
- Local JSON profile storage with per-domain files
- Concept registry with 150-200 starter concepts
- Handoff document generation

### Phase 2 (Current)
- Storage migration: JSON arrays → markdown with JSON frontmatter
- Architecture analysis (`/analyze-architecture`) with multi-file graph output
- Backend system design (`/backend-architect`) with lazy concept checking
- Single-concept teaching (`/professor-teach`) in forked context
- Session state management for design conversations
- Structural change detection hook (advisory)
- One-time migration script for v1 profiles

### Phase 3 (Planned)
- Post-PR quiz hook (test retention after implementation)
- Implicit scoring from design decisions
- Web search for concept freshness verification
- Frontend architect skill
- Learning analytics and progress visualization

## Contributing

Contributions are welcome, especially to the concept registry.

### Adding Concepts to the Registry

1. Fork the repo
2. Add entries to `data/concepts_registry.json` following the existing format
3. Assign each concept to a domain from `data/domains.json`
4. Use `lowercase_snake_case`, max 3 words for concept IDs
5. Set an appropriate difficulty level: `foundational`, `intermediate`, or `advanced`
6. Submit a PR

### Adding Domains

New domains can only be added (never renamed or removed). If you think a domain is missing:

1. Open an issue explaining the use case
2. If approved, add the domain to `data/domains.json` with `"parent": null` (or an existing parent if it's a specialization)

### Improving Teaching Logic

The professor's teaching behavior is defined in `skills/professor/SKILL.md`. The design conversation flow is in `skills/backend-architect/SKILL.md`. Improvements to explanation quality, question design, or flow are welcome as PRs.

## License

MIT
