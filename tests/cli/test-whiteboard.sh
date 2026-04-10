#!/bin/bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== CLI Integration Tests ==="

# Test 1: Verify plugin structure is valid
echo "Test 1: Plugin structure..."
if [ -f "$PLUGIN_DIR/.claude-plugin/plugin.json" ] && \
   [ -f "$PLUGIN_DIR/skills/whiteboard/SKILL.md" ] && \
   [ -f "$PLUGIN_DIR/agents/concept-agent.md" ] && \
   [ -f "$PLUGIN_DIR/data/concepts_registry.json" ]; then
  echo "PASS: All required plugin files exist"
else
  echo "FAIL: Missing plugin files"
  exit 1
fi

# Test 2: Verify registry has correct format
echo "Test 2: Registry format..."
TOTAL=$(node -e "const r = require('$PLUGIN_DIR/data/concepts_registry.json'); console.log(r.length)")
DOMAINS=$(node -e "const r = require('$PLUGIN_DIR/data/concepts_registry.json'); console.log([...new Set(r.map(c => c.domain))].length)")
COMPLETE=$(node -e "const r = require('$PLUGIN_DIR/data/concepts_registry.json'); console.log(r.filter(c => c.concept_id && c.scope_note && c.aliases && c.level === 1).length)")

if [ "$TOTAL" -ge 400 ] && [ "$DOMAINS" -eq 18 ] && [ "$TOTAL" -eq "$COMPLETE" ]; then
  echo "PASS: Registry has $TOTAL concepts across $DOMAINS domains, all complete"
else
  echo "FAIL: Registry issues — total=$TOTAL, domains=$DOMAINS, complete=$COMPLETE"
  exit 1
fi

# Test 3: Verify domain files match registry domains
echo "Test 3: Domain files..."
DOMAIN_FILES=$(ls "$PLUGIN_DIR/data/domains/" | wc -l | tr -d ' ')
if [ "$DOMAIN_FILES" -eq 18 ]; then
  echo "PASS: 18 domain files exist"
else
  echo "FAIL: Expected 18 domain files, found $DOMAIN_FILES"
  exit 1
fi

# Test 4: Verify scripts run without errors
echo "Test 4: Script health..."
node "$PLUGIN_DIR/scripts/lookup.js" reconcile --mode exact --candidate oauth2 \
  --registry-path "$PLUGIN_DIR/data/concepts_registry.json" \
  --profile-dir /tmp/professor-cli-test-$$ > /dev/null 2>&1
echo "PASS: lookup.js reconcile runs"

echo ""
echo "=== All CLI tests passed ==="
