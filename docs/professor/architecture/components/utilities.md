# Utilities

## Description
Shared utility module providing file I/O (JSON and markdown with frontmatter), date math, CLI argument parsing, and atomic write operations used by all scripts.

## Concepts Involved
- `file_descriptor`

## Depended On By
- [[profile-manager]]
- [[architecture-analyzer]]
- [[design-conversation]]

## Key Files
- scripts/utils.js
- scripts/test/utils.test.js

## Patterns
- Atomic writes via temp file
- Markdown frontmatter parsing
- Home directory expansion
