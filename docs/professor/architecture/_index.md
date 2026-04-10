# Architecture Overview

## Project
claude-professor

## Branch
main

## Last Updated
2026-04-10T06:39:01.524Z

## Summary
Claude Code plugin for AI-assisted learning with FSRS-driven spaced repetition. 10 components: skills orchestrate multi-agent design conversations, concept-agent resolves knowledge gaps, FSRS engine tracks mastery, architecture analyzer maps host codebases, and session manager enables resumable whiteboard sessions.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[architecture-analyzer]] | Scans the host codebase to produce interlinked architecture markdown files: component index, component files, data-flow diagrams, tech-stack inventory, and concept-scope.json. | `static_analysis`, `documentation`, `build_systems` |
| [[concept-agent]] | Subagent that resolves concept candidates against the seed registry and user profile, computes FSRS retrieval status for each concept, and optionally creates new L2 concepts. | `dependency_injection`, `repository_pattern` |
| [[concept-registry]] | 407-concept seed registry spanning 18 technical domains with lookup, search, and reconcile capabilities. Ground truth for concept IDs, aliases, domains, and scope notes. | `repository_pattern`, `domain_driven_design` |
| [[fsrs-engine]] | Core Free Spaced Repetition Scheduler (FSRS-5) implementation. Computes retrievability, stability, difficulty, and schedules next review intervals for each concept. | `refactoring`, `defensive_programming` |
| [[plugin-infrastructure]] | Claude Code plugin packaging: marketplace.json for discovery and update detection, plugin.json for metadata, default_config.json for runtime defaults. | `build_systems`, `dependency_management` |
| [[profile-manager]] | Per-user concept profile store at ~/.claude/professor/concepts/. Holds FSRS review history, stability, and difficulty per concept as markdown files with frontmatter. | `repository_pattern`, `version_control` |
| [[session-manager]] | Manages whiteboard session state across phases (context loading → requirements → HLD → LLD → deliverable). Persists concepts checked, decisions, chosen option, and supports --continue. | `version_control`, `defensive_programming` |
| [[skill-engine]] | User-facing skill layer (whiteboard, analyze-architecture, professor-teach, backend-architect). Orchestrates multi-agent design conversations, requirement analysis, and concept teaching flows. | `design_patterns`, `dependency_injection`, `coupling_cohesion` |
| [[test-suite]] | Comprehensive test coverage for all scripts: FSRS calculations, lookup operations, graph generation, session management, update flows, and v2/v3 migrations. | `debugging`, `code_review` |
| [[utilities]] | Shared utility functions: JSON read/write, markdown frontmatter parsing, directory management, path expansion, argument parsing, date calculations. | `defensive_programming`, `refactoring` |
