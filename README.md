# claude-professor

**A Claude Code plugin that turns vibe coding into a personalized learning experience.**

claude-professor is a learning layer for AI-assisted development. It ensures you understand the concepts behind any code before it gets written — maintaining your skills and preventing knowledge atrophy while using AI coding tools.

## The Problem

Vibe coding — accepting AI-generated code without deeply understanding it — erodes your ability to reason about systems independently. You trade short-term velocity for long-term skill atrophy. The paradox: the better you are at coding, the more effectively you can use AI tools. But over time, vibe coding erodes the very skills that make it effective.

claude-professor solves this by embedding a teaching layer directly into your development workflow. Before you build, the professor makes sure you understand *why*, not just *what*.

## What It Does

When you invoke `/professor` with a task description, the plugin:

1. **Analyzes your task** — A dedicated knowledge agent (prompted as a solutions architect) identifies all relevant technical concepts, including foundational prerequisites and adjacent concerns that a keyword search would miss
2. **Checks your knowledge** — Looks up each concept in your personal skill profile, using FSRS (Free Spaced Repetition Scheduler) to determine what you know well, what's decaying, and what's new
3. **Teaches adaptively** — For concepts you know well: a one-liner acknowledgment. For decaying knowledge: a quick flashcard check. For new concepts: a full explanation with analogy, real-world example, and use case, followed by a recall question
4. **Quizzes you** — At the end of the session, a rapid-fire MCQ pop quiz on new and weak concepts to verify retention
5. **Produces a handoff document** — A structured markdown file with an expanded implementation prompt, probing instructions for downstream tools, and a summary of your understanding

## What It Is NOT

- **Not a pair programmer** — It doesn't write code or guide you through implementation. Use [Superpowers](https://github.com/obra/superpowers) for that.
- **Not a code generator** — It never writes code. Ever.
- **Not a code reviewer** — It doesn't review existing code quality.
- **Not a planner** — It doesn't plan implementation steps. It teaches concepts and produces a handoff for your planning tool of choice.

## Installation

### From GitHub (Recommended)

```bash
# Add the marketplace (one-time)
/plugin marketplace add https://github.com/theadityamittal/claude-professor.git

# Install the plugin
/plugin install claude-professor@claude-professor
```

### From Local Clone

```bash
git clone https://github.com/theadityamittal/claude-professor.git

# Add as a local marketplace
claude plugin marketplace add ./claude-professor

# Install
/plugin install claude-professor@claude-professor
```

### Requirements

- Claude Code CLI
- Node.js (already required by Claude Code — no additional dependencies)

## Usage

### Basic Flow

```
> /professor I want to add Redis caching to my API to handle 10k concurrent users
```

The professor will:
1. Spawn a knowledge agent to analyze the task and identify relevant concepts
2. Check your skill profile for each concept
3. Walk you through concepts you need to learn or review
4. Run a quick MCQ quiz at the end
5. Write a handoff document to `docs/professor/`

### Using the Handoff Document

The handoff document is written to your project's `docs/professor/` directory with a timestamped filename like `2026-04-06-redis-caching.md`. It contains:

- **Original Request** — What you asked for, verbatim
- **Expanded Implementation Prompt** — An enriched version of your request informed by the teaching conversation, with key decisions and reasoning included
- **Probing Instructions** — Guidance for your planning/brainstorming tool on where to go deeper based on your understanding gaps
- **Concepts Reviewed** — A summary of what was taught, reviewed, or skipped
- **Key Decisions Made** — Architectural choices discussed and agreed upon

Feed this document into your preferred next step:
- **Superpowers brainstorming:** Reference the handoff as context for `/brainstorming`
- **Claude Code plan mode:** Point Claude at the handoff file
- **Manual implementation:** Read it yourself as a spec

## Architecture

### Plugin Structure

