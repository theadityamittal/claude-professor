# Profile Manager

## Description
Per-user concept profile store at ~/.claude/professor/concepts/. Holds FSRS review history, stability, and difficulty per concept as markdown files with frontmatter.

## Concepts Involved
- `repository_pattern`
- `version_control`

## Depends On
- [[fsrs-engine]]

## Depended On By
- [[concept-agent]]
- [[skill-engine]]

## Key Files
- scripts/update.js
- scripts/utils.js
- scripts/migrate-v2.js
- scripts/migrate-v3.js

## Patterns
- file-per-concept
- frontmatter storage
- home-dir expansion
