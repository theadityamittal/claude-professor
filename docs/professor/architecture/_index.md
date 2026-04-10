# Architecture Overview

## Project
claude-professor

## Branch
main

## Last Updated
2026-04-10T12:02:43.644Z

## Summary
A learning layer plugin for Claude Code that integrates concept knowledge tracking with spaced repetition (FSRS), architectural analysis, and interactive teaching workflows to prevent knowledge atrophy during AI-assisted development.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[application-config]] | Default configuration for web search, profile directories, and handoff locations | `configuration_management`, `dependency_management` |
| [[architecture-analysis-skill]] | Skill for analyzing architecture using component graph and codebase scanning | `design_patterns`, `graphs`, `domain_driven_design` |
| [[architecture-graph]] | Component creation, indexing, and architectural change detection system | `graphs`, `design_patterns`, `domain_driven_design` |
| [[concept-lookup]] | Concept registry search, reconciliation, and status checking with alias matching | `searching_algorithms`, `full_text_search`, `configuration_management` |
| [[concept-registry]] | Concept seed data with domains, aliases, scope notes, and metadata | `relational_model`, `data_catalog`, `configuration_management` |
| [[concept-updater]] | Update concept FSRS metrics, difficulty, stability, and metadata with review grades | `model_evaluation`, `memory_management`, `dependency_management` |
| [[data-migration]] | v2 to v3 concept format migration with schema evolution and domain remapping | `schema_migration`, `schema_evolution`, `data_serialization` |
| [[domain-taxonomy]] | Domain definitions and knowledge categorization structure with 18+ domain categories | `relational_model`, `data_catalog`, `design_patterns` |
| [[fsrs-scheduler]] | Free Spaced Repetition System algorithm for review scheduling and retrievability computation | `supervised_learning`, `model_evaluation`, `reinforcement_learning` |
| [[git-change-detection]] | Git hook for detecting architecture changes after pull or merge events | `design_patterns`, `incident_management`, `artifact_management` |
| [[session-state]] | Learning session lifecycle management with requirements, decisions, and context tracking | `session_management`, `configuration_management`, `state_management` |
| [[shared-utilities]] | Shared utilities for JSON/markdown I/O, filesystem operations, and CLI argument parsing | `complexity_management`, `dependency_management`, `design_patterns` |
| [[teaching-skills]] | Educational workflow skill definitions including professor, whiteboard, and concept checking protocols | `design_patterns`, `reinforcement_learning`, `prompt_engineering` |
| [[test-suite]] | Comprehensive unit test coverage for all core modules including FSRS, graph, and migrations | `testing`, `design_patterns`, `regression` |
