#!/usr/bin/env bash
# Concept-matcher regression test runner (scaffold).
#
# Phase 1 (this scaffold, T-AGENT-1.3):
#   - Validates every fixture is well-formed JSON and contains required fields.
#   - Iterates and prints fixture names so CI can confirm coverage.
#   - DOES NOT invoke a live matcher — that wiring is deferred to T-AGENT-1.4.
#
# Phase 2 (T-AGENT-1.4): replace each "TODO: invoke matcher" stub with a real
# call to the matcher subagent (via CLAUDE_CLI_BIN), parse its JSON output,
# diff against expected_*, and enforce the >=90% pass threshold.
#
# Usage:
#   bash tests/integration/test-matcher-regression.sh
#   CLAUDE_CLI_BIN=$(which claude) bash tests/integration/test-matcher-regression.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAGE1_DIR="tests/fixtures/matcher-regression/stage1"
STAGE2_DIR="tests/fixtures/matcher-regression/stage2"

if [ ! -d "$STAGE1_DIR" ] || [ ! -d "$STAGE2_DIR" ]; then
  echo "FAIL: fixture directories missing"
  echo "  expected: $STAGE1_DIR and $STAGE2_DIR"
  exit 1
fi

# Use jq if available, fall back to node for JSON parsing.
parse_field() {
  local file="$1"
  local field="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".${field} // empty" "$file"
  else
    node -e "const o=JSON.parse(require('fs').readFileSync('$file','utf8'));const v=o['$field'];process.stdout.write(v==null?'':String(v));"
  fi
}

TOTAL=0
PASSED=0
FAILED_NAMES=()

if [ -z "${CLAUDE_CLI_BIN:-}" ]; then
  echo "SKIP: CLAUDE_CLI_BIN not set — live matcher invocation deferred to T-AGENT-1.4"
  echo "      Validating fixture shape only."
  echo
fi

# --- Stage 1 ---
echo "=== Stage 1 fixtures ==="
for fixture in "$STAGE1_DIR"/*.json; do
  TOTAL=$((TOTAL + 1))
  name="$(parse_field "$fixture" 'name')"
  if [ -z "$name" ]; then
    echo "FAIL: missing 'name' in $fixture"
    FAILED_NAMES+=("$(basename "$fixture")")
    continue
  fi
  if [ -z "${CLAUDE_CLI_BIN:-}" ]; then
    echo "  [validated] $name"
    PASSED=$((PASSED + 1))
    continue
  fi
  # TODO(T-AGENT-1.4): invoke matcher Stage 1 with this fixture, parse JSON
  # output, assert top_candidates includes expected_top_candidate_ids, and
  # assert confidence >= min_confidence.
  echo "  [TODO live] $name"
done

# --- Stage 2 ---
echo
echo "=== Stage 2 fixtures ==="
for fixture in "$STAGE2_DIR"/*.json; do
  TOTAL=$((TOTAL + 1))
  name="$(parse_field "$fixture" 'name')"
  if [ -z "$name" ]; then
    echo "FAIL: missing 'name' in $fixture"
    FAILED_NAMES+=("$(basename "$fixture")")
    continue
  fi
  if [ -z "${CLAUDE_CLI_BIN:-}" ]; then
    echo "  [validated] $name"
    PASSED=$((PASSED + 1))
    continue
  fi
  # TODO(T-AGENT-1.4): invoke matcher Stage 2 with this fixture, parse JSON
  # output, assert match == expected_match, matched_id == expected_matched_id
  # (when applicable), suggested_parent == expected_suggested_parent (when
  # applicable), and confidence >= expected_confidence_min.
  echo "  [TODO live] $name"
done

echo
PCT=0
if [ "$TOTAL" -gt 0 ]; then
  PCT=$((PASSED * 100 / TOTAL))
fi
echo "Total: $PASSED/$TOTAL ($PCT%)"

if [ "${#FAILED_NAMES[@]}" -gt 0 ]; then
  echo "Failed fixtures:"
  for n in "${FAILED_NAMES[@]}"; do
    echo "  - $n"
  done
  exit 1
fi

if [ -z "${CLAUDE_CLI_BIN:-}" ]; then
  echo "NOTE: Regression threshold (>=90%) not enforced until T-AGENT-1.4 wires up live matcher invocation."
  exit 0
fi

# Once T-AGENT-1.4 lands, enforce the threshold here:
#   THRESHOLD=90
#   if [ "$PCT" -lt "$THRESHOLD" ]; then
#     echo "FAIL: regression accuracy $PCT% < $THRESHOLD%"
#     exit 1
#   fi
echo "NOTE: threshold enforcement pending T-AGENT-1.4."
exit 0
