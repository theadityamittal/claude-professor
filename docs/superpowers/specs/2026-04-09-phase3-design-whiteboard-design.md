# Phase 3: Design Whiteboard & Dynamic Concept Management

## Date
2026-04-09

## Status
Approved — ready for implementation planning

## Spec Reference
Builds on Phase 2 (complete, merged, 90 tests passing, plugin v2.0.0). Supersedes the draft at `phase3-design-whiteboard-spec.md` with all brainstorming decisions incorporated.

---

## 1. Vision & Motivation

### Why This Phase

Phase 2's `/backend-architect` is insufficient for projects spanning multiple domains. A RAG application on AWS involves backend, AI/ML, cloud infrastructure, information retrieval, and databases — the backend-only skill can't address AI or cloud concerns. The fixed concept registry of 172 concepts can't keep up with the breadth of SWE knowledge.

### Design Principles

- **Think like an architect, talk like a professor.** Design quality from the architect framing. Communication style (analogies, checking understanding, explaining why) from the professor framing.
- **Teach in context, not in advance.** Concepts are taught when relevant to a design decision, not in a batch before work begins.
- **The user's profile is the living knowledge graph.** The seed registry bootstraps it, the concept agent grows it, FSRS tracks it.
- **Conversation structure guarantees prerequisites.** Level 1 concepts surface during HLD; level 2 during LLD. No machinery needed for prerequisite checking.
- **A concept lives in the domain where the design decision is made.** Dedup principle for cross-domain concepts.
- **Plugin, not platform.** Every piece of machinery earns its place.

### What Changes

| Phase 2 | Phase 3 |
|---------|---------|
| `/backend-architect` (backend-only) | `/whiteboard` (domain-agnostic, project-aware) |
| `/professor` (batch upfront teaching) | Retired — lazy teaching in `/whiteboard` supersedes |
| `knowledge-agent` (registry-dependent) | Retired — concept-agent does resolution + creation |
| Fixed concept registry (172 concepts, gatekeeper) | Seed registry (407 L1 concepts, bootstrapping reference) + dynamic L2 creation |
| Flat concept list | Two-level hierarchy (L1 architectural + L2 implementation) |
| 17 domains in `domains.json` | 18 research-backed domains as markdown files in `data/domains/` |
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
| `migrate-v2.js` | Unchanged (Phase 2 migration, kept for history) |
| FSRS-5 algorithm | Unchanged — stability, difficulty, retrievability work exactly as Phase 1/2 |
| Storage format | Markdown with JSON frontmatter (same approach, more fields) |

---

## 2. Domain Taxonomy

### Overview

18 domains derived from cross-referencing SWEBOK v4, ACM CS2023, DDIA, system design interview frameworks, and MIT/Stanford/CMU curricula. Each domain is a permanent, recognized SWE knowledge area with 13-30 L1 seed concepts.

### Domain List

| # | Domain ID | Display Name | L1 Count |
|---|-----------|-------------|----------|
| 1 | `algorithms_data_structures` | Algorithms & Data Structures | 29 |
| 2 | `architecture` | Software Architecture & Design | 27 |
| 3 | `distributed_systems` | Distributed Systems | 26 |
| 4 | `databases` | Data Storage & Management | 28 |
| 5 | `operating_systems` | Operating Systems | 19 |
| 6 | `networking` | Computer Networks | 16 |
| 7 | `security` | Security & Cryptography | 28 |
| 8 | `testing` | Software Testing & QA | 23 |
| 9 | `concurrency` | Concurrency & Parallelism | 23 |
| 10 | `machine_learning` | AI & Machine Learning | 30 |
| 11 | `programming_languages` | Programming Languages & Type Systems | 22 |
| 12 | `api_design` | API Design & Integration | 21 |
| 13 | `reliability_observability` | Reliability & Observability | 24 |
| 14 | `performance_scalability` | Performance & Scalability | 15 |
| 15 | `data_processing` | Data Processing & Pipelines | 19 |
| 16 | `devops_infrastructure` | DevOps & Infrastructure | 26 |
| 17 | `frontend` | Frontend Engineering | 18 |
| 18 | `software_construction` | Software Construction | 13 |
| | **Total** | | **407** |

