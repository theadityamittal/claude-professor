---
name: concept-matcher
description: >
  Semantic match for novel L2 concept candidates. Two-stage retrieve-rerank:
  Stage 1 returns top-K candidates from thin universe; Stage 2 makes final
  decision over top-K with full metadata. Returns typed match decision.
  Does NOT teach or interact with users.
tools: Read, Bash
model: haiku
---

## Purpose

The concept-matcher is a stateless subagent that decides whether a novel L2
candidate proposed by an upstream LLM is actually equivalent to an existing
concept in the seed registry or user profile. It operates in two retrieve-rerank
stages over a candidate universe the skill supplies, returning a typed match
decision. It does NOT teach concepts, produce FSRS state, create concepts, or
interact with the user — all of those are the skill's responsibility.

## Stage 1 prompt (retrieval)

```
You are a concept-matcher subagent. Determine if a proposed novel L2 concept
is semantically equivalent to any existing concept.

CANDIDATE (proposed by upstream LLM):
- id: <proposed_id>
- description: <proposed_description>
- proposed_parent: <L1_id>
- proposed_domain: <domain_id>

UNIVERSE (thin):
L2s (id, parent, one-line scope):
  <list>

L1s (id, domain, one-line scope):
  <list>

TASK: Return up to 5 candidates from the universe that COULD be semantically
equivalent to the proposed candidate. Use semantic judgment, not just name
similarity. Consider concepts under different parents/domains.

Output JSON only — no prose, no markdown fences:
{
  "top_candidates": [
    { "id": "...", "kind": "l2" | "l1", "reason_for_shortlist": "..." }
  ]
}
```

## Stage 2 prompt (rerank and decide)

```
You are a concept-matcher subagent — Stage 2 (decision).

CANDIDATE:
- id: <proposed_id>
- description: <full_description>
- proposed_parent: <L1_id>

EXISTING CANDIDATES (top-K from Stage 1, with full metadata):
1. id: ..., kind: l2, parent: ..., description: ..., teaching_guide_summary: ...
2. ...

TASK: Decide one of:
- "semantic_l2": candidate is semantically equivalent to one of the existing L2s. Return matched_id.
- "l1_instead": candidate is actually a registry L1 (one of the existing L1s in the list). Return matched_id.
- "parent_disputed": candidate is novel but the proposed parent is wrong. Suggest a better parent.
- "no_match": candidate is genuinely novel and parent claim is reasonable.

Output JSON only:
{
  "match": "semantic_l2" | "l1_instead" | "parent_disputed" | "no_match",
  "matched_id": "..." | null,
  "suggested_parent": "..." | null,
  "confidence": 0.0-1.0,
  "reasoning": "<one sentence>"
}
```

## Output schema

| Field | Stage | Type | Notes |
|-------|-------|------|-------|
| `top_candidates` | 1 | array | Up to 5 objects; each has `id`, `kind` (`l2`\|`l1`), `reason_for_shortlist` |
| `match` | 2 | enum | One of `semantic_l2`, `l1_instead`, `parent_disputed`, `no_match` |
| `matched_id` | 2 | string\|null | Required when `match` is `semantic_l2` or `l1_instead` |
| `suggested_parent` | 2 | string\|null | Required when `match` is `parent_disputed` |
| `confidence` | 2 | number | In `[0.0, 1.0]` |
| `reasoning` | 2 | string | Non-empty; one sentence |

Both stages' outputs are validated by `lookup.js record-l2-decision`. If the
envelope returns `blocking` with a schema message, the skill retries once; a
second failure aborts matcher invocation for this candidate.

## Retry protocol

Concept-matcher inherits the self-healing protocol from concept-agent:

- Script error (lookup.js failure during universe gathering) → retry once with corrected args
- LLM output parse failure → retry once
- After 2 failed retries → abort with `envelopeError('warning', 'matcher unavailable')`. Skill treats candidate as `no_match` (accepts as novel) and logs the matcher failure. Sessions don't block on matcher failures.
