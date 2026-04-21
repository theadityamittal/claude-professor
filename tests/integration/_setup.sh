#!/usr/bin/env bash
# Shared helpers for Tier 2 CLI integration chains (T-INT-1).
#
# Each test sources this file and calls the helpers to build self-contained
# fixtures inside its own sandbox directory.
#
#   source "$(dirname "$0")/_setup.sh"
#
# All helpers are pure: they accept absolute paths and write fixtures there.
# Nothing here mutates shared state, the real data/ tree, or $HOME.

# Resolve repo root so each test can invoke scripts/whiteboard.js regardless
# of the caller's CWD. Exported so child processes inherit it too.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export REPO_ROOT

WB="$REPO_ROOT/scripts/whiteboard.js"
GATE="$REPO_ROOT/scripts/gate.js"
LOOKUP="$REPO_ROOT/scripts/lookup.js"
UPDATE="$REPO_ROOT/scripts/update.js"
export WB GATE LOOKUP UPDATE

# make_test_concerns PATH
#
# Write a minimal concerns.json to PATH containing two catalog concerns
# (`data_consistency`, `search_relevance`) and one orphan_l1 so the file
# passes structural checks and the tests can register both concerns.
make_test_concerns() {
  local path="$1"
  cat > "$path" <<'EOF'
{
  "schema_version": 5,
  "concerns": {
    "data_consistency": {
      "description": "Correctness across distributed writes and replicas.",
      "keywords": ["consistency", "transaction", "acid", "replica"],
      "mapped_seeds": ["acid_transactions", "isolation_levels"],
      "canonical_sources": ["test fixture"]
    },
    "search_relevance": {
      "description": "Returning the right documents for a user query.",
      "keywords": ["retrieval", "ranking", "search"],
      "mapped_seeds": ["information_retrieval", "ranking_algorithms"],
      "canonical_sources": ["test fixture"]
    }
  },
  "orphan_l1s": {
    "sparse_vectors": "L2 parent container in HLD/LLD, not a Phase 1 concern."
  }
}
EOF
}

# make_test_registry PATH
#
# Write a minimal registry.json — an array of concept entries — containing
# every L1 id referenced by the fixtures above plus a couple of extras that
# show up in Phase 2 tests (ranking_algorithms, reciprocal_rank_fusion).
#
# reciprocal_rank_fusion is intentionally NOT in the registry for the
# "novel L2" test, but we include it only when that test needs it — this
# function writes the common baseline.
make_test_registry() {
  local path="$1"
  cat > "$path" <<'EOF'
[
  {
    "concept_id": "acid_transactions",
    "domain": "databases",
    "difficulty_tier": "intermediate",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  },
  {
    "concept_id": "isolation_levels",
    "domain": "databases",
    "difficulty_tier": "intermediate",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  },
  {
    "concept_id": "information_retrieval",
    "domain": "natural_language_processing",
    "difficulty_tier": "intermediate",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  },
  {
    "concept_id": "ranking_algorithms",
    "domain": "information_retrieval",
    "difficulty_tier": "intermediate",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  },
  {
    "concept_id": "sparse_vectors",
    "domain": "natural_language_processing",
    "difficulty_tier": "intermediate",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  },
  {
    "concept_id": "saga_pattern",
    "domain": "distributed_systems",
    "difficulty_tier": "advanced",
    "level": 1,
    "parent_concept": null,
    "is_seed_concept": true
  }
]
EOF
}

# pick_action STATUS
#
# Echo a valid action for an FSRS status per spec §2.6. For statuses that
# have a single deterministic pairing this is trivial; for ambiguous ones
# (`teach_new` allows both taught and reviewed) we pick `taught`.
pick_action() {
  case "$1" in
    new|encountered_via_child|teach_new) echo "taught" ;;
    review) echo "reviewed" ;;
    skip) echo "skipped_not_due" ;;
    *) echo "__unknown__" ;;
  esac
}

# needs_grade ACTION — echo 1 if a --grade flag is required, empty otherwise.
needs_grade() {
  case "$1" in
    taught|reviewed) echo 1 ;;
    *) echo "" ;;
  esac
}

# record_concept_auto SESSION_DIR UNIT_ID CONCEPT_ID STATUS REGISTRY PROFILE_DIR
#
# Convenience wrapper that picks a compatible action for STATUS and invokes
# record-concept. Fails fast if STATUS is unrecognized.
record_concept_auto() {
  local session_dir="$1" unit_id="$2" concept_id="$3" status="$4"
  local registry="$5" profile_dir="$6"
  local action
  action="$(pick_action "$status")"
  if [[ "$action" == "__unknown__" ]]; then
    echo "record_concept_auto: unknown fsrs_status '$status' for $concept_id" >&2
    return 1
  fi
  local -a args=(
    record-concept
    --session-dir "$session_dir"
    --concept-id "$concept_id"
    --unit-id "$unit_id"
    --action "$action"
    --notes "auto-recorded by _setup.sh for $concept_id ($status)"
    --registry-path "$registry"
    --profile-dir "$profile_dir"
  )
  if [[ -n "$(needs_grade "$action")" ]]; then
    args+=(--grade 3)
  fi
  node "$WB" "${args[@]}" > /dev/null
}

# assert_ok STRING
#
# Parse JSON from $1 and fail if status != "ok".
assert_ok() {
  echo "$1" | jq -e '.status == "ok"' > /dev/null
}