### Domain Format

Domains stored as markdown files in `data/domains/` (replaces `domains.json`).

```markdown
---json
{
  "domain_id": "distributed_systems",
  "display_name": "Distributed Systems",
  "aliases": ["distributed computing", "distributed architecture"],
  "related_domains": ["networking", "concurrency", "databases", "reliability_observability"],
  "concept_count": 26
}
---

# Distributed Systems

Design and reasoning about systems spanning multiple networked computers.
Consensus, replication, partitioning, failure modes, and consistency models.

## Boundary
- Consensus protocols, CRDTs, vector clocks, sagas → here
- TCP/IP, DNS, HTTP → networking
- Thread-level parallelism, async/await → concurrency
- Database replication/sharding mechanics → databases
- Circuit breakers, fault tolerance → reliability_observability
```

### Domain File Fields

| Field | Type | Purpose |
|-------|------|---------|
| domain_id | string | Snake_case identifier, matches filename |
| display_name | string | Human-readable name for user-facing output |
| aliases | string[] | Natural language variants for matching |
| related_domains | string[] | Domains the concept-agent should also search |
| concept_count | number | Current L1 concept count |

### Domain Boundary Section

Each domain file includes a `## Boundary` section that tells the concept-agent where domain edges are. Format: `- {concepts} → {domain}` for concepts that might seem to belong here but live elsewhere.

### Migration from Phase 2 Domains

| Current Domain | Action |
|---------------|--------|
| `algorithms` | Merged → `algorithms_data_structures` |
| `data_structures` | Merged → `algorithms_data_structures` |
| `systems` | Renamed → `operating_systems` |
| `ml_ai` | Renamed → `machine_learning` |
| `backend` | Retired → concepts redistributed to architecture, api_design, distributed_systems, reliability_observability, performance_scalability |
| `languages` | Renamed → `programming_languages` |
| `tools` | Retired → concepts to `software_construction` |
| `custom` | Retired → user concepts to closest matching domain |
| `cloud_infrastructure` | Merged → `devops_infrastructure` |
| All others | Kept (name unchanged) |

New domains (no Phase 2 predecessor): `api_design`, `reliability_observability`, `performance_scalability`, `data_processing`, `software_construction`, `distributed_systems`

---

## 3. Seed Concept Registry

### Overview

407 L1 seed concepts shipped with the plugin, organized by domain. Each concept includes a scope_note for disambiguation, aliases for matching, and difficulty tier.

### Granularity Rule

**L1 = a concept you'd draw as a box on an architecture whiteboard or discuss as a design decision.**

- Too broad: `cryptography` (covers 5+ independent concepts)
- Right level: `symmetric_encryption`, `public_key_cryptography`, `hash_functions`
- Too narrow: `aes_256`, `rsa_2048` (specific implementations = L2)

### Dedup Principle

**A concept lives in the domain where the design decision is made.** When a concept appears relevant to multiple domains, assign it to the domain where an architect would first encounter it as a decision point.

Examples:
- `circuit_breaker` → reliability_observability (resilience decision), not architecture
- `event_sourcing` → architecture (persistence architecture), not distributed_systems
- `load_balancing` → performance_scalability (scaling decision), not networking

### Seed Registry Format

The seed registry JSON mirrors the concept file frontmatter structure (minus FSRS/review fields). This enables clean initialization: creating a user profile file from seed data = copy seed fields + add FSRS defaults.

```json
{
  "concept_id": "consensus",
  "domain": "distributed_systems",
  "difficulty_tier": "advanced",
  "level": 1,
  "parent_concept": null,
  "is_seed_concept": true,
  "aliases": ["distributed consensus", "consensus protocol"],
  "related_concepts": ["leader_election", "quorum", "replication"],
  "scope_note": "Agreement among distributed nodes on a single value or decision (Paxos, Raft); distinct from leader_election which is one application of consensus."
}
```

### Seed Registry Fields

