# Architecture Overview

## Project
claude-professor

## Branch
main

## Last Updated
2026-04-22T00:23:06.662Z

## Summary
claude-professor is a Claude Code plugin providing spaced-repetition teaching during architecture design sessions. It implements a JIT learning iterator over 19 research-backed concerns with FSRS-5 scheduling, a two-stage concept matcher, and an inline professor-teach skill with web search integration.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[application-config]] | Default configuration for web search, profile directories, and handoff file system paths |  |
| [[architecture-analysis-skill]] | Skill for analyzing architecture using component graph and codebase scanning | `design_patterns`, `graphs`, `domain_driven_design` |
| [[architecture-change-detection]] | Detects structural filesystem changes via git hooks and issues architecture documentation update warnings | `configuration_management`, `design_patterns` |
| [[architecture-generation]] | Filesystem scanning and architecture component generation utilities for codebase analysis | `design_patterns`, `configuration_management` |
| [[architecture-graph]] | Codebase scanning, component creation with frontmatter, and change detection |  |
| [[concept-lookup]] | Concept registry search, L2 discovery, and state lookup with retrievability computation |  |
| [[concept-migration]] | Multi-version schema migrations: v2 JSON, v3 domain mapping, v4 field enrichment, v5 markdown conversion |  |
| [[concept-progress-tracking]] | FSRS concept difficulty and stability updates with grade-based learning progression tracking | `session_management`, `configuration_management` |
| [[concept-registry-lookup]] | L1/L2 concept registry search, matching, state tracking and semantic universe enumeration | `configuration_management`, `session_management`, `input_validation` |
| [[concept-registry]] | Central registry of concepts across domains with seed data and concept-to-domain mappings. | `architecture` |
| [[concept-update]] | FSRS grading application, registry reconciliation, and v5 concept profile writing |  |
| [[concept-updater]] | Persists concept review feedback, updates FSRS parameters, and manages concept markdown frontmatter. | `file_systems` |
| [[configuration-management-config]] | Default configuration for web search, profile directories, and handoff file system paths | `configuration_management`, `file_systems` |
| [[configuration-validation]] | Concerns catalog validation, registry coverage checks, and schema invariant enforcement |  |
| [[data-migration]] | Handles schema migrations from v2-v4 formats, domain remapping, and field enrichment. | `schema_evolution`, `schema_migration` |
| [[domain-taxonomy]] | Defines 18 knowledge domains (algorithms, architecture, databases, etc.) with descriptions and relationships. | `architecture`, `domain_driven_design` |
| [[file-io-utilities]] | Shared file I/O, markdown parsing, argument parsing, and API envelope utilities for all scripts | `file_systems`, `input_validation` |
| [[fsrs-learning-algorithm]] | FSRS v5 spacing repetition algorithm for optimal concept review scheduling and difficulty estimation | `algorithms_data_structures`, `performance_scalability` |
| [[fsrs-scheduler]] | Implements FSRS spaced repetition algorithm for calculating concept stability, difficulty, and retrievability. | `cpu_scheduling`, `process_scheduling_policies` |
| [[git-change-detection]] | Git hook that detects architecture changes after git operations and warns when base branch is affected. | `version_control` |
| [[phase-checkpointing]] | Session phase checkpoint validation, concept learning progress tracking, and phase-level audit gates | `unit_testing`, `test_coverage`, `configuration_management` |
| [[session-checkpoint]] | Phase checkpoint audit, session logging with JSONL append and phase state validation |  |
| [[session-lifecycle]] | Session state creation, loading, updating and completion management for teaching sessions | `session_management`, `configuration_management` |
| [[session-state]] | Manages teaching session lifecycle, phases, and concept tracking with session state file persistence. | `session_management`, `configuration_management` |
| [[shared-utilities]] | Core utilities for JSON I/O, markdown parsing, CLI argument handling, and file operations. | `file_systems` |
| [[spaced-repetition]] | FSRS algorithm implementation for learning curve optimization |  |
| [[teaching-gate]] | Schedules teaching phases, tracks checkpoint progress, and gates session flow based on completion status. | `configuration_management`, `dependency_management` |
| [[teaching-skills]] | Educational workflow skill definitions including professor, whiteboard, and concept checking protocols | `design_patterns`, `reinforcement_learning`, `prompt_engineering` |
| [[test-suite]] | Comprehensive tests covering unit, integration, contract, and CLI scenarios with fixtures. | `unit_testing`, `integration_testing`, `contract_testing`, `test_driven_development` |
| [[whiteboard-commands]] | Individual session handler implementations: init, resume, phase transitions, recording, and marking |  |
| [[whiteboard-concept-recording]] | Records taught, reviewed, and known concepts with action tracking and optional grade recording for progress | `session_management`, `input_validation`, `test_coverage` |
| [[whiteboard-iterators]] | Iterates through scheduled learning units (concerns/components) with mapped concept state information | `design_patterns`, `session_management` |
| [[whiteboard-phase-mgmt]] | Phase lifecycle management including initialization, completion validation, and phase transition rules | `session_management`, `state_management`, `input_validation` |
| [[whiteboard-router]] | v5 whiteboard subcommand dispatcher with handler registration and error routing |  |
| [[whiteboard-scheduling]] | Schedules teaching units (components and concerns) with validation and concern catalog version tracking | `session_management`, `configuration_management`, `design_patterns` |
| [[whiteboard-session-init]] | Initialize v5 teaching sessions with task description and catalog version tracking | `session_management`, `configuration_management` |
| [[whiteboard-skill-router]] | V5 whiteboard skill subcommand router and handler registration framework for all teaching operations | `design_patterns`, `configuration_management` |
