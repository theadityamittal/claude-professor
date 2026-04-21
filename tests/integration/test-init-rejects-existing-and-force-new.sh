#!/usr/bin/env bash
# T-INT-1: init-session idempotency. Second init without --force-new is a
# blocking error; with --force-new it replaces the existing state file.
set -euo pipefail
source "$(dirname "$0")/_setup.sh"

DIR="$(mktemp -d -t wb-init-force-XXXXXX)"
trap "rm -rf $DIR" EXIT

SESSION_DIR="$DIR/session"
CONCERNS="$DIR/concerns.json"
mkdir -p "$SESSION_DIR"
make_test_concerns "$CONCERNS"

node "$WB" init-session --task "first task" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" > /dev/null
first_id=$(jq -r '.session_id' "$SESSION_DIR/.session-state.json")
[[ -n "$first_id" && "$first_id" != "null" ]] || { echo "FAIL: first session_id missing"; exit 1; }

# Second init without --force-new must fail with blocking error.
set +e
stderr=$(node "$WB" init-session --task "second task" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" 2>&1 >/dev/null)
status=$?
set -e
[[ "$status" != "0" ]] || { echo "FAIL: second init without --force-new should have failed"; exit 1; }
echo "$stderr" | jq -e '.error.level == "blocking"' > /dev/null || { echo "FAIL: expected blocking error, got: $stderr"; exit 1; }
echo "$stderr" | jq -e '.error.message | test("Session state exists")' > /dev/null || { echo "FAIL: error message mismatch: $stderr"; exit 1; }

# State file untouched by the rejected init.
task_after_block=$(jq -r '.task' "$SESSION_DIR/.session-state.json")
[[ "$task_after_block" == "first task" ]] || { echo "FAIL: task mutated on rejected init"; exit 1; }

# --force-new replaces state.
node "$WB" init-session --task "third task" --session-dir "$SESSION_DIR" --concerns-path "$CONCERNS" --force-new > /dev/null
new_id=$(jq -r '.session_id' "$SESSION_DIR/.session-state.json")
new_task=$(jq -r '.task' "$SESSION_DIR/.session-state.json")
[[ "$new_task" == "third task" ]] || { echo "FAIL: task not replaced by --force-new"; exit 1; }
[[ "$new_id" != "$first_id" ]] || { echo "FAIL: session_id unchanged after --force-new"; exit 1; }

echo "PASS: test-init-rejects-existing-and-force-new"
