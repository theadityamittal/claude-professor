#!/usr/bin/env bash
# T-INT-1: Phase 1 blocked audit — "abort" remediation. The skill exits
# without completing the phase; state + log survive on disk and
# resume-session surfaces a next_action_hint.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase1-block-abort-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "blocked abort" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null

out=$(node "$WB" next-concern \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
first_cid=$(echo "$out"    | jq -r '.data.concepts[0].concept_id')
first_status=$(echo "$out" | jq -r '.data.concepts[0].fsrs_status')
record_concept_auto "$SESSION_DIR" "$concern_id" "$first_cid" "$first_status" "$REGISTRY" "$PROFILE_DIR"

out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "blocked" ]] || { echo "FAIL: expected blocked"; exit 1; }

# "Abort" simulated: don't call finish — just leave state in place. Verify
# state + log files both exist and resume reports a useful next_action_hint.
state_path="$SESSION_DIR/.session-state.json"
log_path="$SESSION_DIR/.session-log.jsonl"
[[ -f "$state_path" ]] || { echo "FAIL: state file missing after abort"; exit 1; }
[[ -f "$log_path"   ]] || { echo "FAIL: log file missing after abort"; exit 1; }

# resume-session returns partial state.
out=$(node "$WB" resume-session --session-dir "$SESSION_DIR")
assert_ok "$out"
current_phase=$(echo "$out" | jq -r '.data.current_phase')
[[ "$current_phase" == "1" ]] || { echo "FAIL: resume current_phase=$current_phase"; exit 1; }
hint=$(echo "$out" | jq -r '.data.next_action_hint')
case "$hint" in
  next-concern|phase-complete) ;;  # either is acceptable given partial recording
  *) echo "FAIL: unexpected next_action_hint=$hint"; exit 1 ;;
esac

echo "PASS: test-phase1-blocked-audit-abort"
