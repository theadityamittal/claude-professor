# Technology Stack

## Runtime

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18.x+ | JavaScript runtime for all scripts and CLI tools |

## Framework

| Component | Version | Purpose |
|-----------|---------|---------|
| Claude Code | 3.1.0+ | Plugin framework and skill system |

## Data Stores

| Component | Type | Purpose |
|-----------|------|---------|
| concepts_registry.json | In-memory JSON | Concept seed data (407+ concepts) with domains, aliases, difficulty tiers, and relationships |
| domains.json | In-memory JSON | Domain taxonomy (18 domains) for knowledge categorization |
| Markdown Files | File-based | Component definitions, teaching notes, session state, design documents |

## Infrastructure

| Component | Purpose |
|-----------|---------|
| Git hooks | Detect architecture changes on pull/merge events |
| File system | Local storage for concepts, sessions, designs, and architectural metadata |
| CLI argument parsing | Parse skill parameters and command-line options |

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node:fs` | Built-in | Filesystem I/O for reading/writing JSON and markdown files |
| `node:path` | Built-in | Path resolution and normalization |
| `node:os` | Built-in | OS utilities (home directory expansion) |
| FSRS (Free Spaced Repetition System) | Custom | SM-2 algorithm implementation for spaced repetition scheduling (difficulty, stability, ease factors) |
| JSON frontmatter parser | Custom | Parse markdown files with YAML-style JSON frontmatter for metadata |

## Data Serialization

| Format | Usage |
|--------|-------|
| JSON | Concept registry, domains, configuration, session state, review data |
| Markdown + JSON frontmatter | Component definitions, session notes, teaching materials, design documents |
| Git diff | Architectural change detection |
| Mermaid | Architecture diagrams and dependency graphs |

## Key Concepts in Codebase

### Spaced Repetition (FSRS)

Implements the Free Spaced Repetition System algorithm with:
- W (weight matrix): 19 parameters tuned for optimal scheduling
- DECAY factor: -0.5 for exponential decay model
- Difficulty range: 1-10 scale
- Grades: 1 (again), 2 (hard), 3 (good), 4 (easy)

### Concept Model

```
Concept {
  concept_id: string,
  domain: string,
  difficulty_tier: enum [beginner, intermediate, advanced],
  level: number,
  parent_concept: string | null,
  is_seed_concept: boolean,
  aliases: string[],
  related_concepts: string[],
  scope_note: string
}
```

### Component Registry

Tracks system components with:
- ID (kebab-case identifier)
- Description
- Concepts involved (comma-separated)
- Dependencies (wiki-link format: [[component]])
- Key files
- Patterns

### Domain Taxonomy

18 top-level domains:
- algorithms_data_structures
- api_design
- architecture
- concurrency
- data_processing
- databases
- devops_infrastructure
- distributed_systems
- frontend
- machine_learning
- networking
- operating_systems
- performance_scalability
- programming_languages
- reliability_observability
- security
- software_construction
- testing

### Session State

Learning session lifecycle tracking:
- Requirements collected
- Design decisions made
- Context/notes accumulated
- Timestamp and branch tracking
