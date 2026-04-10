# Phase 3: Design Whiteboard & Dynamic Concept Management

## Date
2026-04-09

## Status
Ready for brainstorming

## Spec Reference
This document captures all decisions from the Phase 3 design conversation. It builds on Phase 2 (complete, merged, 90 tests passing, plugin v2.0.0).

## Overview

Transform claude-professor from a backend-specialized teaching tool into a domain-agnostic solutions architect with integrated teaching. Replace the fixed concept registry model with dynamic concept management. Add a structured design conversation flow with requirements elicitation, HLD/LLD progression, and design document output.

### What Changes

| Phase 2 | Phase 3 |
|---------|---------|
| `/backend-architect` (backend-only) | `/whiteboard` (domain-agnostic, project-aware) |
| `/professor` (batch upfront teaching) | Retired — lazy teaching in `/whiteboard` supersedes |
| `knowledge-agent` (registry-dependent) | Retired — whiteboard does concept identification inline |
| Fixed concept registry (172 concepts, gatekeeper) | Seed registry (400-500 concepts, bootstrapping reference) + dynamic creation |
| Flat concept list | Two-level hierarchy (level 1 architectural + level 2 implementation) |
| 17 domains | 25-30 domains |
| Concept files: basic frontmatter | Concept files: enriched with aliases, scope_note, related_concepts, parent_concept |

### What's Unchanged

| Component | Status |
|-----------|--------|
| `/professor-teach` | Kept, minor updates (receives FSRS status, writes markdown body) |
| `/analyze-architecture` | Kept, minor update (outputs project domain scope) |
| `fsrs.js` | Unchanged |
| `session.js` | Unchanged |
| `graph.js` | Unchanged |
| `detect-changes.js` | Unchanged |
| `migrate-v2.js` | Unchanged |
| FSRS-5 algorithm | Unchanged — stability, difficulty, retrievability work exactly as Phase 1/2 |
| Storage format | Markdown with JSON frontmatter (same approach, more fields) |

---

## 1. Vision & Motivation

### Why This Phase

Phase 2's `/backend-architect` is insufficient for projects that span multiple domains. A RAG application on AWS involves backend, AI/ML, cloud infrastructure, information retrieval, and databases — the backend-only skill can't address AI or cloud concerns. The fixed concept registry of 172 concepts can't keep up with the breadth of SWE knowledge.

### Design Principles

- **Think like an architect, talk like a professor.** Design quality from the architect framing. Communication style (analogies, checking understanding, explaining why) from the professor framing.
- **Teach in context, not in advance.** Concepts are taught when they're relevant to a design decision, not in a batch before work begins.
- **The user's profile is the living knowledge graph.** The seed registry bootstraps it, the concept agent grows it, FSRS tracks it.
- **Conversation structure guarantees prerequisites.** Level 1 concepts surface during HLD; level 2 during LLD. No machinery needed for prerequisite checking.
- **Plugin, not platform.** Every piece of machinery earns its place. Avoid over-engineering for a Claude Code plugin.

---

## 2. Skill: `/whiteboard`

### Frontmatter

```yaml
name: whiteboard
description: >
  Domain-agnostic solutions architect with integrated concept teaching.
  Conducts design conversations for new features or greenfield projects.
  Proposes designs, debates tradeoffs, teaches concepts when gaps are
  detected, and produces design documents. Use when planning any
  technical feature or system.
disable-model-invocation: true
argument-hint: "[feature/project description] [--continue]"
model: sonnet
```

### Persona

You are the Professor — a solutions architect who designs systems and teaches as you go. You think in tradeoffs, failure modes, and scale. You explain in analogies, examples, and first principles. When you detect a knowledge gap, you teach it before building on it. You never assume the developer understands something just because they haven't asked about it. You never write code.

When discussing architectural concerns, always name the specific technical patterns or concepts involved — this ensures each concept can be checked against the developer's knowledge profile.

When the developer states something technically incorrect, correct it directly with a brief explanation. Don't route factual corrections through concept checking — that's for knowledge gaps, not misconceptions.

