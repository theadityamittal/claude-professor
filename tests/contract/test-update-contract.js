'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update.js');

// Fixture registry: test_concept exists as L1 in domain "testing"
const FIXTURE_REGISTRY = [
  { concept_id: 'test_concept', domain: 'testing', difficulty_tier: 'intermediate', level: 1, parent_concept: null, is_seed_concept: true },
];

let testDir;
let registryPath;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-update-'));
  registryPath = path.join(testDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(FIXTURE_REGISTRY));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args, '--registry-path', registryPath], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('update.js contract (v5)', () => {
  it('create returns envelope with action created', () => {
    const output = run([
      '--concept', 'test_concept', '--grade', '3',
      '--profile-dir', testDir,
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'created');
    assert.strictEqual(output.data.success, true);
    assert.strictEqual(output.data.domain, 'testing');
    assert.strictEqual('error' in output, false);
  });

  it('nonce skip returns envelope with action idempotent_skip', () => {
    run([
      '--concept', 'test_concept', '--grade', '3',
      '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    const output = run([
      '--concept', 'test_concept', '--grade', '3',
      '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'idempotent_skip');
  });
});
