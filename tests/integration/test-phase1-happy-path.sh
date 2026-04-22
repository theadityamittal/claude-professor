#!/usr/bin/env bash
# T-INT-1: Phase 1 happy path — register a single catalog concern, teach/
# review every concept, mark the concern done, audit, complete the phase.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase1-happy-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

# --- init + phase 1 start ---
out=$(node "$WB" init-session --task "phase1 happy path" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS")
assert_ok "$out"

node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# --- register a single catalog concern ---
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null

# --- next-concern returns data_consistency with both concepts ---
out=$(node "$WB" next-concern \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --profile-dir "$PROFILE_DIR")
assert_ok "$out"
concern_id=$(echo "$out" | jq -r '.data.concern_id')
[[ "$concern_id" == "data_consistency" ]] || { echo "FAIL: concern_id=$concern_id"; exit 1; }
done_flag=$(echo "$out" | jq -r '.data.done')
[[ "$done_flag" == "false" ]] || { echo "FAIL: done=$done_flag at first call"; exit 1; }
concept_count=$(echo "$out" | jq '.data.concepts | length')
[[ "$concept_count" == "2" ]] || { echo "FAIL: concept_count=$concept_count"; exit 1; }

# --- record-concept for each concept, action selected from reported fsrs_status ---
for i in 0 1; do
  concept_id=$(echo "$out" | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out"    | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$concern_id" "$concept_id" "$status" "$REGISTRY" "$PROFILE_DIR"
done

# --- mark concern done ---
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null

# --- next-concern now reports done ---
out=$(node "$WB" next-concern \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --profile-dir "$PROFILE_DIR")
[[ $(echo "$out" | jq -r '.data.done') == "true" ]] || { echo "FAIL: expected done=true"; exit 1; }

# --- gate.js audit passes ---
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
result=$(echo "$out" | jq -r '.data.result')
[[ "$result" == "passed" ]] || { echo "FAIL: gate.result=$result"; echo "$out"; exit 1; }

# --- phase complete ---
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

echo "PASS: test-phase1-happy-path"
