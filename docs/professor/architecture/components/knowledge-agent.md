# Knowledge Agent

## Description
Solutions architect subagent spawned by the professor skill. Analyzes a development task, identifies up to 25 candidate concepts, fetches mastery status, and returns a structured JSON briefing with teach/review/skip classification.

## Concepts Involved
- `design_patterns`
- `dependency_injection`

## Depends On
- [[concept-registry]]
- [[profile-manager]]

## Depended On By
- [[teaching-skills]]

## Key Files
- agents/knowledge-agent.md

## Patterns
- Subagent delegation
- 12-concept cap
- Priority ordering (teach>review>not_in_registry>skip)
