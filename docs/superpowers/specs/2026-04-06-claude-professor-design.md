# claude-professor: Validated Design Spec

## Date: 2026-04-06

This document is the validated design for claude-professor Phase 1. It is based on `Instruction.md` (the original spec) with corrections applied after review against the Claude Code plugin API documentation and the FSRS-5 algorithm specification.

## What This Document Covers

- All corrections to the original spec
- The validated architecture, data schemas, and implementation order
- Decisions made during the brainstorming review

For the full original spec (architecture decisions log, component specifications, deferred decisions), refer to `Instruction.md`. This document captures only what changed or was clarified.

---

## 1. Architecture Overview

**Unchanged from spec.** Three components with clean boundaries:

| Component | Does | Does NOT |
|-----------|------|----------|
| **Professor Skill** (SKILL.md) | Teaching conversation, spawns agent, MCQ quiz, triggers score updates, writes handoff | Math, file I/O, concept identification |
| **Knowledge Agent** (knowledge-agent.md) | Analyzes task, identifies concepts from registry, runs lookup scripts, returns structured briefing | Teach, interact with user, write handoff |
| **Scripts** (Node.js, zero deps) | FSRS math, file I/O, concept search, score updates | Reasoning, teaching, user interaction |

### Data Flow

```
User describes task
       |
       v
Professor Skill receives task
       |
       v
Professor spawns Knowledge Agent (subagent, one-shot)
       |
       |-- Agent reads: registry, domains (via ${CLAUDE_PLUGIN_ROOT})
       |-- Agent runs: lookup.js search
       |-- Agent runs: lookup.js status
       |
       v
Agent returns structured briefing to Professor
       |
       v
Professor <-> User (interactive teaching loop)
       |    |-- Explain concept -> recall question -> grade answer
       |    |-- Flashcard check -> grade answer
       |    |-- MCQ quiz -> grade selections
       |    |-- (repeats per concept)
       |
       v
Professor runs: update.js (save grades per concept)
       |
       v
Professor writes handoff document to project
```

---

## 2. Corrections from Original Spec

### 2.1 FSRS Algorithm (Critical)

The original spec used an older exponential formula and continuous scores. Corrected to FSRS-5:

| Area | Original Spec | Corrected |
|------|---------------|-----------|
| Retrievability formula | `R = exp(-t/S)` | `R = (1 + 19/81 * t/S)^(-0.5)` (FSRS-5 power function) |
| Parameters | "a, b, c, d" unspecified | w0-w18, 19 parameters with published defaults |
| Score type | 0-1 continuous float | Discrete grades 1-4 (Again/Hard/Good/Easy) |
| Difficulty range | 0-1 | 1-10 (FSRS-5 standard) |
| Initial stability | Not specified | w0-w3 map to grades: Again=0.212, Hard=1.293, Good=2.307, Easy=8.296 days |

### 2.2 Plugin System

| Area | Original Spec | Corrected |
|------|---------------|-----------|
| Marketplace source format | `{"source": "local", "path": "."}` | `"."` (relative path string) |
| Script paths | `node scripts/lookup.js` | `node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js` |
| Install commands (interactive) | `claude plugin marketplace add` | `/plugin marketplace add` |

### 2.3 Schema Changes

| Area | Original Spec | Corrected |
|------|---------------|-----------|
| `review_history` entries | `{"date": "...", "score": 0.8}` | `{"date": "...", "grade": 3}` |
| `fsrs_difficulty` range | 0-1 | 1-10 |
| `difficulty` field name | `difficulty` | `difficulty_tier` (avoids confusion with `fsrs_difficulty`) |

### 2.4 Teaching Flow Clarifications

| Area | Original Spec | Corrected |
|------|---------------|-----------|
| "Explain again" MCQ scoring | Unspecified | Grade as Again(1). No re-quiz. |
| Final grade per concept | Single score | Lower of recall question grade + MCQ grade |
| Testing framework | Custom `run_tests.js` | `node:test` (built-in, zero dependencies) |
| Concept registry generation | Not specified | Domain-by-domain, LLM-generated with manual review |

