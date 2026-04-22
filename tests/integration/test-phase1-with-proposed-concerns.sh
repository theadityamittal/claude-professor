#!/usr/bin/env bash
# T-INT-1: Phase 1 with a user-proposed concern alongside a catalog concern.
# Asserts that proposed seeds show up in next-concern and can be recorded.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase1-proposed-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "proposed concerns" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# A catalog concern and a user-proposed concern that maps to two registry seeds.
payload=$(cat <<'JSON'
{
  "concerns": [
    {"id": "data_consistency", "source": "catalog"},
    {
      "id": "workflow_coordination",
      "source": "proposed",
      "mapped_seeds": ["saga_pattern", "isolation_levels"]
    }
  ]
}
JSON
)
out=$(node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json "$payload" \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY")
assert_ok "$out"
proposed_count=$(echo "$out" | jq '.data.proposed_count')
[[ "$proposed_count" == "1" ]] || { echo "FAIL: proposed_count=$proposed_count"; exit 1; }

# Walk both concerns in order.
process_concern() {
  local expected_id="$1"
  local out
  out=$(node "$WB" next-concern \
    --session-dir "$SESSION_DIR" \
    --registry-path "$REGISTRY" \
    --profile-dir "$PROFILE_DIR")
  assert_ok "$out"
  local got
  got=$(echo "$out" | jq -r '.data.concern_id')
  [[ "$got" == "$expected_id" ]] || { echo "FAIL: expected concern=$expected_id got=$got"; exit 1; }
  local count
  count=$(echo "$out" | jq '.data.concepts | length')
  [[ "$count" == "2" ]] || { echo "FAIL: concern=$expected_id concept_count=$count"; exit 1; }
  for i in 0 1; do
    local cid status
    cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
    status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
    record_concept_auto "$SESSION_DIR" "$got" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
  done
  node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$got" > /dev/null
}

process_concern "data_consistency"
process_concern "workflow_coordination"

# Verify proposed seeds landed in concepts_checked with phase=1.
state_path="$SESSION_DIR/.session-state.json"
saga_recorded=$(jq '[.concepts_checked[] | select(.concept_id=="saga_pattern" and .phase==1)] | length' "$state_path")
iso_recorded=$(jq  '[.concepts_checked[] | select(.concept_id=="isolation_levels" and .phase==1 and .concern_or_component=="workflow_coordination")] | length' "$state_path")
[[ "$saga_recorded" == "1" ]] || { echo "FAIL: saga_pattern not recorded"; exit 1; }
[[ "$iso_recorded"  == "1" ]] || { echo "FAIL: isolation_levels (proposed concern) not recorded"; exit 1; }

# Gate passes; phase completes.
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]] || { echo "FAIL: gate not passed"; echo "$out"; exit 1; }
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

echo "PASS: test-phase1-with-proposed-concerns"
