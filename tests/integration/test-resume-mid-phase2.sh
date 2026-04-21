#!/usr/bin/env bash
# T-INT-1: Mid-phase-2 resume. Walk phase 1 to completion, start phase 2
# with register-components, record one concept for the first component,
# then resume-session. next_action_hint must reflect phase 2 state.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-resume-p2-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "resume p2" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
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

# Phase 2.
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null
payload=$(cat <<'JSON'
{
  "components": [
    {
      "id": "retrieval",
      "concepts_seed": ["information_retrieval", "ranking_algorithms"],
      "concepts_proposed": [],
      "L2_decisions": []
    }
  ]
}
JSON
)
node "$WB" register-components --session-dir "$SESSION_DIR" --components-json "$payload" --registry-path "$REGISTRY" > /dev/null

out=$(node "$WB" next-component --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
comp_id=$(echo "$out" | jq -r '.data.component_id')
first_cid=$(echo "$out"    | jq -r '.data.concepts[0].concept_id')
first_status=$(echo "$out" | jq -r '.data.concepts[0].fsrs_status')
record_concept_auto "$SESSION_DIR" "$comp_id" "$first_cid" "$first_status" "$REGISTRY" "$PROFILE_DIR"

# Stop mid-component. Resume in fresh call.
out=$(node "$WB" resume-session --session-dir "$SESSION_DIR")
assert_ok "$out"
[[ $(echo "$out" | jq -r '.data.current_phase') == "2" ]] || { echo "FAIL: resume current_phase"; exit 1; }
hint=$(echo "$out" | jq -r '.data.next_action_hint')
[[ "$hint" == "next-component" ]] || { echo "FAIL: expected hint=next-component got=$hint"; exit 1; }
pos=$(echo "$out" | jq -r '.data.current_position')
echo "$pos" | grep -q "phase 2" || { echo "FAIL: current_position=$pos"; exit 1; }

echo "PASS: test-resume-mid-phase2"