| Field | Type | Purpose |
|-------|------|---------|
| concept_id | string | Snake_case, max 3 words |
| domain | string | Primary domain (dedup resolved) |
| difficulty_tier | string | beginner / intermediate / advanced |
| level | number | Always 1 for seed concepts |
| parent_concept | null | Always null for L1 |
| is_seed_concept | boolean | Always true in seed registry |
| aliases | string[] | Alternate names for matching |
| related_concepts | string[] | Linked but distinct concepts |
| scope_note | string | One-sentence boundary statement |

Fields intentionally shared with concept file frontmatter: concept_id, domain, difficulty_tier, level, parent_concept, is_seed_concept, aliases, related_concepts, scope_note. Fields only in user profile files (not in seed): first_encountered, last_reviewed, review_history, fsrs_stability, fsrs_difficulty, status.

### Seed Registry vs User Profile

| Concern | Seed Registry (JSON) | User Profile (.md files) |
|---------|---------------------|-------------------------|
| Purpose | Plugin reference catalog for concept-agent matching | Living knowledge graph with FSRS tracking |
| Location | `data/concepts_registry.json` | `~/.claude/professor/concepts/{domain}/` |
| Content | 407 L1 definitions (id, aliases, scope_note) | FSRS scores, review history, teaching notes |
| Mutability | Append-only via plugin updates | Updated every session |
| Created by | Plugin author | Professor-teach (on first teach) or concept-agent (parent creation) |

### Concept Count by Domain

See Section 2 domain list for per-domain counts. The full concept list is generated during implementation from research agent outputs, with each concept validated against the dedup principle and domain boundary definitions.

---

## 4. Two-Level Concept Hierarchy

### Level 1: Architectural Concepts (Seed Registry)

- 407 concepts shipped with the plugin
- parent_concept: null, level: 1
- Stable, append-only (new L1 added through plugin updates only)
- Cover all 18 SWE domains
- Examples: `consensus`, `caching_strategies`, `oauth2`, `retrieval_augmented_gen`, `load_balancing`

### Level 2: Implementation Concepts (Created On Demand)

- Created by concept-agent during design sessions
- parent_concept: "{level_1_id}", level: 2
- Examples: `pool_sizing` (parent: `connection_pooling`), `chunking_strategy` (parent: `retrieval_augmented_gen`), `oauth_pkce_flow` (parent: `oauth2`)
- Grow organically per user — only created when encountered

### The Rule

If a concept can be taught independently without first explaining another concept, it's a separate concept (level 1 or level 2 under a different parent). If it only makes sense in the context of a parent concept, it's level 2 under that parent.

### Why Not Deeper

Arbitrary depth creates taxonomy maintenance burden. Two levels map directly to HLD (level 1) and LLD (level 2). The conversation flow guarantees level 1 is covered before level 2 — no prerequisite checking machinery needed.

### Concept Lifecycle & User Profile File Creation

User profile files (`~/.claude/professor/concepts/{domain}/{id}.md`) are the knowledge graph. A concept without a profile file is not tracked. File creation happens at two specific moments:

**1. Professor-teach creates files on first teach.**

When professor-teach teaches a concept for the first time, it creates the user profile file from seed registry data + FSRS scores from grading + teaching notes in the markdown body. This is the primary path — files are born with real learning data.

**2. Concept-agent creates parent L1 files when creating L2 children.**

Before creating an L2 file, concept-agent checks: does the parent L1 profile file exist? If not, it creates a minimal L1 file from seed registry data with FSRS defaults (S=0, D=0, review_history=[]). This ensures no orphan L2 — every child has a trackable parent.

### Computed Status (FSRS-Driven)

Status is **never stored** in concept files. It is computed at resolution time from file existence + FSRS state:

```
file exists?
├── NO → seed match (always succeeds via semantic) → "new"
└── YES → read file
    ├── review_history.length === 0 → "encountered_via_child"
    └── review_history.length > 0
        → R = computeRetrievability(S, elapsedDays)
        → determineAction(R)
            ├── R < 0.3  → "teach_new"
            ├── 0.3-0.7  → "review"
            └── R > 0.7  → "skip"
```

