#!/usr/bin/env bash
# T-INT-1: Phase 2 with an L2 reuse decision — the proposed L2 matches an
# existing L2 profile, so next-component reports a non-"new" FSRS status
# for that concept.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase2-l2reuse-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

# Pre-create an L2 profile for sparse_vectors so next-component reports it
# as something other than 'new'. An empty review_history yields
# `encountered_via_child` per spec §2.6.
node -e '
const path = require("path");
const { writeMarkdownFile } = require(path.join(process.env.REPO_ROOT, "scripts", "utils.js"));
const fm = {
  concept_id: "sparse_vectors",
  domain: "natural_language_processing",
  schema_version: 5,
  level: 2,
  parent_concept: "information_retrieval",
  is_seed_concept: false,
  difficulty_tier: "intermediate",
  first_encountered: "2026-01-01T00:00:00Z",
  last_reviewed: null,
  review_history: [],
  fsrs_stability: 1.0,
  fsrs_difficulty: 5.0,
  operation_nonce: null,
};
const body = "\n## Description\n\nSparse vectors carry few nonzero components.\n\n## Teaching Guide\n\nTeach via bag-of-words example.\n";
writeMarkdownFile(path.join(process.argv[1], "natural_language_processing", "sparse_vectors.md"), fm, body);
' "$PROFILE_DIR"

# Drive phase 1 with the search_relevance concern.
node "$WB" init-session --task "l2 reuse" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"search_relevance","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null
out=$(node "$WB" next-concern --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
for i in 0 1; do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$concern_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# Phase 2: proposed sparse_vectors with decision=use_existing matching the
# pre-created profile above.
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null
payload=$(cat <<'JSON'
{
  "components": [
    {
      "id": "retrieval",
      "concepts_seed": ["information_retrieval"],
      "concepts_proposed": [
        {"id": "sparse_vectors", "parent": "information_retrieval"}
      ],
      "L2_decisions": [
        {
          "proposed": "sparse_vectors",
          "decision": "use_existing",
          "matched_id": "sparse_vectors",
          "confidence": 0.91,
          "reasoning": "pre-existing profile at $PROFILE_DIR/natural_language_processing/sparse_vectors.md"
        }
      ]
    }
  ]
}
JSON
)
out=$(node "$WB" register-components --session-dir "$SESSION_DIR" --components-json "$payload" --registry-path "$REGISTRY")
assert_ok "$out"

out=$(node "$WB" next-component --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
assert_ok "$out"

# Locate sparse_vectors in the returned concepts — it must NOT be "new".
sparse_status=$(echo "$out" | jq -r '.data.concepts[] | select(.concept_id=="sparse_vectors") | .fsrs_status')
[[ -n "$sparse_status" ]] || { echo "FAIL: sparse_vectors not in next-component output"; echo "$out"; exit 1; }
[[ "$sparse_status" != "new" ]] || { echo "FAIL: expected non-new status for existing L2, got $sparse_status"; exit 1; }
# Profile path should reference the pre-created file.
sparse_path=$(echo "$out" | jq -r '.data.concepts[] | select(.concept_id=="sparse_vectors") | .profile_path')
[[ "$sparse_path" == *"sparse_vectors.md" ]] || { echo "FAIL: profile_path=$sparse_path"; exit 1; }

comp_id=$(echo "$out" | jq -r '.data.component_id')
count=$(echo "$out" | jq '.data.concepts | length')
for i in $(seq 0 $((count - 1))); do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$comp_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$comp_id" > /dev/null
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 2)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]] || { echo "FAIL: gate not passed"; echo "$out"; exit 1; }
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 2 > /dev/null

echo "PASS: test-phase2-l2-reuse"
