# Technology Stack

## Runtime

- **JavaScript Runtime**: Node.js (standard library only: `node:fs`, `node:path`, `node:os`)
- **CLI Framework**: Custom CLI argument parser in `scripts/utils.js`
- **No external dependencies** — Pure Node.js standard library implementation

## Framework

- **Skill Framework**: Claude Code plugin system (skill/manifest registration)
- **Execution Model**: Node.js scripts invoked by Claude Code harness
- **Plugin Specification**: Claude Code v4.0.0+ plugin architecture

## Data Stores

- **User Profile Directory**: `~/.claude-professor/profiles/{project}/`
  - Type: Filesystem-based JSON + Markdown with YAML frontmatter
  - Contents: Session state, concept review history, teaching notes
  
- **Concept Registry**: `data/concepts_registry.json`
  - Type: JSON array of concept definitions
  - Structure: concept_id, domain, source, description fields
  
- **Domain Taxonomy**: `data/domains.json` + `data/domains/{name}.md`
  - Type: JSON index + Markdown domain definitions
  - Coverage: 18 knowledge domains (algorithms, architecture, databases, etc.)
  
- **Session State**: Per-project JSON at `~/.claude-professor/profiles/{project}/session.json`
  - Type: Transient session metadata
  - Lifecycle: Created at session start, persisted at checkpoints, cleaned on completion

## Infrastructure

- **Deployment**: No server — CLI-based plugin for Claude Code
- **Persistence**: Filesystem-based (user home directory + project docs)
- **No network services** — All operations are local and synchronous
- **Git Integration**: Hook script (`scripts/detect-changes.js`) for post-git operations

## Key Dependencies

| Component | Purpose | Source |
|-----------|---------|--------|
| `node:fs` | File I/O, JSON persistence | Node.js stdlib |
| `node:path` | Path manipulation, directory resolution | Node.js stdlib |
| `node:os` | Environment detection, home directory lookup | Node.js stdlib |
| **FSRS Algorithm** | Spaced repetition scheduling (SM-2 variant) | Proprietary in `scripts/fsrs.js` |
| **Markdown Parser** | Frontmatter + content extraction | Custom regex in `scripts/utils.js` |
| **Component Graph Builder** | AST-style dependency analysis | Custom in `scripts/graph.js` |

## Architecture Patterns

| Pattern | Implementation |
|---------|-----------------|
| **Spaced Repetition** | FSRS (Free Spaced Repetition Scheduler) — 19-parameter weight matrix |
| **State Machines** | Teaching phases: clarify → design_hld → design_lld → conclude |
| **Gate-Based Flow Control** | Concept checkpoints gate progression between phases |
| **Registry Pattern** | Central concept + domain registries (JSON lookup tables) |
| **File-Based State** | JSON + Markdown frontmatter for durable session tracking |
| **CLI Plugin** | Claude Code skill system with manifest registration |

## Data Pipeline

1. **Input**: Markdown concept files with YAML frontmatter (user profile)
2. **Processing**: FSRS stability/difficulty calculations → retrievability scoring
3. **Storage**: JSON session state persisted between CLI invocations
4. **Output**: Architecture manifests, design documents, teaching schedules

## Scaling Notes

- **Profile Directory**: User-scoped (per project), grows linearly with concepts taught
- **Concept Registry**: Static ~407 concepts, loaded once per CLI invocation
- **Session State**: Minimal (< 10KB per active session)
- **No databases, caches, or queues** — All operations are single-threaded synchronous I/O
