# Architecture Overview

## Project
claude-professor

## Branch
main

## Last Updated
2026-04-11T13:30:43.823Z

## Summary
Claude Professor is a learning layer for AI-assisted development that teaches concepts before code is written, using spaced repetition (FSRS) scheduling and architecture-aware design conversations. This index maps 15 core components across concept registry, session management, teaching gates, and architecture analysis.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[application-config]] | Default configuration for web search, profile directories, and file system handoff locations. | `configuration_management`, `dependency_management` |
| [[architecture-analysis-skill]] | Skill for analyzing architecture using component graph and codebase scanning | `design_patterns`, `graphs`, `domain_driven_design` |
| [[architecture-graph]] | Scans codebase, detects architectural changes, and generates component graph and analysis manifests. | `complexity_analysis`, `layered_architecture`, `domain_driven_design` |
| [[concept-lookup]] | Searches concepts by query terms and domains, returns matching concept IDs and status. | `architecture` |
| [[concept-registry]] | Central registry of concepts across domains with seed data and concept-to-domain mappings. | `architecture` |
| [[concept-updater]] | Persists concept review feedback, updates FSRS parameters, and manages concept markdown frontmatter. | `file_systems` |
| [[data-migration]] | Handles schema migrations from v2-v4 formats, domain remapping, and field enrichment. | `schema_evolution`, `schema_migration` |
| [[domain-taxonomy]] | Defines 18 knowledge domains (algorithms, architecture, databases, etc.) with descriptions and relationships. | `architecture`, `domain_driven_design` |
| [[fsrs-scheduler]] | Implements FSRS spaced repetition algorithm for calculating concept stability, difficulty, and retrievability. | `cpu_scheduling`, `process_scheduling_policies` |
| [[git-change-detection]] | Git hook that detects architecture changes after git operations and warns when base branch is affected. | `version_control` |
| [[session-state]] | Manages teaching session lifecycle, phases, and concept tracking with session state file persistence. | `session_management`, `configuration_management` |
| [[shared-utilities]] | Core utilities for JSON I/O, markdown parsing, CLI argument handling, and file operations. | `file_systems` |
| [[teaching-gate]] | Schedules teaching phases, tracks checkpoint progress, and gates session flow based on completion status. | `configuration_management`, `dependency_management` |
| [[teaching-skills]] | Educational workflow skill definitions including professor, whiteboard, and concept checking protocols | `design_patterns`, `reinforcement_learning`, `prompt_engineering` |
| [[test-suite]] | Comprehensive tests covering unit, integration, contract, and CLI scenarios with fixtures. | `unit_testing`, `integration_testing`, `contract_testing`, `test_driven_development` |
