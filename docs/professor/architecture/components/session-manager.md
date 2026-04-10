# Session Manager

## Description
Manages whiteboard session state across phases (context loading → requirements → HLD → LLD → deliverable). Persists concepts checked, decisions, chosen option, and supports --continue.

## Concepts Involved
- `version_control`
- `defensive_programming`

## Depended On By
- [[skill-engine]]

## Key Files
- scripts/session.js

## Patterns
- phase-based state machine
- JSON persistence
- resume support
