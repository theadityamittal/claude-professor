---json
{
  "concept_id": "canary_deploys",
  "domain": "devops_infrastructure",
  "schema_version": 5,
  "level": 1,
  "parent_concept": null,
  "is_seed_concept": true,
  "difficulty_tier": "intermediate",
  "first_encountered": "2026-04-15T10:00:00Z",
  "last_reviewed": null,
  "review_history": [],
  "fsrs_stability": 1,
  "fsrs_difficulty": 5,
  "operation_nonce": null
}
---

## Description

Canary deploys expose a change to a small slice of traffic before full rollout.

## Teaching Guide

- **Migrated key points:**
  - Start at 1% then ramp
  - Watch error rate and latency
- **Migrated notes:**
  User reasoned well about blast radius but forgot to mention rollback triggers.