| Computed Status | Derivation | Whiteboard Action |
|-----------------|------------|-------------------|
| `new` | No user file, seed match found | Professor-teach teaches. Creates profile file. |
| `encountered_via_child` | File exists, review_history=[] | Professor-teach teaches. FSRS initializes on grade. |
| `teach_new` | File exists, R < 0.3 | Professor-teach re-teaches. FSRS updates. |
| `review` | File exists, 0.3 ≤ R ≤ 0.7 | Professor-teach reviews. FSRS updates. |
| `skip` | File exists, R > 0.7 | No teaching needed. Use in discussion. |

**After professor-teach grades a concept (e.g., GOOD=3):**
- `getInitialStability(3)` → S = 2.3
- `getInitialDifficulty(3)` → D = ~5.7
- `computeRetrievability(2.3, 0)` → R = 1.0 (elapsed = 0)
- `determineAction(1.0)` → `skip`

The concept naturally transitions to `skip` via FSRS. Over time: `skip` → `review` → `teach_new` as R decays. No stored status transitions needed — FSRS is the single source of truth.

**Why no `unresolved` status:** Resolution always succeeds. The concept-agent's 3-step pipeline (exact → alias → semantic match) against 407 L1 concepts with scope notes ensures every legitimate concept candidate maps to a seed concept. Semantic matching (LLM judgment) is the catch-all. Ambiguous matches return top 2 candidates for whiteboard to pick. The only failure mode is a script crash, handled in error handling (warn and continue), not as a resolution status.

### Concept-agent behavior by phase

| Phase | Resolves | Creates L1 files? | Creates L2 files? |
|-------|----------|-------------------|-------------------|
| Phase 1 (Requirements) | L1 only | No — resolve only | No |
| Phase 2 (HLD) | L1 only | No — resolve only | No |
| Phase 3 (LLD) | L1 + L2 | Yes — parent L1 if missing | Yes — new L2 concepts |

During Phase 1/2, concept-agent is read-only. It resolves L1 candidates against seed registry + user profile and returns computed status. Professor-teach handles file creation when teaching.

During Phase 3, concept-agent can write: creating new L2 files and ensuring parent L1 files exist.

---

## 5. Concept File Format (Phase 3)

```markdown
---json
{
  "concept_id": "chunking_strategy",
  "domain": "machine_learning",
  "level": 2,
  "parent_concept": "retrieval_augmented_gen",
  "is_seed_concept": false,
  "difficulty_tier": "intermediate",
  "aliases": ["document_chunking", "text_chunking"],
  "related_concepts": ["tokenization", "retrieval_augmented_gen"],
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

Existing Phase 2 concept files remain valid. New fields added on next update.js write. Missing fields treated as defaults: level: 1, parent_concept: null, aliases: [], related_concepts: [], scope_note: "".

---

## 6. Skill: `/whiteboard`

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

### Skill File Structure

```
skills/whiteboard/
├── SKILL.md              (persona + full conversation flow, 300-400 lines)
├── templates/
│   └── design-doc.md     (design document template)
├── protocols/
│   ├── critique.md       (critique escalation protocol)
│   └── concept-check.md  (concept identification + teaching trigger protocol)
└── examples/
    └── sample-session.md (optional: example flow for prompt grounding)
```

SKILL.md references supporting files with markdown links. Claude reads them on demand via the Read tool. Supporting files are NOT subject to the 5,000-token compaction budget — they're read fresh each time.

### Conversation Flow

```
Phase 0: Context Loading
  - Load architecture doc (docs/professor/architecture/) or lightweight scan
  - Load project domain scope (concept-scope.json)

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
       -> batch call concept-agent --mode resolve-only
       -> returns per-concept: resolved ID + computed status
          (new | encountered_via_child | teach_new | review | skip)

  1.5  For each selected requirement:
       a. Check concept statuses for this requirement:
          - skip (R > 0.7): no teaching, use in discussion
          - review (0.3 ≤ R ≤ 0.7): professor-teach reviews
          - encountered_via_child (file, no reviews):
            professor-teach teaches (first teach, FSRS initializes)
          - new (no file, seed match): professor-teach teaches
            (creates profile file, FSRS initializes on grade)
          - teach_new (R < 0.3): professor-teach re-teaches
       b. Present architecture constraint as premise
       c. Clarify requirement with user
       d. If user's answer reveals new concept -> incremental
          concept-agent call (resolve-only) -> professor-teach
          if needed
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
       b. Incremental concept-agent call (1-3 concepts)
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

