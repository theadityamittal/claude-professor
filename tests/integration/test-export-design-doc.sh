#!/usr/bin/env bash
# T-INT-1: export-design-doc writes the aggregated markdown with all the
# expected sections after phases 1-3 have run with discussions.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-export-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profile"
CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
OUTPUT="$DIR/design.md"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"
make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"

# --- phase 1 ---
node "$WB" init-session --task "export design doc" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection \
  --session-dir "$SESSION_DIR" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' \
  --concerns-path "$CONCERNS" \
  --registry-path "$REGISTRY" > /dev/null
out=$(node "$WB" next-concern --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
node "$WB" record-discussion \
  --session-dir "$SESSION_DIR" \
  --unit-id "$concern_id" \
  --summary "Discussed consistency in distributed writes." \
  --open-questions '["Quorum or leader?"]' > /dev/null
for i in 0 1; do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$concern_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# --- phase 2 ---
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null
node "$WB" register-components \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --components-json '{"components":[{"id":"store","concepts_seed":["acid_transactions"],"concepts_proposed":[],"L2_decisions":[]}]}' > /dev/null
out=$(node "$WB" next-component --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
comp_id=$(echo "$out" | jq -r '.data.component_id')
node "$WB" record-discussion \
  --session-dir "$SESSION_DIR" \
  --unit-id "$comp_id" \
  --summary "Store uses synchronous replication." > /dev/null
for i in 0; do
  cid=$(echo "$out"    | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$comp_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
done
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$comp_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 2 > /dev/null

# --- phase 3 ---
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 3 > /dev/null
node "$WB" register-components \
  --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" \
  --components-json '{"components":[{"id":"replica","concepts_seed":["isolation_levels"],"concepts_proposed":[],"L2_decisions":[]}]}' > /dev/null
out=$(node "$WB" next-component --session-dir "$SESSION_DIR" --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
comp_id=$(echo "$out" | jq -r '.data.component_id')
node "$WB" record-discussion \
  --session-dir "$SESSION_DIR" \
  --unit-id "$comp_id" \
  --summary "Snapshot isolation at the replica tier." > /dev/null
cid=$(echo "$out"    | jq -r '.data.concepts[0].concept_id')
status=$(echo "$out" | jq -r '.data.concepts[0].fsrs_status')
record_concept_auto "$SESSION_DIR" "$comp_id" "$cid" "$status" "$REGISTRY" "$PROFILE_DIR"
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$comp_id" > /dev/null
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 3 > /dev/null

# --- export ---
out=$(node "$WB" export-design-doc --session-dir "$SESSION_DIR" --output "$OUTPUT")
assert_ok "$out"
[[ -f "$OUTPUT" ]] || { echo "FAIL: output file missing"; exit 1; }

for heading in "## Phase 1" "## Phase 2" "## Phase 3" "## Concept Coverage"; do
  grep -q "$heading" "$OUTPUT" || { echo "FAIL: output missing heading '$heading'"; exit 1; }
done

# The discussion summaries must also appear.
grep -q "Discussed consistency in distributed writes." "$OUTPUT" || { echo "FAIL: phase 1 discussion missing"; exit 1; }
grep -q "Store uses synchronous replication."           "$OUTPUT" || { echo "FAIL: phase 2 discussion missing"; exit 1; }
grep -q "Snapshot isolation at the replica tier."       "$OUTPUT" || { echo "FAIL: phase 3 discussion missing"; exit 1; }

echo "PASS: test-export-design-doc"
