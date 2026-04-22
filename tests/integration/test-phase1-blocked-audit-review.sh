#!/usr/bin/env bash
# T-INT-1: Phase 1 blocked audit — the user skipped recording one concept,
# gate returns blocked, caller follows the "review" remediation path by
# recording the missing concept, and the next checkpoint passes.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-phase1-block-review-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "blocked review" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
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

# Record only the FIRST concept; intentionally skip the second to force a blocked audit.
first_cid=$(echo "$out"    | jq -r '.data.concepts[0].concept_id')
first_status=$(echo "$out" | jq -r '.data.concepts[0].fsrs_status')
second_cid=$(echo "$out"   | jq -r '.data.concepts[1].concept_id')
second_status=$(echo "$out" | jq -r '.data.concepts[1].fsrs_status')
record_concept_auto "$SESSION_DIR" "$concern_id" "$first_cid" "$first_status" "$REGISTRY" "$PROFILE_DIR"

# mark-concern-done would complain about the missing concept, but we want to
# exercise the gate-audit path, so bypass and call gate.js directly.
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
result=$(echo "$out" | jq -r '.data.result')
[[ "$result" == "blocked" ]] || { echo "FAIL: expected blocked got=$result"; echo "$out"; exit 1; }
missing=$(echo "$out" | jq -r '.data.missing | join(",")')
[[ "$missing" == "$second_cid" ]] || { echo "FAIL: expected missing=$second_cid got=$missing"; exit 1; }

# Review remediation: record the missing concept.
record_concept_auto "$SESSION_DIR" "$concern_id" "$second_cid" "$second_status" "$REGISTRY" "$PROFILE_DIR"

# Re-run checkpoint — now passes.
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
result=$(echo "$out" | jq -r '.data.result')
[[ "$result" == "passed" ]] || { echo "FAIL: re-checkpoint result=$result"; echo "$out"; exit 1; }

# mark-concern-done + phase-complete now work.
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

echo "PASS: test-phase1-blocked-audit-review"
