'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeJSON } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
let sandbox, registryPath, profileDir;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-no-alias-'));
  registryPath = path.join(sandbox, 'registry.json');
  profileDir = path.join(sandbox, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  writeJSON(registryPath, [
    { concept_id: 'arrays', domain: 'algo', level: 1, is_seed_concept: true, difficulty_tier: 'beginner', aliases: ['array', 'vector'], scope_note: 'x' },
  ]);
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('lookup.js reconcile (alias removed)', () => {
  it('rejects --mode alias with blocking error containing "alias is removed"', () => {
    const r = spawnSync('node', [
      SCRIPT, 'reconcile',
      '--mode', 'alias',
      '--candidate', 'array',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ], { encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /alias is removed/);
  });

  it('exact mode still works', () => {
    const r = spawnSync('node', [
      SCRIPT, 'reconcile',
      '--mode', 'exact',
      '--candidate', 'arrays',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ], { encoding: 'utf-8' });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.match_type, 'exact');
    assert.equal(out.data.concept_id, 'arrays');
  });

  it('exact mode with no match returns no_match', () => {
    const r = spawnSync('node', [
      SCRIPT, 'reconcile',
      '--mode', 'exact',
      '--candidate', 'nonexistent_xyz',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ], { encoding: 'utf-8' });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.match_type, 'no_match');
  });
});
