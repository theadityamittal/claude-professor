# Profile Manager

## Description
Concept mastery tracking layer. Reads/writes per-concept markdown profile files storing FSRS state, grade history, and notes. Provides search and status APIs via CLI.

## Concepts Involved
- `state_management`
- `design_patterns`

## Depends On
- [[fsrs-engine]]
- [[concept-registry]]
- [[utilities]]

## Depended On By
- [[knowledge-agent]]
- [[teaching-skills]]
- [[design-conversation]]

## Key Files
- scripts/lookup.js
- scripts/update.js
- scripts/test/lookup.test.js
- scripts/test/update.test.js

## Patterns
- File-per-concept storage
- Domain-partitioned directories
- CLI mode dispatch (search/status/update)