### Conversation Flow

```
Phase 0: Context Loading
  - Load architecture doc (docs/professor/architecture/) or lightweight scan
  - Load project domain scope (relevant domains + tech stack)

Phase 1: Requirements
  1.1  Generate candidate requirements list
       - Fixed list of 12-15 architectural concerns:
         functional requirements, scale/load, latency, data model,
         consistency model, auth, failure handling, deployment,
         observability, security, data lifecycle/retention,
         migration/rollback, cost constraints, external dependencies,
         compliance/regulatory
       - Filter to 5-8 relevant to this task

  1.2  Infer existing answers from architecture docs
       - For each candidate, check if architecture docs provide
         a constraint or existing decision

  1.3  Present to user
       - Show filtered requirements with architecture-inferred
         context as constraints (not FYI — constraints are premises)
       - User selects which to discuss (A-F)
       - User can say "skip to design" at any point

  1.4  Whiteboard identifies level 1 concept candidates for
       selected requirements (architectural reasoning)
       -> batch call concept agent (single subagent spawn)
       -> returns resolved IDs + FSRS status

  1.5  For each selected requirement:
       a. Professor-teach (foreground subagent) for weak/new concepts
       b. Present architecture constraint as premise
       c. Clarify requirement with user
       d. If user's answer reveals new concept -> incremental
          concept agent call -> professor-teach if needed
       e. Record decision + taught concepts in session state

Phase 2: HLD
  2.1  Propose 2-3 design options with tradeoffs
       - Lead with recommendation
       - Name all technical concepts involved

  2.2  User reviews
       - Approves -> proceed
       - Counter-proposal:
         Round 1: medium critique with specific failure scenarios
         Round 2+: light pushback
         If concept gap -> professor-teach, then revisit
         If user persists -> record risk in design doc with
         probing instructions for implementation
       - Dangerous choices:
         Round 1: heavy critique (specific failure scenarios)
         Round 2: medium (offer mitigation)
         Round 3+: record risk, proceed

  2.3  HLD approved
  2.4  User chooses: "dive deeper" or "write it up as-is"

Phase 3: LLD (only if user opts in)
  3.1  For each HLD component needing LLD detail:
       a. Whiteboard discusses implementation specifics
          -> level 2 concepts arise naturally
       b. Incremental concept agent call (1-3 concepts)
          -> resolves, creates new level 2 with parent set
       c. Professor-teach for weak/new concepts
       d. If parent level 1 wasn't covered in session
          (check session state), teach parent first
          -- prompt instruction, not systemic mechanism
       e. Discuss implementation details
       f. User approves component design

Phase 4: Deliverable
  4.1  Write design doc to docs/professor/designs/
  4.2  Update FSRS scores for any inline reviews
  4.3  Cleanup session state
  4.4  Suggest /analyze-architecture --update if design
       adds new components
```

### Design Document Template

```markdown
# Design: {Feature Name}

## Date
{ISO timestamp}

## Status
Proposed

## Original Request
{Verbatim developer request}

## Architecture Context
{Current system summary. Components affected. Constraints.}

## Requirements
### Functional
- {requirement}

### Non-Functional
- Scale: {expected load}
- Latency: {acceptable response time}
- Reliability: {uptime}
- Security: {concerns}

## Design
### Overview
{2-3 paragraph summary}

### Component Changes
- **{component}**: {changes and why}
- **{new component}** (new): {purpose}

### Data Flow
{Mermaid diagram}

### Key Decisions
| Decision | Chosen | Over | Reasoning |
|----------|--------|------|-----------|

### Edge Cases & Failure Modes
- {case}: {handling}

### Risk Records
- {risk from critique round}: {developer's reasoning}
  - Probing instruction: {what to verify during implementation}

## Concepts Covered
- `{id}`: {status} -- grade: {1-4}, {one-line summary}

## Concepts to Explore During Implementation
- `{id}`: {why relevant but not covered}

## Migration & Rollback
- {steps}

## Observability
- {what to monitor, key metrics, alerting}
```

### Developer Controls