```
claude-professor/
├── .claude-plugin/
│   ├── plugin.json               # Plugin manifest
│   └── marketplace.json          # Marketplace registry
├── skills/
│   └── professor/
│       └── SKILL.md              # Core teaching flow
├── agents/
│   └── knowledge-agent.md        # Solutions architect agent
├── scripts/
│   ├── fsrs.js                   # FSRS-5 algorithm module (pure math)
│   ├── utils.js                  # File I/O, date math, arg parsing
│   ├── lookup.js                 # Search registry + get mastery status
│   ├── update.js                 # Write FSRS scores to profile
│   └── test/                     # Automated tests (node:test)
├── data/
│   └── domains.json              # Fixed domain taxonomy (append-only)
│   └── concepts_registry.json    # 150-200 starter concepts
│   └── preferred_sources.json    # Curated documentation URLs
├── config/
│   └── default_config.json       # Default settings
└── README.md
```

### Runtime Data (User's Machine)

```
~/.claude/professor/
├── config.json                   # User config (overrides defaults)
├── profile/
│   ├── databases.json            # Per-domain concept mastery
│   ├── cloud_infrastructure.json
│   ├── ml_ai.json
│   ├── backend.json
│   └── ...                       # Created as needed per domain
```

### Component Responsibilities

| Component | Does | Does NOT |
|-----------|------|----------|
| **Professor Skill** (SKILL.md) | Conducts teaching conversation, asks questions, runs MCQ quiz, writes handoff document, triggers score updates | Do math, read/write files directly, identify concepts |
| **Knowledge Agent** (knowledge-agent.md) | Analyzes task as solutions architect, identifies relevant concepts from registry, runs lookup scripts, produces structured briefing | Teach, interact with user, write handoff |
| **Scripts** (lookup.js, update.js) | FSRS computation, file I/O, concept search, score updates, domain file management | Any reasoning, any teaching, any user interaction |

### Data Flow

```
User describes task
       │
       ▼
Professor Skill activates
       │
       ▼
Spawns Knowledge Agent (subagent)
       │
       ├── Reads: domains.json, concepts_registry.json
       ├── Runs: lookup.js search (find relevant concepts)
       ├── Runs: lookup.js status (get user's mastery)
       │
       ▼
Agent returns structured briefing to Professor
       │
       ▼
Professor teaches (explain → recall question → next concept)
       │
       ▼
MCQ pop quiz on new/weak concepts
       │
       ▼
Professor triggers: update.js (save scores)
       │
       ▼
Professor writes handoff document to docs/professor/
```

### Error Handling

The scripts can fail. The professor handles this gracefully:

