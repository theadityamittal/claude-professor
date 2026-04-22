#!/usr/bin/env bash
# T-INT-1: Phase 2 happy path with pre-built L2_decisions fixture.
# Matcher isn't invoked — decisions are hardcoded to show the whiteboard
# layer works once decisions arrive.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase2-happy-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

# Drive phase 1 trivially (no concerns) by using state surgery — phase 2 is the
# target here, and the whiteboard layer's only cross-phase requirement is that
# phase 1 be status=complete before phase-start --phase 2 runs.
node "$WB" init-session --task "phase2 happy" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"search_relevance","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null
out=$(node "$WB" next-concern \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
for i in 0 1; do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$concern_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# Phase 2 begins.
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null

# Single component with one seed L1 and one proposed L2 whose decision is
# "use_existing" (hardcoded, simulating a matcher that already ran).
payload=$(cat <<'JSON'
{
  "components": [
    {
      "id": "retrieval",
      "concepts_seed": ["information_retrieval"],
      "concepts_proposed": [
        {"id": "sparse_vectors_repr", "parent": "information_retrieval"}
      ],
      "L2_decisions": [
        {
          "proposed": "sparse_vectors_repr",
          "decision": "use_existing",
          "matched_id": "sparse_vectors",
          "confidence": 0.91,
          "reasoning": "fixture decision"
        }
      ]
    }
  ]
}
JSON
)
out=$(node "$WB" register-components \
  --session-dir "$SESSION_DIR" \
  --components-json "$payload" \
  --registry-path "$REGISTRY")
assert_ok "$out"

# next-component returns the component with 2 concepts (seed + proposed.id).
out=$(node "$WB" next-component \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --profile-dir "$PROFILE_DIR")
assert_ok "$out"
comp_id=$(echo "$out" | jq -r '.data.component_id')
[[ "$comp_id" == "retrieval" ]] || { echo "FAIL: component_id=$comp_id"; exit 1; }
concept_count=$(echo "$out" | jq '.data.concepts | length')
[[ "$concept_count" == "2" ]] || { echo "FAIL: component concept_count=$concept_count"; exit 1; }

for i in 0 1; do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$comp_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done

node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$comp_id" > /dev/null

out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 2)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]] || { echo "FAIL: phase 2 gate"; echo "$out"; exit 1; }

node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 2 > /dev/null

echo "PASS: test-phase2-happy-path"
