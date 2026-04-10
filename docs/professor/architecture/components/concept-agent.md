# Concept Agent

## Description
Subagent that resolves concept candidates against the seed registry and user profile, computes FSRS retrieval status for each concept, and optionally creates new L2 concepts.

## Concepts Involved
- `dependency_injection`
- `repository_pattern`

## Depends On
- [[concept-registry]]
- [[fsrs-engine]]
- [[profile-manager]]

## Depended On By
- [[skill-engine]]

## Key Files
- agents/concept-agent.md

## Patterns
- one-shot subagent
- resolve-or-create
- FSRS status computation