- **"Skip"** -- skip current concept or requirement
- **"Skip to design"** -- jump from requirements to HLD
- **"Stop" / "End session"** -- save scores, write partial design doc, preserve session state for --continue
- **"I already know this"** during teaching -- grade as Again(1), mark for future review

### Resume Flow

`--continue` reads `.session-state.json`. If session exists and < 24 hours old, resume from recorded phase. If > 24 hours, warn and offer fresh start. Previously checked concepts not re-checked.

---

## 3. Agent: concept-agent

### Purpose

Manages the concept graph. Resolves concept candidates against the user's existing profile + seed registry. Creates new level 2 concepts with full metadata. Returns resolved IDs + FSRS status. Does NOT teach, does NOT interact with the user.

### Frontmatter

```yaml
name: concept-agent
description: >
  Concept resolution and creation agent. Resolves concept candidates
  against user profile and seed registry. Creates new concepts with
  metadata. Returns resolved IDs and FSRS status.
tools: Read, Bash
model: sonnet
```

### Input

Receives from whiteboard: a list of concept candidates with context (the requirement or design discussion they arose from), and the relevant domains to search.

### Resolution Flow

For each candidate concept:

1. **Exact ID match** -- run `lookup.js reconcile --mode exact` against user profile + seed registry. If match -> return ID + FSRS status. (Deterministic, script)

2. **Alias match** -- run `lookup.js reconcile --mode alias` against user profile + seed registry. If match -> return canonical ID + FSRS status, add candidate name as new alias via update.js. (Deterministic, script)

3. **Semantic match** -- if no exact or alias match, load existing concept IDs + scope notes from relevant domains via `lookup.js list-concepts`. Judge: "Is this candidate the same as an existing concept?" If yes -> return matched ID + FSRS status, add candidate name as alias. (LLM judgment)

4. **Genuinely new** -- determine parent (which level 1 concept from seed registry). Create concept file immediately via update.js with: concept_id, domain, level: 2, parent_concept, scope_note, aliases, related_concepts, difficulty_tier, FSRS initialized. Return new ID + status "new".

### Creation Rules

- Level 1 concepts are seed-only. Never create level 1 at runtime.
- All new concepts are level 2 with a parent_concept pointing to an existing level 1.
- If no level 1 parent fits, use the closest match in the domain. Flag in scope_note.
- concept_id follows naming convention: lowercase_snake_case, max 3 words.
- scope_note: one sentence stating what distinguishes this concept from its neighbors.
- aliases: alternate names the candidate might go by.
- related_concepts: other concepts in the same domain that are related but distinct.

### Error Handling

| Failure | Behavior |
|---------|----------|
| Script fails | Warn, return candidate as "unresolved" -- whiteboard continues without teaching |
| Semantic match ambiguous | Return top 2 candidates with scope notes -- whiteboard makes final call inline |
| Can't determine parent | Assign to most general level 1 in the domain, note in scope_note |

---

## 4. Skill: /professor-teach Updates

### Phase 3 Changes

Professor-teach is largely unchanged. Two additions:

1. **Receives FSRS status from whiteboard.** Currently professor-teach runs its own lookup. In Phase 3, whiteboard already has the FSRS status from the concept agent. Pass it as an argument to avoid redundant lookups.

2. **Writes markdown body after teaching.** After grading, professor-teach writes the concept's markdown body with: heading, key points from the explanation, and notes (task context). This enriches the concept file for future semantic matching and Obsidian readability. On subsequent reviews, appends to Notes section.

### Updated Argument Format

```
/claude-professor:professor-teach {concept_id} --context "{task context}" --status "{new|review|skip}" --domain "{domain}"
```

---

## 5. Skill: /analyze-architecture Updates

### Phase 3 Changes

One addition: output a project domain scope file alongside the existing architecture graph.

```
docs/professor/architecture/
  _index.md              # Existing
  components/            # Existing
  data-flow.md           # Existing
  tech-stack.md          # Existing
  concept-scope.json     # NEW
```

### concept-scope.json

