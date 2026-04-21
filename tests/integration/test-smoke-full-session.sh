#!/usr/bin/env bash
# Tier 5 smoke test: drive a full whiteboard session through phases 1-4
# end-to-end, export a design doc, and finish. Verifies the whole chain.
#
# This test uses hardcoded L2 decisions (no real matcher invocation) and
# simulates professor decisions via the shared record_concept_auto helper
# that pairs actions to FSRS statuses per spec §2.6.

set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR=$(mktemp -d)
trap "rm -rf $DIR" EXIT

CONCERNS="$DIR/concerns.json"
REGISTRY="$DIR/registry.json"
SESSION_DIR="$DIR/session"
PROFILE_DIR="$DIR/profiles"
OUTPUT_DOC="$DIR/design-doc.md"

make_test_concerns "$CONCERNS"
make_test_registry "$REGISTRY"
mkdir -p "$SESSION_DIR" "$PROFILE_DIR"

# === Phase 0: Init ===
node "$WB" init-session --task "Smoke test full session" \
  --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null

# === Phase 1: Requirements ===
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 1 > /dev/null
node "$WB" register-selection --session-dir "$SESSION_DIR" \
  --concerns-path "$CONCERNS" --registry-path "$REGISTRY" \
  --concerns-json '{"concerns":[{"id":"data_consistency","source":"catalog"}]}' > /dev/null

# Process the one scheduled concern
out=$(node "$WB" next-concern --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
concern_id=$(echo "$out" | jq -r '.data.concern_id')
concepts_count=$(echo "$out" | jq -r '.data.concepts | length')

for i in $(seq 0 $((concepts_count - 1))); do
  concept=$(echo "$out" | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$concern_id" "$concept" "$status" "$REGISTRY" "$PROFILE_DIR" > /dev/null
done

node "$WB" record-discussion --session-dir "$SESSION_DIR" \
  --unit-id "$concern_id" \
  --summary "Chose optimistic concurrency with per-row version for writes." > /dev/null
node "$WB" mark-concern-done --session-dir "$SESSION_DIR" --id "$concern_id" > /dev/null

# Confirm next returns done
out=$(node "$WB" next-concern --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
[[ $(echo "$out" | jq -r '.data.done') == "true" ]]

# Gate + phase complete
out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 1)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]]
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 1 > /dev/null

# === Phase 2: HLD ===
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 2 > /dev/null
node "$WB" register-components --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --components-json '{
    "components":[{
      "id":"retrieval",
      "concepts_seed":["information_retrieval","ranking_algorithms"],
      "concepts_proposed":[],
      "L2_decisions":[]
    }]
  }' > /dev/null

out=$(node "$WB" next-component --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
component_id=$(echo "$out" | jq -r '.data.component_id')
concepts_count=$(echo "$out" | jq -r '.data.concepts | length')

for i in $(seq 0 $((concepts_count - 1))); do
  concept=$(echo "$out" | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$component_id" "$concept" "$status" "$REGISTRY" "$PROFILE_DIR" > /dev/null
done

node "$WB" record-discussion --session-dir "$SESSION_DIR" \
  --unit-id "$component_id" \
  --summary "Retrieval uses BM25 + optional reranker; cache top-K per user." > /dev/null
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$component_id" > /dev/null

out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 2)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]]
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 2 > /dev/null

# === Phase 3: LLD (reuse single component; concepts now in gradebook) ===
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 3 > /dev/null
node "$WB" register-components --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --components-json '{
    "components":[{
      "id":"ranker",
      "concepts_seed":["ranking_algorithms"],
      "concepts_proposed":[],
      "L2_decisions":[]
    }]
  }' > /dev/null

out=$(node "$WB" next-component --session-dir "$SESSION_DIR" \
  --registry-path "$REGISTRY" --profile-dir "$PROFILE_DIR")
component_id=$(echo "$out" | jq -r '.data.component_id')
concepts_count=$(echo "$out" | jq -r '.data.concepts | length')

for i in $(seq 0 $((concepts_count - 1))); do
  concept=$(echo "$out" | jq -r ".data.concepts[$i].concept_id")
  status=$(echo "$out" | jq -r ".data.concepts[$i].fsrs_status")
  record_concept_auto "$SESSION_DIR" "$component_id" "$concept" "$status" "$REGISTRY" "$PROFILE_DIR" > /dev/null
done

node "$WB" record-discussion --session-dir "$SESSION_DIR" \
  --unit-id "$component_id" \
  --summary "Ranker wraps scorer; pluggable strategy for future A/B tests." > /dev/null
node "$WB" mark-component-done --session-dir "$SESSION_DIR" --id "$component_id" > /dev/null

out=$(node "$GATE" checkpoint --session-dir "$SESSION_DIR" --step 3)
[[ $(echo "$out" | jq -r '.data.result') == "passed" ]]
node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 3 > /dev/null

# === Phase 4: Deliverable ===
node "$WB" phase-start --session-dir "$SESSION_DIR" --phase 4 > /dev/null
out=$(node "$WB" export-design-doc --session-dir "$SESSION_DIR" --output "$OUTPUT_DOC")
echo "$out" | jq -e '.status == "ok"' > /dev/null
[[ -f "$OUTPUT_DOC" ]]

# Verify design doc content
grep -q '## Phase 1' "$OUTPUT_DOC"
grep -q '## Phase 2' "$OUTPUT_DOC"
grep -q '## Phase 3' "$OUTPUT_DOC"
grep -q 'optimistic concurrency' "$OUTPUT_DOC"
grep -q 'BM25' "$OUTPUT_DOC"

node "$WB" phase-complete --session-dir "$SESSION_DIR" --phase 4 > /dev/null

# === Finish (default: delete state + log) ===
node "$WB" finish --session-dir "$SESSION_DIR" > /dev/null
[[ ! -f "$SESSION_DIR/.session-state.json" ]]
[[ ! -f "$SESSION_DIR/.session-log.jsonl" ]]

echo "PASS: full-session smoke test (phases 1-4 + export + finish)"
