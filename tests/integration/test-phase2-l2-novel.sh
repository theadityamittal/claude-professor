#!/usr/bin/env bash
# T-INT-1: Phase 2 with an accept_novel L2 decision. The concept is
# recorded; we then verify `update.js` (invoked after the session, as the
# professor-teach skill would) creates the profile at the expected path.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase2-l2novel-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

# Quick phase 1 to unlock phase 2.
node "$WB" init-session --task "l2 novel" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
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

# Phase 2: novel L2 (reciprocal_rank_fusion under ranking_algorithms).
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null
payload=$(cat <<'JSON'
{
  "components": [
    {
      "id": "ranker",
      "concepts_seed": ["ranking_algorithms"],
      "concepts_proposed": [
        {"id": "reciprocal_rank_fusion", "parent": "ranking_algorithms"}
      ],
      "L2_decisions": [
        {
          "proposed": "reciprocal_rank_fusion",
          "decision": "accept_novel",
          "confidence": 0.82,
          "reasoning": "not present in fixture universe"
        }
      ]
    }
  ]
}
JSON
)
out=$(node "$WB" register-components --session-dir "$SESSION_DIR" --components-json "$payload" --registry-path "$REGISTRY")
assert_ok "$out"
[[ $(echo "$out" | jq '.data.novel_l2_count') == "1" ]] || { echo "FAIL: novel_l2_count mismatch"; echo "$out"; exit 1; }

out=$(node "$WB" next-component --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
comp_id=$(echo "$out" | jq -r '.data.component_id')
# reciprocal_rank_fusion has no profile yet → fsrs_status=new.
rrf_status=$(echo "$out" | jq -r '.data.concepts[] | select(.concept_id=="reciprocal_rank_fusion") | .fsrs_status')
[[ "$rrf_status" == "new" ]] || { echo "FAIL: novel L2 status=$rrf_status (expected new)"; exit 1; }

# Record every concept.
count=$(echo "$out" | jq '.data.concepts | length')
for i in $(seq 0 $((count - 1))); do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$comp_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$comp_id" > /dev/null

# Now simulate professor-teach's post-grade update.js call for the novel L2.
node "$UPDATE" \
  --concept reciprocal_rank_fusion \
  --grade 3 \
  --parent-concept ranking_algorithms \
  --profile-dir "$PROFILE_DIR" \
  --registry-path "$REGISTRY" > /dev/null

expected_path="$PROFILE_DIR/information_retrieval/reciprocal_rank_fusion.md"
[[ -f "$expected_path" ]] || { echo "FAIL: update.js did not create $expected_path"; find "$PROFILE_DIR" -type f; exit 1; }

out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 2)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]] || { echo "FAIL: gate not passed"; echo "$out"; exit 1; }
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 2 > /dev/null

echo "PASS: test-phase2-l2-novel"
