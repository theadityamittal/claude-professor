'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let profileDir;
const scriptPath = path.resolve(__dirname, '..', 'update.js');

function runUpdate(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-update-'));
  profileDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('update.js', () => {
  it('creates new concept in new domain file', () => {
    const result = runUpdate([
      '--concept', 'cache_aside_pattern',
      '--domain', 'databases',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');
    assert.equal(result.concept_id, 'cache_aside_pattern');
    assert.ok(result.new_stability > 0);

    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'databases.json'), 'utf-8'
    ));
    assert.equal(profile.length, 1);
    assert.equal(profile[0].concept_id, 'cache_aside_pattern');
    assert.equal(profile[0].review_history.length, 1);
    assert.equal(profile[0].review_history[0].grade, 3);
  });

  it('updates existing concept with new grade', () => {
    runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    const result = runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.equal(result.action, 'updated');

    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'databases.json'), 'utf-8'
    ));
    assert.equal(profile[0].review_history.length, 2);
    assert.equal(profile[0].review_history[1].grade, 4);
  });

  it('uses initial stability for first encounter', () => {
    const result = runUpdate([
      '--concept', 'test_concept', '--domain', 'testing',
      '--grade', '3', '--is-registry-concept', 'false',
      '--difficulty-tier', 'foundational', '--profile-dir', profileDir,
    ]);
    assert.ok(Math.abs(result.new_stability - 2.3065) < 0.01,
      `Expected ~2.3065, got ${result.new_stability}`);
  });

  it('lapse never increases stability', () => {
    runUpdate([
      '--concept', 'test_lapse', '--domain', 'testing',
      '--grade', '4', '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    const profile1 = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'testing.json'), 'utf-8'
    ));
    const stabilityBefore = profile1[0].fsrs_stability;

    const result = runUpdate([
      '--concept', 'test_lapse', '--domain', 'testing',
      '--grade', '1', '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.ok(result.new_stability <= stabilityBefore,
      `Lapse should not increase stability: ${result.new_stability} > ${stabilityBefore}`);
  });

  it('preserves documentation_url and notes', () => {
    runUpdate([
      '--concept', 'noted', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
      '--documentation-url', 'https://example.com/docs',
      '--notes', 'Test note',
    ]);
    runUpdate([
      '--concept', 'noted', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'backend.json'), 'utf-8'
    ));
    assert.equal(profile[0].documentation_url, 'https://example.com/docs');
    assert.equal(profile[0].notes, 'Test note');
  });

  it('exits with code 1 on missing required args', () => {
    assert.throws(() => {
      execFileSync('node', [scriptPath, '--concept', 'test'], {
        encoding: 'utf-8', timeout: 5000,
      });
    }, (err) => err.status === 1);
  });

  it('rejects invalid grade values', () => {
    for (const bad of ['0', '5', 'abc', '-1']) {
      assert.throws(() => {
        execFileSync('node', [
          scriptPath, '--concept', 'test_invalid', '--domain', 'testing',
          '--grade', bad, '--profile-dir', profileDir,
        ], { encoding: 'utf-8', timeout: 5000 });
      }, (err) => err.status === 1, `Expected exit 1 for grade=${bad}`);
    }
  });

  it('does not corrupt sibling concepts when updating one', () => {
    runUpdate([
      '--concept', 'concept_a', '--domain', 'testing',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'foundational', '--profile-dir', profileDir,
    ]);
    runUpdate([
      '--concept', 'concept_b', '--domain', 'testing',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);

    // Update only concept_b
    runUpdate([
      '--concept', 'concept_b', '--domain', 'testing',
      '--grade', '1', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);

    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'testing.json'), 'utf-8'
    ));
    const a = profile.find(c => c.concept_id === 'concept_a');
    const b = profile.find(c => c.concept_id === 'concept_b');
    assert.equal(a.review_history.length, 1, 'concept_a should be untouched');
    assert.equal(b.review_history.length, 2, 'concept_b should have 2 reviews');
  });
});
