# Technology Stack

## Runtime

- **JavaScript Runtime**: Node.js (standard library only — `node:fs`, `node:path`, `node:os`)
- **Execution Model**: Node.js scripts invoked synchronously by the Claude Code skill harness
- **No external npm dependencies** — Zero third-party packages; no `package.json` required

## Framework

- **Skill Framework**: Claude Code plugin system (skill manifest + SKILL.md registration)
- **CLI Dispatch**: Custom subcommand router in `scripts/whiteboard.js` (16 subcommands)
- **Plugin Version**: claude-professor v5.1.1 (plugin.json)

## Data Stores

| Store | Path | Format | Purpose |
|-------|------|--------|---------|
| Concept Registry | `data/concepts_registry.json` | JSON array | Seed definitions for ~407 L1 concepts across 18 domains |
| Domain Taxonomy | `data/domains.json` + `data/domains/*.md` | JSON index + Markdown | Domain hierarchy and descriptions |
| User Concept Profiles | `~/.claude/professor/concepts/{domain}/{id}.md` | Markdown + YAML frontmatter | Per-concept FSRS state (stability, difficulty, reps, lapses) |
| Session State | `~/.claude/professor/sessions/{project}/session.json` | JSON | Active session phase, gates, scheduled concepts |
| Architecture Index | `docs/professor/architecture/_index.md` | Markdown | Component dependency summary for current branch |
| Concept Scope | `docs/professor/architecture/concept-scope.json` | JSON | Detected domains, patterns, and tech stack for codebase |
| Preferred Sources | `data/preferred_sources.json` | JSON | Trusted learning source list per domain |

## Infrastructure

- **Deployment**: No server — local CLI plugin for Claude Code
- **Persistence**: Filesystem only (user home directory and project `docs/`)
- **Network**: None — all operations are local and synchronous
- **Git Integration**: Post-git hook via `scripts/detect-changes.js` for architecture drift detection

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node:fs` | Node.js stdlib | File I/O, synchronous JSON and Markdown reads/writes |
| `node:path` | Node.js stdlib | Path resolution, directory joining |
| `node:os` | Node.js stdlib | Home directory expansion (`~` resolution) |
| FSRS Algorithm | Internal (`scripts/fsrs.js`) | 19-parameter weight matrix for spaced repetition scheduling |
| Markdown Parser | Internal (`scripts/utils.js`) | Regex-based YAML frontmatter + body extraction |
| Component Graph Builder | Internal (`scripts/graph.js`) | Dependency graph construction and index generation |
| CLI Arg Parser | Internal (`scripts/utils.js`) | `--flag value` argument parsing without external deps |

## Architecture Patterns

| Pattern | Implementation |
|---------|----------------|
| Spaced Repetition (FSRS) | Free Spaced Repetition Scheduler — 19-parameter weight matrix in `scripts/fsrs.js` |
| State Machine | Teaching phases: `clarify` → `design_hld` → `design_lld` → `conclude` |
| Gate-Based Flow Control | Concept retrievability gates phase progression in `scripts/gate.js` |
| Registry Pattern | Central concept + domain registries backed by static JSON lookup tables |
| File-Based State | JSON + Markdown frontmatter for durable, diff-friendly session tracking |
| CLI Plugin | Claude Code skill system with SKILL.md manifest and `scripts/whiteboard.js` router |
| Schema Migration Pipeline | Versioned migration scripts (`migrate-v2.js` through `migrate-v5.js`) |

## Data Pipeline

1. **Input**: Markdown concept files with YAML frontmatter (user profile) + JSON concept registry
2. **Scheduling**: FSRS stability/difficulty calculations produce retrievability scores
3. **Gate Evaluation**: Retrievability thresholds determine whether phase advancement is allowed
4. **Storage**: JSON session state and Markdown profiles persisted between CLI invocations
5. **Output**: Architecture manifests, design documents, and teaching schedules in `docs/professor/`

## Scaling Notes

- **Profile Directory**: User-scoped per project — grows linearly with concepts taught
- **Concept Registry**: Static ~407 concepts; loaded once per CLI invocation
- **Session State**: Minimal footprint (< 10 KB per active session)
- **No databases, caches, or queues** — All operations are single-threaded synchronous I/O
