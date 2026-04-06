# Architecture Overview

## Project
claude-professor

## Branch
feat/phase-2-architecture-design

## Last Updated
2026-04-06T22:52:19.598Z

## Summary
Claude Code plugin implementing an adaptive teaching layer for AI-assisted development. Uses FSRS-5 spaced repetition to track concept mastery, scans codebase architecture, and conducts system design conversations with integrated teaching.

## Components

| Component | Description | Key Concepts |
|-----------|-------------|--------------|
| [[architecture-analyzer]] | Codebase architecture scanning and component graph generation. Dispatches parallel explore subagents, synthesizes findings into interlinked component markdown files with dependency graphs and Mermaid diagrams. | `graph`, `static_analysis`, `design_patterns` |
| [[concept-registry]] | Static knowledge base of 180+ technical concepts organized across 17 domains with difficulty tiers. Append-only JSON data files serving as ground truth for concept identification. | `graph`, `design_patterns` |
| [[design-conversation]] | Multi-phase system design conversation skill (backend-architect). Guides developers through requirements, architecture fit, design options, and finalization with integrated concept teaching. Uses session state for resumability. | `state_management`, `design_patterns`, `api_design_principles` |
| [[fsrs-engine]] | FSRS-5 spaced repetition algorithm. Pure math module computing retrievability, stability, difficulty, and scheduling actions for concept mastery tracking. | `design_patterns` |
| [[knowledge-agent]] | Solutions architect subagent spawned by the professor skill. Analyzes a development task, identifies up to 25 candidate concepts, fetches mastery status, and returns a structured JSON briefing with teach/review/skip classification. | `design_patterns`, `dependency_injection` |
| [[plugin-infrastructure]] | Claude Code plugin manifest and configuration. Defines plugin metadata, version, default settings, and local permissions. Bridges between Claude Code's plugin system and the professor's skills/commands/agents. | `design_patterns`, `twelve_factor_app` |
| [[profile-manager]] | Concept mastery tracking layer. Reads/writes per-concept markdown profile files storing FSRS state, grade history, and notes. Provides search and status APIs via CLI. | `state_management`, `design_patterns` |
| [[teaching-skills]] | Core teaching and learning skills. The professor skill orchestrates full teach-review-quiz cycles with handoff document generation. The professor-teach skill handles single-concept micro-lessons invoked inline by other skills. | `design_patterns`, `state_management` |
| [[utilities]] | Shared utility module providing file I/O (JSON and markdown with frontmatter), date math, CLI argument parsing, and atomic write operations used by all scripts. | `file_descriptor` |