---

## 3. FSRS-5 Implementation Specification

### 3.1 Rating System

| Grade | Value | Meaning | Professor assigns when... |
|-------|-------|---------|---------------------------|
| Again | 1 | Memory lapse | Wrong answer, no understanding, chose "Explain again" |
| Hard | 2 | Passing, struggled | Partially correct, key gaps in explanation |
| Good | 3 | Correct | Correct answer with reasonable effort |
| Easy | 4 | Instant recall | Precise, fast, demonstrates deep understanding |

### 3.2 Default Parameters (w0-w18)

```javascript
const DEFAULT_PARAMS = [
  0.212,   // w0:  initial stability for Again
  1.2931,  // w1:  initial stability for Hard
  2.3065,  // w2:  initial stability for Good
  8.2956,  // w3:  initial stability for Easy
  6.4133,  // w4:  difficulty baseline (D0 formula)
  0.8334,  // w5:  difficulty grade scaling (D0 and D update)
  3.0194,  // w6:  difficulty mean reversion weight (D update)
  // -- Stability update (successful review: Hard/Good/Easy) --
  // SInc = 1 + hard_penalty * easy_bonus * e^(w8) * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1)
  0.001,   // w7:  (not used in long-term SInc — may relate to short-term; verify against fsrs-rs)
  1.8722,  // w8:  e^(w8) — overall scale of stability increase
  0.1666,  // w9:  S^(-w9) — stability decay exponent (higher S → smaller SInc)
  0.796,   // w10: e^(w10*(1-R)) — retrievability factor (lower R → larger SInc)
  // -- Stability update (lapse: Again) --
  // S' = min(w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R)), S)
  1.4835,  // w11: lapse overall scale
  0.0614,  // w12: lapse difficulty exponent
  0.2629,  // w13: lapse stability exponent
  1.6483,  // w14: lapse retrievability factor
  // -- Grade multipliers --
  0.6014,  // w15: Hard penalty (< 1, applied when G == 2)
  1.8729,  // w16: Easy bonus (> 1, applied when G == 4)
  // -- Short-term stability (same-day reviews, FSRS-5) --
  0.5425,  // w17: short-term stability factor
  0.0912   // w18: short-term stability exponent
];
```

### 3.3 Constants

```javascript
const DECAY = -0.5;                        // FSRS-5 default
const FACTOR = Math.pow(0.9, 1/DECAY) - 1; // = 19/81 ≈ 0.2346
```

The FACTOR ensures that R = 0.9 (90%) when t = S (elapsed time equals stability).

### 3.4 Formulas

