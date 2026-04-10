# Architecture Analyzer

## Description
Scans the host codebase to produce interlinked architecture markdown files: component index, component files, data-flow diagrams, tech-stack inventory, and concept-scope.json.

## Concepts Involved
- `static_analysis`
- `documentation`
- `build_systems`

## Depends On
- [[concept-registry]]

## Depended On By
- [[skill-engine]]

## Key Files
- scripts/graph.js
- scripts/detect-changes.js
- skills/analyze-architecture/SKILL.md

## Patterns
- incremental update
- wiki-links
- Mermaid diagrams
- detect-changes
