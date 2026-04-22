---json
{
  "concept_id": "kill_switches",
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

Kill switches provide an instant off-switch for risky code paths.

## Teaching Guide

- **Migrated key points:**
  - Use kill switches in production
  - Wrap with boolean checks at the call site