Stored in `skills/whiteboard/templates/design-doc.md`. Read by Claude during Phase 4.

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

- **"Skip"** — skip current concept or requirement
- **"Skip to design"** — jump from requirements to HLD
- **"Stop" / "End session"** — save scores, write partial design doc, preserve session state for --continue
- **"I already know this"** during teaching — grade as Again(1), mark for future review

### Resume Flow

`--continue` reads `.session-state.json`. If session exists and < 24 hours old, resume from recorded phase. If > 24 hours, warn and offer fresh start. Previously checked concepts not re-checked.

---

## 7. Agent: concept-agent

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

Receives from whiteboard: a list of concept candidates with context (the requirement or design discussion they arose from), the relevant domains to search (from domain files' `related_domains`), and a mode flag.

```
concept-agent --mode resolve-only --candidates [...] --domains [...]   # Phase 1/2
concept-agent --mode resolve-or-create --candidates [...] --domains [...] # Phase 3
```

### Resolution Flow (both modes)

For each candidate concept:

1. **Exact ID match** — run `lookup.js reconcile --mode exact` against user profile + seed registry. If match → return ID + status + FSRS data. (Deterministic, script)

2. **Alias match** — run `lookup.js reconcile --mode alias` against user profile + seed registry. If match → return canonical ID + status + FSRS data, add candidate name as new alias via update.js. (Deterministic, script)

3. **Semantic match** — if no exact or alias match, load existing concept IDs + scope notes from relevant domains via `lookup.js list-concepts`. Judge: "Is this candidate the same as an existing concept?" If yes → return matched ID + status + FSRS data, add candidate name as alias. (LLM judgment)

4. **Semantic match is the catch-all.** With 407 L1 concepts and scope notes, semantic matching always produces a best match. If ambiguous, return top 2 candidates with scope notes — whiteboard makes the final call inline. In `resolve-or-create` mode (Phase 3), if the candidate is genuinely new (not an existing concept), proceed to L2 creation (see below).

### Resolution Return States

Resolution always succeeds (exact → alias → semantic match against 407 L1 seed concepts). The returned status is computed from user profile file state + FSRS:

| User Profile State | Computed Status | Whiteboard Action |
|--------------------|-----------------|-------------------|
| No file exists | `new` | Professor-teach teaches. Creates profile file. FSRS initializes on grade. |
| File exists, review_history=[] | `encountered_via_child` | Professor-teach teaches (first teach). FSRS initializes on grade. |
| File exists, R < 0.3 | `teach_new` | Professor-teach re-teaches. FSRS updates S and D. |
| File exists, 0.3 ≤ R ≤ 0.7 | `review` | Professor-teach reviews. FSRS updates S and D. |
| File exists, R > 0.7 | `skip` | No teaching needed. Use concept in design discussion. |

`new` and `encountered_via_child` both result in professor-teach being called. The distinction enables messaging: "Let me introduce X" vs "We encountered X through Y — let's cover it properly."

### L2 Creation (resolve-or-create mode only)

When a genuinely new concept is identified during Phase 3 (LLD):

1. Determine parent (which level 1 concept from seed registry is closest).
2. **Ensure parent L1 profile file exists.** Check user profile for parent L1 file. If missing, create it from seed registry data with status `encountered_via_child` and FSRS defaults (stability: 0, difficulty: 0). This prevents orphan L2 files.
3. Create L2 concept file via update.js with: concept_id, domain, level: 2, parent_concept, scope_note, aliases, related_concepts, difficulty_tier, status: "new", FSRS initialized.
4. Return new ID + status "new".

### Creation Rules

- Level 1 concepts are seed-only. Never create new L1 concepts at runtime.
- L1 profile files are created by professor-teach (on first teach) or by concept-agent (when ensuring parent exists for L2 child).
- All new concepts created by concept-agent are level 2 with a parent_concept pointing to an existing level 1.
- If no level 1 parent fits, use the closest match in the domain. Flag in scope_note.
- concept_id follows naming convention: lowercase_snake_case, max 3 words.
- scope_note: one sentence stating what distinguishes this concept from its neighbors.
- aliases: alternate names the candidate might go by.
- related_concepts: other concepts in the same domain that are related but distinct.

### Error Handling

| Failure | Behavior |
|---------|----------|
| Script fails | Warn, skip concept — whiteboard continues without teaching this concept |
| Semantic match ambiguous | Return top 2 candidates with scope notes — whiteboard makes final call inline |
| Can't determine parent | Assign to most general level 1 in the domain, note in scope_note |

---

## 8. Skill Updates

### /professor-teach

Two additions:

1. **Receives FSRS status from whiteboard.** Currently professor-teach runs its own lookup. In Phase 3, whiteboard already has the FSRS status from the concept-agent. Pass it as an argument to avoid redundant lookups.

2. **Writes markdown body after teaching.** After grading, professor-teach writes the concept's markdown body with: heading, key points from the explanation, and notes (task context). This enriches the concept file for future semantic matching and Obsidian readability. On subsequent reviews, appends to Notes section.

Updated argument format:
```
/claude-professor:professor-teach {concept_id} --context "{task context}" --status "{new|review|skip}" --domain "{domain}"
```

### /analyze-architecture

One addition: output a project domain scope file alongside the existing architecture graph.

```
docs/professor/architecture/
  _index.md              # Existing
  components/            # Existing
  data-flow.md           # Existing
  tech-stack.md          # Existing
  concept-scope.json     # NEW
```

concept-scope.json:
```json
{
  "relevant_domains": ["architecture", "databases", "machine_learning", "devops_infrastructure"],
  "tech_stack": ["python", "fastapi", "postgresql", "pgvector", "aws_lambda"],
  "detected_patterns": ["retrieval_augmented_gen", "serverless_architecture", "rest"],
  "generated_from": "analyze-architecture",
  "last_updated": "2026-04-09T14:30:00Z"
}
```

Whiteboard uses this to: inform its system prompt (expertise areas), scope concept-agent searches (relevant domains + related_domains from domain files), and present architecture-inferred constraints during requirements.

---

## 9. Script Changes

### lookup.js

| Mode | Phase 2 | Phase 3 |
|------|---------|---------|
| search | Keyword search against registry | Search user profile + seed registry |
| status | FSRS status from concept files | Unchanged |
| list-concepts (new) | — | Extract metadata (IDs, aliases, scope notes) from profile for specified domains |
| reconcile (new) | — | Deterministic matching: exact ID, alias match. Returns match type + ID or "no match" |

### update.js

| Feature | Phase 2 | Phase 3 |
|---------|---------|---------|
| Write FSRS scores | Yes | Unchanged |
| Create concept files | Basic (id, domain, FSRS) | Full metadata (+ level, parent, aliases, scope_note, related_concepts) |
| Append alias | — | New --add-alias flag |
| Write markdown body | — | New --body flag (professor-teach passes teaching content) |
| Append notes | Via --notes | Unchanged |

### utils.js

Support new fields in existing read/write functions. No new functions needed.

---

## 10. Subagent Architecture

### Confirmed Constraints (from Claude Code docs)

1. Foreground subagents CAN interact with users — permission prompts and AskUserQuestion pass through. Professor-teach interactive teaching is viable.
2. Background subagents CANNOT interact — professor-teach must run in foreground.
3. Subagents cannot spawn other subagents — whiteboard orchestrates both concept-agent and professor-teach directly. No nesting.

### Spawn Pattern

```
Whiteboard (main conversation, orchestrator)
  +-- Concept-agent: 1 batch (Phase 1.4) + 0-3 incremental (Phases 1.5d, 3.1b)
  |   One-shot, returns results, no user interaction
  +-- Professor-teach: 4-8 per session (varies by user knowledge)
      Foreground, interactive with user
      Returns grade + summary to whiteboard

Total: ~6-12 subagent spawns per session
All direct children of whiteboard. No nesting.
```

---

## 11. Migration Strategy

### Approach: Hardcoded Deterministic Mapping (migrate-v3.js)

All Phase 2 data is deterministic — no dynamic L2 concepts exist yet. The migration script handles:

1. **Domain directory moves** — move concept files from retired domain directories to their new homes based on a hardcoded concept→domain mapping.

2. **Domain renames** — rename directories: `systems/` → `operating_systems/`, `ml_ai/` → `machine_learning/`, `languages/` → `programming_languages/`

3. **Domain merges** — merge `algorithms/` + `data_structures/` → `algorithms_data_structures/`, merge `cloud_infrastructure/` → `devops_infrastructure/`

4. **Backend redistribution** — each concept currently in `backend/` gets a hardcoded target domain (e.g., `rest_api` → `api_design`, `circuit_breaker` → `reliability_observability`, `event_sourcing` → `architecture`)

5. **Field enrichment** — on move, add new fields with defaults: level: 1, parent_concept: null, aliases: [], related_concepts: [], scope_note: "", is_seed_concept: true (rename from is_registry_concept)

6. **Custom domain handling** — if user has concepts in `custom/`, attempt to match concept_id against seed registry for domain assignment. Unmatched concepts stay in a `_unmapped/` directory with a warning.

7. **domains.json replacement** — generate `data/domains/` markdown files from the new taxonomy. Remove `domains.json`.

8. **Idempotent** — safe to run multiple times. Skips already-migrated concepts.

### Backend Concept Redistribution Map

Built during implementation by matching each existing `backend` concept_id against the seed registry. Unmapped concepts assigned to closest domain by scope_note analysis.

---

## 12. Retired Components

| Component | Reason | Migration |
|-----------|--------|-----------|
| /professor skill | Superseded by lazy teaching in /whiteboard | Keep in repo, mark deprecated with note pointing to /whiteboard |
| knowledge-agent | Replaced by concept-agent | Keep in repo, mark deprecated |
| domains.json | Replaced by data/domains/ markdown files | Removed by migrate-v3.js |
| Registry-as-gatekeeper model | Replaced by seed-as-bootstrapping + dynamic creation | Seed registry still ships, enriched format |

---

## 13. Architecture Decisions

| # | Decision | Reasoning |
|---|----------|-----------|
| P3-1 | Single /whiteboard replaces /backend-architect + /professor | Domain-agnostic. Lazy teaching during design supersedes batch upfront. |
| P3-2 | 18 research-backed domains (from SWEBOK, ACM CS2023, DDIA, university curricula) | Maximum coverage and generalization. Permanent SWE knowledge categories. |
| P3-3 | Domains as markdown files with boundary definitions | Self-documenting, concept-agent uses boundary sections for scoping. |
| P3-4 | 407 L1 seed concepts with scope notes and aliases | Comprehensive bootstrap. Scope notes prevent concept-agent misclassification. |
| P3-5 | Dedup: concept lives where design decision is made | Prevents cross-domain duplicates. Maps to HLD decision points. |
| P3-6 | L1 granularity = whiteboard box / design decision | Not too broad (cryptography), not too narrow (aes_256). |
| P3-7 | Two-level hierarchy (L1 seed, L2 dynamic) | Maps to HLD/LLD. No prerequisite machinery needed. |
| P3-8 | Level 1 is seed-only | Prevents concept pollution. Gaps filled via plugin updates. |
| P3-9 | Plugin name stays claude-professor | Teaching identity still central. |
| P3-10 | "Think like an architect, talk like a professor" | Design quality + pedagogical communication. |
| P3-11 | Decoupled concept-agent | Reusability, focused prompt. Spawned by whiteboard, not nested. |
| P3-12 | Concept resolution includes LLM semantic matching | Flexible non-fixed model requires semantic matching for dedup. |
| P3-13 | Concepts created immediately when encountered | Premature session end would lose data otherwise. |
| P3-14 | Seed registry = bootstrapping data, not gatekeeper | Dynamic L2 creation enables open-ended concept coverage. |
| P3-15 | Retire backend, languages, tools, custom domains | Not permanent SWE knowledge domains. Redistributed to proper homes. |
| P3-16 | Merge algorithms + data_structures | Treated as one discipline by all academic sources. |
| P3-17 | Merge cloud_infrastructure into devops_infrastructure | Cloud primitives are infrastructure concerns. |
| P3-18 | Rename systems → operating_systems, ml_ai → machine_learning | Clarity and permanence. |
| P3-19 | SKILL.md + reference files (Option C) | Full flow in one file for model context. Templates/protocols loaded on demand via Read. |
| P3-20 | Hardcoded migration (migrate-v3.js) | All Phase 2 data is deterministic. No dynamic concepts exist yet. |
| P3-21 | Requirements as selectable list with architecture constraints | Biggest token saver. User controls session scope. |
| P3-22 | Critique: medium → light → record (normal) | Respect autonomy. Design doc is safety net. |
| P3-23 | Critique: heavy → medium → record (dangerous) | Failure scenarios first. Probing instructions for implementation. |
| P3-24 | Professor-teach writes markdown body | Best positioned — has teaching context. Enriches future semantic matching. |
| P3-25 | Concept-agent does semantic matching | Better separation than inline. Incremental calls keep load manageable. |
| P3-26 | Related concepts not checked as prerequisites | Lazy checking when they arise in conversation. |
| P3-27 | No parent prerequisite machinery | Conversation flow guarantees HLD before LLD. |
| P3-28 | Seed registry JSON mirrors concept file frontmatter structure | Enables clean file initialization: copy seed fields + add FSRS defaults. |
| P3-29 | Concept-agent is read-only during Phase 1/2, can write during Phase 3 | Phase 1/2 = L1 resolution only. Phase 3 = L2 creation + parent L1 ensure. |
| P3-30 | Professor-teach creates L1 profile files on first teach | Files born with real learning data (grade, teaching notes), not empty shells. |
| P3-31 | Concept-agent creates parent L1 files only when creating L2 children | Prevents orphan L2 files. Parent has S=0, D=0, review_history=[] — FSRS treats as teach_new next session. |
| P3-32 | Status is computed from FSRS, never stored | 5 statuses derived from file existence + review_history + retrievability. FSRS is single source of truth. |
| P3-33 | No `unresolved` status — resolution always succeeds | 407 L1 concepts with semantic matching ensures every candidate maps. Ambiguous matches return top 2 for whiteboard to pick. |

---

## 14. Risk Items

| Risk | Mitigation |
|------|-----------|
| Foreground subagent interactivity (professor-teach) not verified empirically | Test in isolation before building full whiteboard flow |
| Semantic matching reliability in concept-agent | Scope notes + boundary definitions reduce ambiguity. Fallback: return top 2 candidates for whiteboard to decide. |
| 407-concept seed registry authoring quality | LLM-assisted drafting from research agent outputs + human review pass |
| SKILL.md prompt complexity (~400 lines) | Reference files reduce core prompt. Compaction budget: 5,000 tokens. |
| Migration edge cases for `custom` domain | _unmapped/ directory with warning. Manual resolution. |

---

## 15. Implementation Scope Estimate

| Component | Effort | Dependency |
|-----------|--------|------------|
| Domain markdown files (18 files) | Small | None |
| Seed registry enrichment (172 → 407 concepts) | Large | Domain files |
| migrate-v3.js | Medium | Domain files, seed registry |
| concept-agent | Medium | lookup.js new modes, seed registry |
| lookup.js new modes (list-concepts, reconcile) | Medium | Seed registry format |
| update.js new fields | Small | Concept file format |
| /whiteboard SKILL.md + reference files | Large | concept-agent, professor-teach updates |
| /professor-teach updates | Small | update.js |
| /analyze-architecture update | Small | Domain files |
| Testing | Medium | All components |
| README rewrite | Medium | All components |

---

## 16. References

- Phase 1 spec: docs/superpowers/specs/2026-04-06-claude-professor-design.md
- Phase 2 spec: docs/superpowers/specs/2026-04-06-phase2-architecture-design-design.md
- Phase 2 implementation plan: docs/superpowers/plans/2026-04-06-phase2-architecture-design.md
- Draft spec (superseded): phase3-design-whiteboard-spec.md
- SWEBOK v4: https://www.computer.org/education/bodies-of-knowledge/software-engineering/v4
- ACM CS2023: https://csed.acm.org/knowledge-areas/
- FSRS-5 algorithm: https://expertium.github.io/Algorithm.html
- Claude Code subagent docs: https://code.claude.com/docs/en/sub-agents
- Claude Code skills docs: https://code.claude.com/docs/en/skills
