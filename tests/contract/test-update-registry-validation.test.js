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
  { concept_id: 'feature_flags', domain: 'devops_infrastructure', difficulty_tier: 'intermediate' },
  { concept_id: 'information_retrieval', domain: 'natural_language_processing', difficulty_tier: 'intermediate' },
];

let testDir, registryPath;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ur-'));
  registryPath = path.join(testDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(FIXTURE_REGISTRY));
});
afterEach(() => fs.rmSync(testDir, { recursive: true, force: true }));

function run(args) {
  return spawnSync('node', [SCRIPT, ...args, '--registry-path', registryPath], { encoding: 'utf-8' });
}

describe('update.js registry-driven metadata', () => {
  it('L1 concept: caller --level/--parent-concept/--domain ignored; registry wins', () => {
    const r = run([
      '--concept', 'feature_flags', '--grade', '3', '--profile-dir', testDir,
      '--level', '2', '--parent-concept', 'information_retrieval', '--domain', 'wrong',
    ]);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.data.action, 'created');
    assert.strictEqual(out.data.domain, 'devops_infrastructure');
    const profile = readMarkdownWithFrontmatter(path.join(testDir, 'devops_infrastructure', 'feature_flags.md'));
    assert.strictEqual(profile.frontmatter.level, 1);
    assert.strictEqual(profile.frontmatter.is_seed_concept, true);
    assert.strictEqual(profile.frontmatter.parent_concept, null);
    assert.strictEqual(profile.frontmatter.domain, 'devops_infrastructure');
    assert.match(r.stderr, /Warning.*ignored/);
  });

  it('L1 concept: caller --is-seed-concept false ignored', () => {
    const r = run([
      '--concept', 'feature_flags', '--grade', '3', '--profile-dir', testDir,
      '--is-seed-concept', 'false',
    ]);
    assert.strictEqual(r.status, 0);
    const profile = readMarkdownWithFrontmatter(path.join(testDir, 'devops_infrastructure', 'feature_flags.md'));
    assert.strictEqual(profile.frontmatter.is_seed_concept, true);
  });

  it('schema_version is 5', () => {
    const r = run(['--concept', 'feature_flags', '--grade', '3', '--profile-dir', testDir]);
    assert.strictEqual(r.status, 0);
    const profile = readMarkdownWithFrontmatter(path.join(testDir, 'devops_infrastructure', 'feature_flags.md'));
    assert.strictEqual(profile.frontmatter.schema_version, 5);
    assert.strictEqual('aliases' in profile.frontmatter, false);
    assert.strictEqual('related_concepts' in profile.frontmatter, false);
    assert.strictEqual('scope_note' in profile.frontmatter, false);
    assert.strictEqual('documentation_url' in profile.frontmatter, false);
  });
});