```json
{
  "relevant_domains": ["backend", "databases", "ai_ml", "cloud_infrastructure"],
  "tech_stack": ["python", "fastapi", "postgresql", "pgvector", "aws_lambda"],
  "detected_patterns": ["rag_pipeline", "serverless", "rest_api"],
  "generated_from": "analyze-architecture",
  "last_updated": "2026-04-09T14:30:00Z"
}
```

Whiteboard uses this to: inform its system prompt (expertise areas), scope concept agent searches (relevant domains), and present architecture-inferred constraints during requirements.

---

## 6. Two-Level Concept Hierarchy

### Level 1: Architectural Concepts (Seed Registry)

- ~400-500 concepts shipped with the plugin
- parent_concept: null, level: 1
- Stable, append-only (new level 1 added through plugin updates only)
- Cover all 25-30 SWE domains
- Examples: connection_pooling, caching, oauth, rag_pipeline, message_queue, load_balancing

### Level 2: Implementation Concepts (Created On Demand)

- Created by concept agent during design sessions
- parent_concept: "{level_1_id}", level: 2
- Examples: pool_sizing (parent: connection_pooling), chunking_strategy (parent: rag_pipeline), oauth_pkce_flow (parent: oauth)
- Grow organically per user -- only created when encountered

### The Rule

If a concept can be taught independently without first explaining another concept, it's a separate concept (level 1 or level 2 under a different parent). If it only makes sense in the context of a parent concept, it's level 2 under that parent.

### Why Not Deeper

Arbitrary depth creates taxonomy maintenance burden. Two levels map directly to HLD (level 1) and LLD (level 2). The conversation flow guarantees level 1 is covered before level 2 -- no prerequisite checking machinery needed.

---

## 7. Concept File Format (Phase 3)

```markdown
---json
{
  "concept_id": "chunking_strategy",
  "domain": "ai_ml",
  "level": 2,
  "parent_concept": "rag_pipeline",
  "is_seed_concept": false,
  "difficulty_tier": "intermediate",
  "aliases": ["document_chunking", "text_chunking"],
  "related_concepts": ["token_counting", "embedding_models"],
  "scope_note": "Strategies for splitting documents into chunks for retrieval. Distinct from embedding (vectorization) and retrieval ranking (scoring).",
  "first_encountered": "2026-04-10T14:30:00Z",
  "last_reviewed": "2026-04-10T15:00:00Z",
  "review_history": [
    {"date": "2026-04-10T15:00:00Z", "grade": 3, "context": "RAG document Q&A design"}
  ],
  "fsrs_stability": 2.3,
  "fsrs_difficulty": 6.4
}
---

# Chunking Strategy

Strategies for splitting documents into smaller pieces for retrieval in RAG pipelines.

## Key Points
- Chunk size vs. retrieval precision tradeoff
- Overlap between chunks preserves context at boundaries
- Recursive splitting vs. fixed-size windowing
- Metadata preservation (source document, section)

## Notes
Learned in context of designing document Q&A for Novum project.
Used recursive text splitter with 512 token chunks and 50 token overlap.
```

### New Fields (vs Phase 2)

| Field | Type | Purpose |
|-------|------|---------|
| level | 1 or 2 | Hierarchy position |
| parent_concept | string or null | Level 1 parent ID (null for level 1) |
| aliases | string[] | Alternate names for dedup matching |
| related_concepts | string[] | Linked but distinct concepts |
| scope_note | string | One-sentence boundary statement for disambiguation |
| is_seed_concept | boolean | Replaces is_registry_concept (clearer name) |

### Removed Fields (vs Phase 2)

| Field | Reason |
|-------|--------|
| documentation_url | Moved to markdown body (not structured data) |
| is_registry_concept | Renamed to is_seed_concept |

### Backward Compatibility

Existing Phase 2 concept files remain valid. New fields are added on next update.js write. Missing fields treated as defaults: level: 1, parent_concept: null, aliases: [], related_concepts: [], scope_note: "".

---

## 8. Seed Registry Format (Phase 3)

