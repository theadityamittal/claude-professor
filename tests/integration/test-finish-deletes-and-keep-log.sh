#!/usr/bin/env bash
# T-INT-1: finish semantics.
#   (a) default finish deletes both .session-state.json and .session-log.jsonl.
#   (b) finish --keep-log preserves the log and appends a session_finish event.
#
# Rather than drive a full four-phase session end-to-end, this test drives
# phase 1 end-to-end and then closes phases 2/3/4 via direct state writes
# (the code under test here is finish, not the phase machinery).
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-finish-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

seed_complete_session() {
  local _sd="$1"
  node "$WB" init-session --task "finish test" --session-dir "$_sd" --concerns-path "$CONCERNS" > /dev/null
  node "$WB" phase-start --session-dir "$_sd" --phase 1 > /dev/null
  node "$WB" register-selection \
    --session-dir "$_sd" \
    --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' \
    --concerns-path "$CONCERNS" \
    --registry-path "$REGISTRY" > /dev/null
  local out cid status concern_id
  out=$(node "$WB" next-concern --session-dir "$_sd" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
  concern_id=$(echo "$out" | jq -r '.data.concern_id')
  for i in 0 1; do
    cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
    status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
    record_concept_auto "$_sd" "$concern_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
  done
  node "$WB" mark-concern-done --session-dir "$_sd" --id "$concern_id" > /dev/null
  node "$WB" phase-complete --session-dir "$_sd" --phase 1 > /dev/null

  # Phases 2/3/4 synthesized directly so finish has something to validate.
  node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  s.current_phase = 4;
  s.phases["2"] = { status: "complete", components: [], current_component_index: null, discussions: [] };
  s.phases["3"] = { status: "complete", components: [], current_component_index: null, discussions: [] };
  s.phases["4"] = { status: "complete" };
  s.updated_at = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  ' "$_sd/.session-state.json"
}

# (a) default finish deletes both files.
seed_complete_session "$SESSION_DIR"
[[ -f "$SESSION_DIR/.session-state.json" ]] || { echo "FAIL: state file missing before finish"; exit 1; }
[[ -f "$SESSION_DIR/.session-log.jsonl"  ]] || { echo "FAIL: log file missing before finish"; exit 1; }
node "$WB" finish --session-dir "$SESSION_DIR" > /dev/null
[[ ! -e "$SESSION_DIR/.session-state.json" ]] || { echo "FAIL: state file still present after default finish"; exit 1; }
[[ ! -e "$SESSION_DIR/.session-log.jsonl"  ]] || { echo "FAIL: log file still present after default finish"; exit 1; }

# (b) finish --keep-log preserves the log and appends session_finish.
seed_complete_session "$SESSION_DIR"
out=$(node "$WB" finish --session-dir "$SESSION_DIR" --keep-log)
assert_ok "$out"
[[ "$(echo "$out" | jq -r '.data.kept_log')" == "true" ]] || { echo "FAIL: kept_log flag"; exit 1; }
[[ ! -e "$SESSION_DIR/.session-state.json" ]] || { echo "FAIL: state file kept with --keep-log"; exit 1; }
[[ -f "$SESSION_DIR/.session-log.jsonl"    ]] || { echo "FAIL: log file missing with --keep-log"; exit 1; }
tail_event=$(tail -1 "$SESSION_DIR/.session-log.jsonl" | jq -r '.event')
[[ "$tail_event" == "session_finish" ]] || { echo "FAIL: expected session_finish event, got=$tail_event"; exit 1; }

echo "PASS: test-finish-deletes-and-keep-log"
