'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update.js');
const FIXTURE_REGISTRY = [
  { concept_id: 'feature_flags', domain: 'devops_infrastructure', difficulty_tier: 'intermediate' },
];

let testDir, registryPath;
beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urf-'));
  registryPath = path.join(testDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(FIXTURE_REGISTRY));
});
afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

function run(args) {
  return spawnSync('node', [SCRIPT, ...args, '--registry-path', registryPath], { encoding: 'utf-8' });
}

describe('update.js removed flags', () => {
  it('--add-alias rejected with blocking error', () => {
    const r = run(['--concept', 'feature_flags', '--profile-dir', testDir, '--add-alias', 'ff']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim().split('\n').pop());
    assert.strictEqual(err.error.level, 'blocking');
    assert.match(err.error.message, /--add-alias is removed/);
  });

  it('--notes rejected with blocking error', () => {
    const r = run(['--concept', 'feature_flags', '--grade', '3', '--profile-dir', testDir, '--notes', 'x']);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim().split('\n').pop());
    assert.strictEqual(err.error.level, 'blocking');
    assert.match(err.error.message, /--notes is removed/);
  });
});
