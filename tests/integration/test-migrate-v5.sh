#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

cp -R tests/fixtures/profiles-v4/. "$WORK/"

# Run migration
out=$(node scripts/migrate-v5.js --profile-dir "$WORK")
echo "$out" | jq -e '.status == "ok"' > /dev/null
files_migrated=$(echo "$out" | jq -r '.data.files_migrated')
[[ "$files_migrated" -ge 4 ]]

# Diff non-malformed fixtures against expected
for expected in tests/fixtures/profiles-v5-expected/*.md; do
  name=$(basename "$expected")
  diff -u "$expected" "$WORK/$name"
done

# Idempotency: run again, expect everything skipped
out=$(node scripts/migrate-v5.js --profile-dir "$WORK")
already_v5=$(echo "$out" | jq -r '.data.files_skipped_already_v5')
[[ "$already_v5" -ge 4 ]]

echo "PASS: migrate-v5 happy path + idempotency"