```json
{
  "id": "connection_pooling",
  "domain": "databases",
  "difficulty": "intermediate",
  "level": 1,
  "parent_concept": null,
  "aliases": ["connection_pool", "db_pooling", "pool_connections"],
  "related_concepts": ["database_index", "concurrency_patterns"],
  "scope_note": "Maintaining reusable database connections. Distinct from pool configuration (sizing/timeouts) and external pooler selection (PgBouncer/RDS Proxy)."
}
```

Expanding from 172 concepts with {id, domain, difficulty} to 400-500 concepts with full metadata. Significant authoring effort (estimate: 2-3 days with LLM-assisted drafting + human review).

---

## 9. Domain Expansion

### Current (17 domains)

algorithms, data_structures, databases, networking, security, cloud_infrastructure, devops, frontend, backend, ml_ai, systems, architecture, testing, concurrency, languages, tools, custom

### Proposed Additions (to be finalized during brainstorming)

Candidates: information_retrieval, data_engineering, observability, developer_tooling, mobile, llm_systems, api_design, distributed_systems, authentication (split from security), storage_systems (split from databases)

Target: 25-30 total. Still append-only. Still single domains.json file.

---

## 10. Script Changes

### lookup.js

| Mode | Phase 2 | Phase 3 |
|------|---------|---------|
| search | Keyword search against registry | Search user profile + seed registry |
| status | FSRS status from concept files | Unchanged |
| list-concepts (new) | -- | Extract metadata (IDs, aliases, scope notes) from profile for specified domains |
| reconcile (new) | -- | Deterministic matching: exact ID, alias match. Returns match type + ID or "no match" |

### update.js

| Feature | Phase 2 | Phase 3 |
|---------|---------|---------|
| Write FSRS scores | Yes | Unchanged |
| Create concept files | Basic (id, domain, FSRS) | Full metadata (+ level, parent, aliases, scope_note, related_concepts) |
| Append alias | -- | New --add-alias flag |
| Write markdown body | -- | New --body flag (professor-teach passes teaching content) |
| Append notes | Via --notes | Unchanged |

### utils.js

Support new fields in existing read/write functions. No new functions needed.

---

## 11. Subagent Architecture

### Confirmed Constraints (from Claude Code docs)

1. Foreground subagents CAN interact with users -- permission prompts and AskUserQuestion pass through. Professor-teach interactive teaching is viable.
2. Background subagents CANNOT interact -- professor-teach must run in foreground.
3. Subagents cannot spawn other subagents -- whiteboard orchestrates both concept agent and professor-teach directly. No nesting.

### Spawn Pattern

```
Whiteboard (main conversation, orchestrator)
  +-- Concept agent: 1 batch (Phase 1.4) + 0-3 incremental (Phases 1.5d, 3.1b)
  |   One-shot, returns results, no user interaction
  +-- Professor-teach: 4-8 per session (varies by user knowledge)
      Foreground, interactive with user
      Returns grade + summary to whiteboard

Total: ~6-12 subagent spawns per session
All direct children of whiteboard. No nesting.
```

---

## 12. Retired Components

| Component | Reason | Migration |
|-----------|--------|-----------|
| /professor skill | Superseded by lazy teaching in /whiteboard | Keep in repo, mark deprecated. Users invoke /whiteboard instead. |
| knowledge-agent | Only consumer was /professor | Keep in repo, mark deprecated. |
| Registry-as-gatekeeper model | Replaced by seed-as-bootstrapping + dynamic creation | Seed registry still ships, same file, enriched format. |

---

## 13. Architecture Decisions

