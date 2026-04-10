# Tech Stack

## Runtime

| Component | Details |
|-----------|---------|
| Runtime | Node.js (required by Claude Code — no additional install) |
| Language | JavaScript (CommonJS modules, `'use strict'`) |
| Platform | Claude Code plugin system |

## Framework

This is not a web application. It is a **Claude Code plugin** that runs as skill definitions (markdown) orchestrating Node.js scripts and subagents.

| Layer | Technology |
|-------|-----------|
| Skill definitions | Markdown with YAML frontmatter (SKILL.md files) |
| Agent definitions | Markdown with YAML frontmatter (agents/*.md) |
| Script runtime | Node.js with zero external dependencies |
| Plugin packaging | `.claude-plugin/marketplace.json` + `plugin.json` |

## Data Stores

| Store | Location | Format |
|-------|----------|--------|
| Concept seed registry | `data/concepts_registry.json` | JSON array (407 entries) |
| Domain definitions | `data/domains.json` + `data/domains/*.md` | JSON + Markdown (18 domains) |
| User concept profiles | `~/.claude/professor/concepts/{domain}/{concept}.md` | Markdown with FSRS frontmatter |
| Session state | `docs/professor/.session-state.json` | JSON |
| Architecture output | `docs/professor/architecture/` | Markdown + JSON |
| Design documents | `docs/professor/designs/` | Markdown |
| Plugin config | `config/default_config.json` | JSON |

## Infrastructure

No external infrastructure required. All data is file-based and local.

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node:fs` | Built-in | File system operations |
| `node:path` | Built-in | Path manipulation |
| `node:os` | Built-in | Home directory expansion |
| `node:assert` | Built-in | Test assertions |

**Zero external dependencies.** All functionality uses Node.js built-in modules only.

## Algorithm

| Component | Details |
|-----------|---------|
| FSRS-5 | Free Spaced Repetition Scheduler v5 with 19 pre-trained weights |
| Grades | 4-point scale: Again (1), Hard (2), Good (3), Easy (4) |
| Retrievability | Power-law decay function from stability and elapsed days |
