#!/usr/bin/env bash
# T-INT-1: Phase 1 blocked audit — user chooses the "skip" remediation
# (mark-skipped writes synthetic concepts_checked entries so gate passes).
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase1-block-skip-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "blocked skip" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
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

# Record the first concept only; skip the second.
first_cid=$(echo "$out"     | jq -r '.data.concepts[0].concept_id')
first_status=$(echo "$out"  | jq -r '.data.concepts[0].fsrs_status')
second_cid=$(echo "$out"    | jq -r '.data.concepts[1].concept_id')
record_concept_auto "$SESSION_DIR" "$concern_id" "$first_cid" "$first_status" "$REGISTRY" "$PROFILE_DIR"

# First checkpoint blocked with the missing concept.
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "blocked" ]] || { echo "FAIL: expected initial blocked"; echo "$out"; exit 1; }

# Skip remediation: mark-skipped writes a synthetic checked entry.
skip_ids="[\"$second_cid\"]"
node "$WB" mark-skipped \
  --session-dir "$SESSION_DIR" \
  --phase 1 \
  --ids "$skip_ids" \
  --reason "user wants to defer $second_cid" > /dev/null

# Synthetic entry landed.
synth=$(jq "[.concepts_checked[] | select(.concept_id==\"$second_cid\" and .action==\"skipped_remediation\")] | length" "$SESSION_DIR/.session-state.json")
[[ "$synth" == "1" ]] || { echo "FAIL: synthetic entry count=$synth"; exit 1; }

# Second checkpoint passes.
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]] || { echo "FAIL: expected passed after skip"; echo "$out"; exit 1; }

# mark-concern-done only honors phase:1 concepts_checked — synthetics qualify.
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

echo "PASS: test-phase1-blocked-audit-skip"