**Source of truth:** [A technical explanation of FSRS (Expertium)](https://expertium.github.io/Algorithm.html) and the [fsrs-rs reference implementation](https://github.com/open-spaced-repetition/fsrs-rs). During implementation, cross-reference these directly.

**Retrievability:**
```
R = (1 + FACTOR * t / S) ^ DECAY
  = (1 + 19/81 * t / S) ^ (-0.5)
```
Where t = elapsed days, S = stability. When t = S, R = 0.9 (90%).

**Initial stability (first encounter):**
```
S0 = w[G - 1]   // w0 for Again, w1 for Hard, w2 for Good, w3 for Easy
```

**Initial difficulty:**
```
D0 = clamp(w4 - w5 * (G - 3), 1, 10)
```

| Grade | Initial Difficulty |
|-------|-------------------|
| Again (1) | 8.08 |
| Hard (2)  | 7.25 |
| Good (3)  | 6.41 |
| Easy (4)  | 5.58 |

**Difficulty update:**

**WARNING: This formula is provisional.** The mean reversion math with w6 = 3.0194 produces intermediate values outside the 1-10 range (clamping saves it, but the formula may be wrong). **Implement from the fsrs-rs source code directly, not from this spec.**

Conceptual behavior (verified correct):
- Again → difficulty increases
- Good → no change
- Easy → difficulty decreases
- Changes are dampened as D approaches 10
- Mean reversion pulls toward baseline w4 over time

**Stability update (successful review, G >= 2):**
```
hard_penalty = w15 if G == 2, else 1.0    // w15 < 1, penalizes Hard
easy_bonus   = w16 if G == 4, else 1.0    // w16 > 1, rewards Easy

SInc = 1 + hard_penalty * easy_bonus * e^(w8) * (11 - D) * S^(-w9) * (e^(w10 * (1-R)) - 1)
S_new = S * SInc
```
SInc >= 1 always. Successful reviews (Hard/Good/Easy) can only increase stability.

Component effects:
- `(11 - D)`: higher difficulty → smaller stability increase
- `S^(-w9)`: higher stability → smaller increase (saturation effect)
- `(e^(w10*(1-R)) - 1)`: lower retrievability → larger increase (reviewing when you almost forgot is most effective)

**Stability update (lapse, G == 1):**
```
S_new = min(w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14 * (1-R)), S)
```
Lapse can only decrease stability (enforced by min(..., S)).

### 3.5 Teaching Action Thresholds

| Retrievability | Action | Teaching behavior |
|---------------|--------|-------------------|
| R < 0.3 | teach_new | Full explanation + recall question |
| 0.3 <= R <= 0.7 | review | Flashcard-style quick check |
| R > 0.7 | skip | One-liner acknowledgment |

### 3.6 Exported Functions (fsrs.js)

```javascript
computeRetrievability(stability, elapsedDays) -> number (0-1)
computeNewStability(oldStability, difficulty, grade, retrievability) -> number
computeNewDifficulty(oldDifficulty, grade) -> number (1-10)
determineAction(retrievability) -> "teach_new" | "review" | "skip"
getInitialStability(grade) -> number
getInitialDifficulty(grade) -> number (1-10)
```

---

## 4. Updated Data Schemas

### 4.1 User Profile Entry (per-domain file)

```json
{
  "concept_id": "connection_pooling",
  "domain": "databases",
  "is_registry_concept": true,
  "difficulty_tier": "intermediate",
  "first_encountered": "2026-04-01T14:30:00Z",
  "last_reviewed": "2026-04-05T10:15:00Z",
  "review_history": [
    {"date": "2026-04-01T14:30:00Z", "grade": 2},
    {"date": "2026-04-03T09:00:00Z", "grade": 3},
    {"date": "2026-04-05T10:15:00Z", "grade": 3}
  ],
  "fsrs_stability": 12.5,
  "fsrs_difficulty": 4.2,
  "documentation_url": null,
  "notes": "Learned in context of FastAPI async handlers"
}
```

Changes from original spec:
- `review_history` stores `grade` (1-4 integer) instead of `score` (0-1 float)
- `fsrs_difficulty` range is 1-10 instead of 0-1
- `difficulty` renamed to `difficulty_tier` to avoid confusion with `fsrs_difficulty`

### 4.2 marketplace.json

```json
{
  "name": "claude-professor",
  "owner": {
    "name": "YOUR_NAME"
  },
  "plugins": [
    {
      "name": "claude-professor",
      "source": ".",
      "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, and produces enriched handoff documents."
    }
  ]
}
```

### 4.3 plugin.json

```json
{
  "name": "claude-professor",
  "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, and produces enriched handoff documents.",
  "version": "1.0.0"
}
```

### 4.4 Knowledge Agent Briefing Output

The agent caps its output at 20 concepts total (across all categories). If the task involves more, the agent selects the 20 most critical and lists overflow in a separate field. Concepts within each category are ordered by priority (most important first).

```json
{
  "task_summary": "Brief architectural summary of the task",
  "domains_involved": ["databases", "backend"],
  "concepts": {
    "teach_new": [
      {
        "id": "cache_aside_pattern",
        "domain": "databases",
        "difficulty": "intermediate",
        "reason": "Core pattern for the requested caching layer"
      }
    ],
    "review": [
      {
        "id": "connection_pooling",
        "domain": "databases",
        "last_reviewed": "2026-03-15T10:00:00Z",
        "retrievability": 0.45,
        "grade_history": [3, 2, 3],
        "reason": "Decaying - last reviewed 22 days ago"
      }
    ],
    "skip": [
      {
        "id": "http_methods",
        "domain": "networking",
        "retrievability": 0.92,
        "reason": "Developer knows this well"
      }
    ],
    "not_in_registry": [
      {
        "suggested_id": "hipaa_compliance",
        "suggested_domain": "security",
        "suggested_difficulty": "advanced",
        "reason": "Domain-specific regulatory requirement not in registry"
      }
    ]
  },
  "overflow": [
    {
      "id": "concept_id",
      "domain": "domain",
      "reason": "Why it's relevant but lower priority"
    }
  ]
}
```

---

## 5. Script Path Resolution

All script invocations use `${CLAUDE_PLUGIN_ROOT}` for plugin files and raw paths for user profile data:

```bash
# Lookup search
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
  --query "Redis caching for API" \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json

# Lookup status
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js status \
  --concepts "cache_aside_pattern,connection_pooling" \
  --profile-dir ~/.claude/professor/profile/ \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json

# Update scores
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "cache_aside_pattern" \
  --domain "databases" \
  --grade 3 \
  --is-registry-concept true \
  --difficulty-tier "intermediate" \
  --profile-dir ~/.claude/professor/profile/ \
  --documentation-url "https://..." \
  --notes "Learned in context of Redis caching task"
```

---

## 6. Grade Determination Logic

### Recall Questions (during teaching)

| Developer's answer | Grade |
|--------------------|-------|
| Wrong or no understanding demonstrated | Again (1) |
| Partially correct, key gaps | Hard (2) |
| Correct, reasonable explanation | Good (3) |
| Precise, fast, deep understanding shown | Easy (4) |

### MCQ Quiz

| Developer's selection | Grade |
|-----------------------|-------|
| "Explain again" selected | Again (1) |
| Wrong answer selected | Again (1) |
| Correct answer selected | Good (3) |

### Final Grade Per Concept

A concept may have two interactions: a recall question during teaching and an MCQ during the quiz. The final grade is the **lower** of the two.

Rationale: if you answered the recall question well but failed the MCQ, retention is weaker than the recall suggested. The conservative grade produces better FSRS scheduling.

---

## 7. Not-In-Registry Concepts

When the knowledge agent identifies a concept that isn't in the shipped registry:

1. Agent suggests an ID following naming conventions (lowercase_snake_case, max 3 words)
2. Agent assigns it to the best-fit existing domain (never creates new domains)
3. If no domain fits, assigns to `custom` domain with context in `notes`
4. Professor teaches it as a new concept (same flow as registry concepts)
5. update.js creates the profile entry with `is_registry_concept: false`
6. The concept exists only in the user's profile, not in the shared registry

---

## 8. Error Handling

**Unchanged from spec.** Script failure hierarchy:

| Failure | Exit Code | Response |
|---------|-----------|----------|
| Success | 0 | Use script output |
| Data error (malformed JSON, bad args) | 1 | Warn user, fall back to LLM |
| Permission error | 2 | Inform user, offer to continue without tracking |
| Script not found | N/A | Inform user, likely installation problem |

**Degradation priority:**
1. Teaching quality (never degraded)
2. Handoff document (always produced)
3. Score accuracy (may degrade to LLM-approximate)
4. Profile persistence (may be lost if writes fail)

---

## 9. Session Scope & Concept Cap

**20 concepts per session.** The knowledge agent caps its briefing at 20 concepts (across teach_new + review + skip + not_in_registry). Overflow concepts are listed separately and included in the handoff document as "concepts to explore during implementation."

Most tasks generate 5-12 concepts, so the cap rarely triggers. It prevents edge cases (broad tasks like "build a microservices platform") from creating 2+ hour teaching sessions.

The cap is enforced by the knowledge agent, not the professor — the professor teaches everything it receives.

**No setup or placement test.** Everyone starts with a blank profile. Organic calibration through real sessions is more accurate than self-assessment (Dunning-Kruger) and less tedious than a placement quiz. The profile calibrates within 2-3 teaching sessions through demonstrated knowledge.

---

## 10. Implementation Order

Bottom-up, each step testable before the next:

1. **Scaffolding** - Directory structure, plugin.json, marketplace.json, static data files. Verify plugin loads.
2. **fsrs.js** - All 6 exported functions, FSRS-5 formulas, w0-w18 defaults. Test with `node:test`. Cross-reference every formula against [Expertium's FSRS explanation](https://expertium.github.io/Algorithm.html) and [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs).
3. **utils.js** - Shared helpers. Test file I/O edge cases.
4. **lookup.js** - Search + status modes. Uses `${CLAUDE_PLUGIN_ROOT}`. Test missing/corrupt profiles.
5. **update.js** - Accepts `--grade 1-4`. FSRS-5 computation. Test create/update/lapse.
6. **Concept registry** - 150-200 concepts, generated domain-by-domain. Validate naming and domain assignment.
7. **Knowledge agent** - knowledge-agent.md with corrected script paths. Test briefing structure.
8. **Professor skill** - SKILL.md with discrete grading, 20-concept safety cap. Test full teaching flow.
9. **Integration testing** - Full flow, error scenarios, edge cases.

---

## 11. Testing Strategy

### Script Tests (Automated, `node:test`)

- FSRS math: known inputs produce known outputs
- Threshold boundaries: R=0.3 and R=0.7 edge cases
- Clamping: difficulty stays in 1-10, retrievability in 0-1
- Lapse: stability never increases on Again
- File I/O: missing files, malformed JSON, permissions
- Concept search: keyword matching accuracy
- Score updates: create new, update existing, idempotency

### Skill Tests (Manual)

- Install plugin, run `/professor {task}` with various tasks
- Verify: agent identifies concepts, teaching adapts to profile, MCQ works, handoff written, profile updated
- Verify: first session with blank profile treats all concepts as new
- Run second session: verify profile carries over, known concepts skipped
- Verify: 20-concept safety cap works when agent identifies 25+ concepts

### Error Tests (Manual)

- Delete profile directory mid-session
- Corrupt a domain JSON file
- Remove scripts directory
- Set profile directory read-only

---

## 12. Decisions Log (from brainstorming review)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Use FSRS-5 defaults, tune later | No real usage data to tune against yet |
| 2 | Discrete grades (1-4), not continuous scores | FSRS formulas use indicator functions on discrete grades |
| 3 | "Explain again" = Again(1) | Needing re-explanation is a retention failure signal |
| 4 | Final grade = lower of recall + MCQ | Conservative grading produces better scheduling |
| 5 | `node:test` for testing | Zero dependencies, matches plugin philosophy |
| 6 | Domain-by-domain registry generation | Better curation than bulk generation |
| 7 | `${CLAUDE_PLUGIN_ROOT}` for all plugin paths | Required by plugin caching system |
| 8 | Bottom-up implementation order | Respects dependency chain, avoids throwaway scaffolding |
| 9 | Plugin manifest verified against docs | Source format corrected, install commands confirmed |
| 10 | No setup/placement-test skill | Organic calibration via real sessions is more accurate than self-assessment, less tedious than a quiz. Profile calibrates in 2-3 sessions. |
| 11 | Safety cap of 20 concepts per session | Most tasks generate 5-12. Cap prevents edge cases from creating 2+ hour sessions. Overflow goes in handoff document. |

---

## References

- Original spec: `Instruction.md`
- Claude Code plugin docs: https://code.claude.com/docs/en/plugin-marketplaces
- FSRS-5 algorithm: https://expertium.github.io/Algorithm.html
- FSRS reference implementation: https://github.com/open-spaced-repetition/fsrs-rs
