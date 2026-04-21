# Architecture Overview

## Project
claude-professor

## Branch
spec/v5-whiteboard-redesign

## Last Updated
2026-04-21T09:31:15.408Z

## Summary
Claude Professor is a spaced-repetition learning plugin for Claude Code that teaches CS concepts during architecture design sessions. v5.0.0 introduces a JIT iterator whiteboard system with 16 subcommands, a research-backed concerns catalog, and inline teaching via professor-teach skill.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[application-config]] | Default configuration for web search, profile directories, and handoff file system paths |  |
| [[architecture-analysis-skill]] | Skill for analyzing architecture using component graph and codebase scanning | `design_patterns`, `graphs`, `domain_driven_design` |
| [[architecture-graph]] | Codebase scanning, component creation with frontmatter, and change detection |  |
| [[concept-lookup]] | Concept registry search, L2 discovery, and state lookup with retrievability computation |  |
| [[concept-migration]] | Multi-version schema migrations: v2 JSON, v3 domain mapping, v4 field enrichment, v5 markdown conversion |  |
| [[concept-registry]] | Central registry of concepts across domains with seed data and concept-to-domain mappings. | `architecture` |
| [[concept-update]] | FSRS grading application, registry reconciliation, and v5 concept profile writing |  |
| [[concept-updater]] | Persists concept review feedback, updates FSRS parameters, and manages concept markdown frontmatter. | `file_systems` |
| [[configuration-validation]] | Concerns catalog validation, registry coverage checks, and schema invariant enforcement |  |
| [[data-migration]] | Handles schema migrations from v2-v4 formats, domain remapping, and field enrichment. | `schema_evolution`, `schema_migration` |
| [[domain-taxonomy]] | Defines 18 knowledge domains (algorithms, architecture, databases, etc.) with descriptions and relationships. | `architecture`, `domain_driven_design` |
| [[file-io-utilities]] | JSON and markdown file operations, CLI argument parsing, environment expansion, and response envelopes |  |
| [[fsrs-scheduler]] | Implements FSRS spaced repetition algorithm for calculating concept stability, difficulty, and retrievability. | `cpu_scheduling`, `process_scheduling_policies` |
| [[git-change-detection]] | Git hook that detects architecture changes after git operations and warns when base branch is affected. | `version_control` |
| [[session-checkpoint]] | Phase checkpoint audit, session logging with JSONL append and phase state validation |  |
| [[session-lifecycle]] | v5 session state creation, loading, updating, and concept tracking |  |
| [[session-state]] | Manages teaching session lifecycle, phases, and concept tracking with session state file persistence. | `session_management`, `configuration_management` |
| [[shared-utilities]] | Core utilities for JSON I/O, markdown parsing, CLI argument handling, and file operations. | `file_systems` |
| [[spaced-repetition]] | FSRS algorithm implementation for learning curve optimization |  |
| [[teaching-gate]] | Schedules teaching phases, tracks checkpoint progress, and gates session flow based on completion status. | `configuration_management`, `dependency_management` |
| [[teaching-skills]] | Educational workflow skill definitions including professor, whiteboard, and concept checking protocols | `design_patterns`, `reinforcement_learning`, `prompt_engineering` |
| [[test-suite]] | Comprehensive tests covering unit, integration, contract, and CLI scenarios with fixtures. | `unit_testing`, `integration_testing`, `contract_testing`, `test_driven_development` |
| [[whiteboard-commands]] | Individual session handler implementations: init, resume, phase transitions, recording, and marking |  |
| [[whiteboard-router]] | v5 whiteboard subcommand dispatcher with handler registration and error routing |  |
