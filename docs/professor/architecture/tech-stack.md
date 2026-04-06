# Tech Stack

## Runtime & Platform

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js (built-ins only) | No npm dependencies |
| Platform | Claude Code Plugin System | Skills, Commands, Agents |
| Data Format | JSON + Markdown with frontmatter | File-based storage |
| Algorithm | FSRS-5 | Free Spaced Repetition Scheduler |
| Test Framework | `node:test` | Node.js built-in test runner |

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node:fs` | built-in | File system I/O, atomic writes |
| `node:path` | built-in | Cross-platform path manipulation |
| `node:os` | built-in | Home directory resolution |
| `node:child_process` | built-in | Spawning subprocesses (detect-changes hook) |
| `node:test` | built-in | Unit test framework |

**Zero external dependencies.** The project deliberately avoids npm packages to ensure it works out of the box with Claude Code's Node.js runtime.

## Data Stores

| Store | Location | Format | Purpose |
|-------|----------|--------|---------|
| Concept Registry | `data/concepts_registry.json` | JSON array | 180+ concepts with domain + difficulty |
| Domain Taxonomy | `data/domains.json` | JSON array | 17 domain categories |
| Preferred Sources | `data/preferred_sources.json` | JSON array | Documentation URLs |
| Concept Profiles | `~/.claude/professor/concepts/{domain}/{id}.md` | Markdown + frontmatter | Per-user mastery state |
| Session State | `.session-state.json` | JSON | Ephemeral design conversation state |
| Architecture Graph | `docs/professor/architecture/` | Markdown files | Component documentation |
| Handoff Documents | `docs/professor/` | Markdown | Teaching session outputs |
| Design Documents | `docs/professor/designs/` | Markdown | System design outputs |
| Default Config | `config/default_config.json` | JSON | Plugin defaults |

## Infrastructure

No external infrastructure required. The plugin runs entirely locally within Claude Code's process, using the filesystem for all persistence. No databases, no APIs, no network calls (unless `web_search_enabled` is configured).
