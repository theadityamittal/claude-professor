#!/usr/bin/env bash
# T-INT-1: Mid-phase-1 resume. Record one concept, then (in a fresh node
# process) call resume-session and verify it surfaces the recorded action
# and a sensible next_action_hint.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-resume-p1-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

node "$WB" init-session --task "resume p1" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null

out=$(node "$WB" next-concern --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
first_cid=$(echo "$out"    | jq -r '.data.concepts[0].concept_id')
first_status=$(echo "$out" | jq -r '.data.concepts[0].fsrs_status')
action="$(pick_action "$first_status")"
needs="$(needs_grade "$action")"
args=(
  record-concept
  --session-dir "$SESSION_DIR"
  --concept-id "$first_cid"
  --unit-id "$concern_id"
  --action "$action"
  --notes "mid-phase1 resume test: recorded first concept"
  --registry-path "$REGISTRY"
  --profile-dir "$PROFILE_DIR"
)
if [[ -n "$needs" ]]; then args+=(--grade 3); fi
node "$WB" "${args[@]}" > /dev/null

# Stop "here" (no mark-concern-done, no phase-complete, no finish).
# Resume-session in a fresh invocation.
out=$(node "$WB" resume-session --session-dir "$SESSION_DIR")
assert_ok "$out"
[[ $(echo "$out" | jq -r '.data.current_phase') == "1" ]] || { echo "FAIL: resume phase"; exit 1; }
narrative=$(echo "$out" | jq -r '.data.narrative_summary')
# Narrative must reference our recorded action's notes text.
echo "$narrative" | grep -q "mid-phase1 resume test" || { echo "FAIL: narrative missing notes"; echo "$narrative"; exit 1; }
hint=$(echo "$out" | jq -r '.data.next_action_hint')
[[ "$hint" == "next-concern" || "$hint" == "phase-complete" ]] || { echo "FAIL: next_action_hint=$hint"; exit 1; }

echo "PASS: test-resume-mid-phase1"