| Failure | Response |
|---------|----------|
| Script crashes (bug, malformed JSON) | Warn user, fall back to LLM for that operation |
| Permission error (can't read/write profile) | Tell user, offer to continue without tracking |
| Script not found (installation issue) | Tell user, likely installation problem |

The professor always tries scripts first. If they fail, it degrades to LLM-based computation (less precise but functional). Learning sessions are never interrupted by technical failures.

## Key Design Decisions

### Why FSRS Over Simple Counters

FSRS (Free Spaced Repetition Scheduler) is a spaced repetition algorithm that determines optimal review intervals. When you learn a concept, FSRS calculates when you're likely to forget it. If you review at the right moment, the memory strengthens and the next interval gets longer. If you struggle, the interval shortens.

This means concepts you know well gradually stop appearing (no wasted time), while concepts you struggle with keep coming back until they stick. The algorithm uses date-stamped review history, not simple counts, to model your actual learning curve.

### Why a Knowledge Agent Instead of Keyword Matching

A prompt like "make my API handle 10k concurrent users" doesn't contain the words "connection pooling", "cache invalidation", or "horizontal scaling." But a solutions architect hearing this prompt would immediately think of all three. The knowledge agent is prompted as a solutions architect precisely to catch these non-obvious but critical concepts.

### Why Node.js Scripts Instead of LLM Math

LLMs are non-deterministic. Asking Claude to compute FSRS stability values (exponential decay functions, difficulty adjustments) across hundreds of sessions produces inconsistent results. One miscalculation compounds over time. Node.js scripts are deterministic: same inputs, same outputs, every time. Claude Code already requires Node.js, so there are zero additional dependencies.

### Why Per-Domain Profile Files

A developer with 500 concepts across 15 domains shouldn't load all 500 into context every session. Per-domain files enable two-pass retrieval: the knowledge agent identifies relevant domains, then loads only those files. A Redis caching task loads `databases.json` and `backend.json` — not `ml_ai.json`.

### Why a Fixed Domain Taxonomy

LLMs are non-deterministic with naming. Without a fixed list, one session might categorize a concept as "cloud" and another as "infrastructure" or "devops." The fixed taxonomy with append-only versioning ensures every user's profile uses the same vocabulary, enabling future cross-user features.

Domains support a parent-child tree for backward-compatible specialization:

```json
{"id": "cloud_infrastructure", "parent": null}
{"id": "aws", "parent": "cloud_infrastructure"}
```

When teaching an AWS concept, the agent scans both `aws` and `cloud_infrastructure` (parent) profile files.

### Why a Concept Registry

Same non-determinism problem as domains. "Connection pooling" vs "DB connection pool management" vs "pool-based connection handling" — same concept, different strings. The registry provides a controlled vocabulary of canonical concept names. The knowledge agent matches task concepts to registry entries first, only creating new entries for truly novel concepts.

The registry is community-expandable via PRs.

## Configuration

User config at `~/.claude/professor/config.json` (created on first run with defaults):

```json
{
  "web_search_enabled": false,
  "preferred_sources": [],
  "handoff_directory": "docs/professor/",
  "profile_directory": "~/.claude/professor/profile/"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `web_search_enabled` | boolean | `false` | Whether the professor can search the web during teaching for concept freshness. Requires user approval on first use. |
| `preferred_sources` | string[] | `[]` | Documentation domains to prefer when searching (e.g., `docs.python.org`). Falls back to general search if empty. Merged with plugin defaults from `preferred_sources.json`. |
| `handoff_directory` | string | `"docs/professor/"` | Project-relative path where handoff documents are written. |
| `profile_directory` | string | `"~/.claude/professor/profile/"` | Where your learning profile is stored. Change this to sync via Dropbox, git, etc. |

## Concept Schema

Each concept in a domain profile file:

```json
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
  "documentation_url": "https://docs.sqlalchemy.org/en/20/core/pooling.html",
  "notes": "Learned in context of FastAPI async handlers"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `concept_id` | string | Canonical name (lowercase_snake_case, max 3 words). From registry when possible. |
| `domain` | string | Must be from the fixed domain list in `domains.json`. |
| `is_registry_concept` | boolean | Whether this concept exists in the shipped registry. |
| `difficulty_tier` | enum | `foundational`, `intermediate`, or `advanced`. |
| `first_encountered` | ISO date | When the developer first learned this concept. |
| `last_reviewed` | ISO date | Most recent review/assessment date. |
| `review_history` | array | Dated entries with grades (1-4 integer: Again/Hard/Good/Easy). |
| `fsrs_stability` | float | FSRS stability value (days) — how long until the concept is likely forgotten. |
| `fsrs_difficulty` | float | FSRS difficulty (1-10) — how hard this concept is for this developer. |
| `documentation_url` | string/null | Canonical docs link. Updated lazily via web search when enabled. |
| `notes` | string | Context about when/how the concept was learned. |

## Domain Taxonomy

Ships in `data/domains.json`. Append-only — domains are never renamed or removed.

### Starter Domains

| Domain | Covers |
|--------|--------|
| `algorithms` | Sorting, searching, graph algorithms, dynamic programming, complexity analysis |
| `data_structures` | Arrays, trees, hash maps, heaps, tries, linked lists |
| `databases` | SQL, NoSQL, indexing, transactions, ORMs, connection management, caching |
| `networking` | HTTP, TCP/IP, DNS, WebSockets, gRPC, API protocols |
| `security` | Auth, encryption, OWASP, secrets management, vulnerability patterns |
| `cloud_infrastructure` | Cloud architecture, IaC, serverless, containers, orchestration |
| `devops` | CI/CD, monitoring, logging, deployment strategies, infrastructure automation |
| `frontend` | DOM, frameworks, state management, rendering, accessibility, CSS |
| `backend` | Server architecture, middleware, API design, session management |
| `ml_ai` | Training, inference, model architecture, data pipelines, MLOps |
| `systems` | OS internals, memory management, file systems, processes, kernel |
| `architecture` | Design patterns, microservices, event-driven, CQRS, DDD |
| `testing` | Unit, integration, E2E, TDD, mocking, coverage strategies |
| `concurrency` | Threading, async/await, parallelism, locks, race conditions |
| `languages` | Language-specific features, type systems, memory models, idioms |
| `tools` | Git, editors, build systems, package managers, debugging tools |
| `custom` | Anything that doesn't fit above. Freeform `notes` field for context. |

Domains support parent-child relationships for future specialization:

```json
[
  {"id": "cloud_infrastructure", "parent": null},
  {"id": "aws", "parent": "cloud_infrastructure"},
  {"id": "gcp", "parent": "cloud_infrastructure"},
  {"id": "azure", "parent": "cloud_infrastructure"}
]
```

Child domains are added in future versions. Existing concepts under parent domains remain valid and are never migrated.

## Teaching Flow Detail

### For New Concepts (retrievability below 0.3)

1. Professor explains the concept with a concrete analogy, a real-world example, and a practical use case
2. Professor asks an inline recall question requiring the developer to apply what they just learned (e.g., "Given what we just discussed about cache invalidation, what would happen if your cache TTL is longer than your database write interval?")
3. Developer answers in their own words
4. Professor evaluates the answer, gives brief corrective feedback if needed
5. FSRS score is recorded

### For Decaying Concepts (retrievability 0.3-0.7)

1. Professor presents a flashcard-style quick check (e.g., "Quick — why do we use connection pooling instead of opening a new connection per request?")
2. Developer answers briefly
3. Professor confirms or corrects
4. FSRS score is updated

### For Known Concepts (retrievability above 0.7)

1. Professor gives a one-liner acknowledgment: "We're using the cache-aside pattern here — you know this well, moving on."
2. No question asked
3. No FSRS update needed (stability remains high)

### End-of-Session MCQ Pop Quiz

After all concepts are covered, if any new or weak concepts were taught:

1. Professor presents MCQ questions for each new/weak concept
2. Each MCQ has 4 answer options plus "Explain again"
3. If "Explain again" is selected: professor re-explains, asks one inline recall question, moves to next MCQ
4. No loops — maximum one re-explanation per concept
5. All MCQ scores feed into FSRS updates

## Handoff Document Format

Written to `{handoff_directory}/{timestamp}-{task-shorthand}.md`:

```markdown
# Professor Handoff: [Feature Name]
## Date: [ISO timestamp]

## Original Request
[Verbatim developer request]

## Expanded Implementation Prompt
[Enriched version of the request informed by the teaching
conversation. Includes key decisions, architectural choices,
and reasoning. This is the prompt downstream tools should use.]

## Probing Instructions
[Guidance for planning/brainstorming tools on where to probe
deeper during implementation, based on the developer's
understanding gaps.]

- [Concept area]: [What to show examples of, what to explain
  further during implementation]
- [Concept area]: [Additional depth needed]

## Concepts Reviewed
- [concept_id]: [status] — [1-line summary of what happened]

## Key Decisions Made
- [Decision]: [Reasoning and alternatives considered]
```

## Roadmap

### Phase 1 (Current)
- Core teaching flow with FSRS-based adaptive learning
- Knowledge agent for intelligent concept discovery
- Node.js scripts for deterministic computation
- Local JSON profile storage with per-domain files
- Concept registry with 150-200 starter concepts
- Handoff document generation

### Phase 2 (Planned)
- MCP server replacing direct script calls
- SQLite backend replacing JSON files
- Optional web search for concept freshness verification
- Documentation URL lazy-updating via search
- Expanded concept registry via community PRs

### Phase 3 (Future)
- Learning analytics and progress visualization
- Teaching style customization (depth, verbosity, example types)
- Explicit concept relationship modeling
- Cross-domain concept dependency tracking
- Agent-based codebase analysis for concept identification

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

The professor's teaching behavior is defined in `skills/professor/SKILL.md`. Improvements to explanation quality, question design, or flow are welcome as PRs.

## License

MIT