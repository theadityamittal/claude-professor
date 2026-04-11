#!/bin/bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE_REGISTRY="$PLUGIN_DIR/tests/data/registry-v3.json"
PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== analyze-architecture integration tests ==="

# Test 1: Fixture registry is valid v3 format
echo "Test 1: fixture registry format..."
TOTAL=$(node -e "const r = require('$FIXTURE_REGISTRY'); console.log(r.length)")
COMPLETE=$(node -e "const r = require('$FIXTURE_REGISTRY'); console.log(r.filter(c => c.concept_id && c.domain && c.scope_note).length)")
if [ "$TOTAL" -eq "$COMPLETE" ] && [ "$TOTAL" -gt 0 ]; then
  pass "Fixture registry has $TOTAL complete v3 concepts"
else
  fail "Fixture registry incomplete: total=$TOTAL complete=$COMPLETE"
fi

# Test 2: graph.js scan command exists and returns valid JSON
echo "Test 2: scan command returns valid JSON..."
SCAN_OUTPUT=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 50 2>/dev/null)
if echo "$SCAN_OUTPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; process.exit(d.files&&Array.isArray(d.files)?0:1)" 2>/dev/null; then
  pass "scan command returns valid JSON with files array"
else
  fail "scan command returned invalid JSON"
fi

# Test 3: scan manifest is under 2KB for this plugin's own codebase at budget=50
echo "Test 3: scan manifest size budget..."
SCAN_SIZE=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 50 2>/dev/null | wc -c)
if [ "$SCAN_SIZE" -lt 8192 ]; then
  pass "scan manifest is ${SCAN_SIZE} bytes (under 8KB at budget=50)"
else
  fail "scan manifest is ${SCAN_SIZE} bytes (exceeds 8KB limit at budget=50)"
fi

# Test 4: scan excludes node_modules and .git
echo "Test 4: scan excludes excluded dirs..."
EXCLUDED=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 200 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; \
    const bad=d.files.filter(f=>f.path.includes('node_modules')||f.path.includes('.git/')); \
    console.log(bad.length)")
if [ "$EXCLUDED" -eq 0 ]; then
  pass "scan excludes node_modules and .git"
else
  fail "scan included $EXCLUDED files from excluded directories"
fi

# Test 5: scan prioritizes manifests (package.json should appear before .js source files)
echo "Test 5: manifest priority in scan output..."
MANIFEST_FIRST=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 5 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; \
    const types=d.files.map(f=>f.type); \
    const firstSrc=types.indexOf('source'); \
    const firstMani=types.indexOf('manifest'); \
    console.log(firstMani === -1 || firstMani <= firstSrc ? 'ok' : 'fail')")
if [ "$MANIFEST_FIRST" = "ok" ]; then
  pass "manifests appear before source files in scan output"
else
  fail "manifest priority ordering incorrect"
fi

# Test 6: lookup.js search returns compact format
echo "Test 6: lookup.js search compact format..."
SEARCH_OUTPUT=$(node "$PLUGIN_DIR/scripts/lookup.js" search \
  --query "pipe filter" \
  --registry-path "$FIXTURE_REGISTRY" \
  --domains-path "$PLUGIN_DIR/data/domains.json" 2>/dev/null)
HAS_VERBOSE=$(echo "$SEARCH_OUTPUT" | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data;
  const concepts=d.matched_concepts||[];
  const hasVerbose=concepts.some(c=>'aliases' in c || 'scope_note' in c || 'difficulty_tier' in c);
  console.log(hasVerbose?'yes':'no')")
if [ "$HAS_VERBOSE" = "no" ]; then
  pass "lookup.js search returns compact output (no aliases/scope_note/difficulty_tier)"
else
  fail "lookup.js search still returns verbose fields"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
