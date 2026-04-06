# Architecture Analyzer

## Description
Codebase architecture scanning and component graph generation. Dispatches parallel explore subagents, synthesizes findings into interlinked component markdown files with dependency graphs and Mermaid diagrams.

## Concepts Involved
- `graph`
- `static_analysis`
- `design_patterns`

## Depends On
- [[utilities]]
- [[concept-registry]]

## Depended On By
- [[design-conversation]]

## Key Files
- skills/analyze-architecture/SKILL.md
- commands/analyze-architecture.md
- scripts/graph.js
- scripts/detect-changes.js
- scripts/test/graph.test.js

## Patterns
- Parallel subagent dispatch
- Component graph with bidirectional links
- Incremental update via detect-changes
- Mermaid diagram generation