| # | Decision | Reasoning |
|---|----------|-----------|
| P3-1 | Single /whiteboard replaces /backend-architect | Domain-agnostic. Project architecture docs inform domain awareness. |
| P3-2 | /professor retired | Lazy teaching during design supersedes batch upfront teaching. |
| P3-3 | knowledge-agent retired | Only consumer was /professor. |
| P3-4 | Plugin name stays claude-professor | Teaching identity still central. |
| P3-5 | "Think like an architect, talk like a professor" | Design quality + pedagogical communication. |
| P3-6 | Two-level concept hierarchy | Level 1 stable architectural. Level 2 implementation on demand. Maps to HLD/LLD. |
| P3-7 | Level 1 is seed-only | Prevents concept pollution. Gaps via plugin updates. |
| P3-8 | Decoupled concept agent | Reusability, focused prompt. Spawned by whiteboard, not nested. |
| P3-9 | Concept resolution includes LLM reasoning | Flexible non-fixed model requires semantic matching for dedup. |
| P3-10 | Concepts created immediately when encountered | Premature session end would lose data otherwise. |
| P3-11 | Seed registry = bootstrapping data | Not a runtime gatekeeper. Quality reference for creation. |
| P3-12 | Domain expansion to 25-30 | Cover AI/ML, cloud, data engineering gaps. |
| P3-13 | Related concepts not checked as prerequisites | Lazy checking when they arise in conversation. |
| P3-14 | No parent prerequisite machinery | Conversation flow guarantees HLD before LLD. |
| P3-15 | Requirements as selectable list with architecture constraints | Biggest token saver. User controls session scope. |
| P3-16 | Fixed candidate list (12-15) filtered dynamically (5-8) | Coverage without exhaustion. |
| P3-17 | Critique: medium -> light -> record (normal) | Respect autonomy. Design doc is safety net. |
| P3-18 | Critique: heavy -> medium -> record (dangerous) | Failure scenarios first. Probing instructions for implementation. |
| P3-19 | No depth control config for Phase 3 | User controls depth via selection + skip. Add later if needed. |
| P3-20 | Web search limited to teaching + design | Not in concept resolution. |
| P3-21 | No self-healing concept graph | Get creation right, don't build error correction. |
| P3-22 | Separate concepts for different knowledge (not depth tags) | Level 2 concepts have own FSRS. No depth tags on reviews. |
| P3-23 | Professor-teach writes markdown body | Best positioned -- has teaching context. Enriches future semantic matching. |
| P3-24 | Concept agent does semantic matching | Better separation than inline. Incremental calls keep load manageable. |

---

## 14. Open Questions for Brainstorming

1. **Specific new domains to add.** Which of the candidates? Any missing? How many total?
2. **Seed registry authoring strategy.** LLM-generate drafts per domain, then human review? Ordering and quality bar?
3. **Whiteboard prompt structure.** Single SKILL.md or supporting files per phase? The prompt is heavy.
4. **Concept agent prompt design.** Examples for each resolution step. Edge cases.
5. **Testing strategy.** New tests for concept resolution. Integration tests for full flow.
6. **Migration from Phase 2.** Existing concept files missing new fields. Deprecated skills. README rewrite.
7. **Implementation ordering.** Dependencies, parallelization, gates.
8. **Professor-teach interactive confirmation.** Empirical test of foreground subagent interactivity before building full flow.

---

## 15. Implementation Scope Estimate

| Component | Effort | Risk |
|-----------|--------|------|
| /whiteboard skill | Large | Prompt complexity, session management |
| Concept agent | Medium | Semantic matching reliability |
| Seed registry enrichment (172 -> 400-500) | Large | Quality of scope notes and aliases |
| Domain expansion | Small | Picking right granularity |
| lookup.js new modes | Medium | Backward compatibility |
| update.js new fields | Small | Backward compatibility |
| /professor-teach updates | Small | None |
| /analyze-architecture update | Small | None |
| README rewrite | Medium | Accuracy |
| Testing | Medium | Coverage of edge cases |

---

## 16. References

- Phase 1 spec: docs/superpowers/specs/2026-04-06-claude-professor-design.md
- Phase 2 spec: docs/superpowers/specs/2026-04-06-phase2-architecture-design-design.md
- Phase 2 implementation plan: docs/superpowers/plans/2026-04-06-phase2-architecture-design.md
- FSRS-5 algorithm: https://expertium.github.io/Algorithm.html
- Claude Code subagent docs: https://code.claude.com/docs/en/sub-agents
- Claude Code skills docs: https://code.claude.com/docs/en/skills
