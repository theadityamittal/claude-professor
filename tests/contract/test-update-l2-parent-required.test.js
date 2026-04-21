'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update.js');
const FIXTURE_REGISTRY = [
  { concept_id: 'information_retrieval', domain: 'natural_language_processing', difficulty_tier: 'intermediate' },
];

let testDir, registryPath;
beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ul2-'));
  registryPath = path.join(testDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(FIXTURE_REGISTRY));
});
afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

function run(args) {
  return spawnSync('node', [SCRIPT, ...args, '--registry-path', registryPath], { encoding: 'utf-8' });
}

describe('update.js L2 parent requirement', () => {
  it('non-registry concept without --parent-concept blocks', () => {
    const r = run(['--concept', 'sparse_vectors', '--grade', '3', '--profile-dir', testDir]);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim().split('\n').pop());
    assert.strictEqual(err.error.level, 'blocking');
    assert.match(err.error.message, /L2 concept requires --parent-concept/);
  });

  it('non-registry concept with valid --parent-concept succeeds; inherits domain', () => {
    const r = run([
      '--concept', 'sparse_vectors', '--grade', '3', '--profile-dir', testDir,
      '--parent-concept', 'information_retrieval',
    ]);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.data.action, 'created');
    assert.strictEqual(out.data.domain, 'natural_language_processing');
    const profile = readMarkdownWithFrontmatter(path.join(testDir, 'natural_language_processing', 'sparse_vectors.md'));
    assert.strictEqual(profile.frontmatter.level, 2);
    assert.strictEqual(profile.frontmatter.is_seed_concept, false);
    assert.strictEqual(profile.frontmatter.parent_concept, 'information_retrieval');
  });

  it('non-registry concept with invalid --parent-concept blocks', () => {
    const r = run([
      '--concept', 'sparse_vectors', '--grade', '3', '--profile-dir', testDir,
      '--parent-concept', 'ghost_l1',
    ]);
    assert.notStrictEqual(r.status, 0);
    const err = JSON.parse(r.stderr.trim().split('\n').pop());
    assert.strictEqual(err.error.level, 'blocking');
    assert.match(err.error.message, /parent_concept must be a registry L1/);
  });
});
