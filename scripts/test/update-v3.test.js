'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readMarkdownWithFrontmatter } = require('../utils.js');

let tmpDir;
let profileDir;
const UPDATE = path.resolve(__dirname, '..', 'update.js');

function runUpdate(args) {
  const result = execFileSync('node', [UPDATE, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-update-v3-'));
  profileDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('update.js Phase 3 — new fields', () => {
  it('creates L2 concept with level, parent, aliases, scope_note, related_concepts', () => {
    const result = runUpdate([
      '--concept', 'write_behind_cache',
      '--domain', 'databases',
      '--grade', '3',
      '--level', '2',
      '--parent-concept', 'caching_patterns',
      '--aliases', 'write-back,delayed-write',
      '--scope-note', 'Writes go to cache first, persisted asynchronously',
      '--related-concepts', 'write_through_cache,read_through_cache',
      '--difficulty-tier', 'advanced',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');

    const filePath = path.join(profileDir, 'databases', 'write_behind_cache.md');
    assert.ok(fs.existsSync(filePath));

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.level, 2);
    assert.equal(frontmatter.parent_concept, 'caching_patterns');
    assert.deepEqual(frontmatter.aliases, ['write-back', 'delayed-write']);
    assert.equal(frontmatter.scope_note, 'Writes go to cache first, persisted asynchronously');
    assert.deepEqual(frontmatter.related_concepts, ['write_through_cache', 'read_through_cache']);
    assert.ok(frontmatter.fsrs_stability > 0);
  });

  it('creates parent L1 with --create-parent (no grade, FSRS defaults S=0, D=0)', () => {
    const result = runUpdate([
      '--concept', 'caching_patterns',
      '--domain', 'databases',
      '--create-parent',
      '--level', '1',
      '--is-seed-concept',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');

    const filePath = path.join(profileDir, 'databases', 'caching_patterns.md');
    assert.ok(fs.existsSync(filePath));

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.fsrs_stability, 0);
    assert.equal(frontmatter.fsrs_difficulty, 0);
    assert.deepEqual(frontmatter.review_history, []);
    assert.equal(frontmatter.last_reviewed, null);
    assert.equal(frontmatter.level, 1);
    assert.equal(frontmatter.is_seed_concept, true);
  });

  it('--add-alias appends to existing concept aliases array', () => {
    // Create concept first
    runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--grade', '3',
      '--aliases', 'remote-dict',
      '--profile-dir', profileDir,
    ]);

    // Add alias
    const result = runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--add-alias', 'in-memory-store',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'alias_added');

    const filePath = path.join(profileDir, 'databases', 'redis.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.ok(frontmatter.aliases.includes('remote-dict'));
    assert.ok(frontmatter.aliases.includes('in-memory-store'));
    assert.equal(frontmatter.aliases.length, 2);
  });

  it('--add-alias does not duplicate an existing alias', () => {
    runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--grade', '3',
      '--aliases', 'remote-dict',
      '--profile-dir', profileDir,
    ]);

    // Try to add same alias again
    const result = runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--add-alias', 'remote-dict',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);

    const filePath = path.join(profileDir, 'databases', 'redis.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.aliases.length, 1);
  });

  it('--body replaces markdown body of existing concept', () => {
    runUpdate([
      '--concept', 'memcached',
      '--domain', 'databases',
      '--grade', '2',
      '--notes', 'original notes',
      '--profile-dir', profileDir,
    ]);

    const newBody = '# Memcached\n\n## Summary\nSimple distributed cache.\n';
    const result = runUpdate([
      '--concept', 'memcached',
      '--domain', 'databases',
      '--body', newBody,
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'body_updated');

    const filePath = path.join(profileDir, 'databases', 'memcached.md');
    const { body, frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.ok(body.includes('Simple distributed cache.'));
    assert.ok(!body.includes('original notes'));
    // frontmatter should be unchanged
    assert.equal(frontmatter.concept_id, 'memcached');
  });

  it('existing grade-based update still works (regression)', () => {
    runUpdate([
      '--concept', 'kafka',
      '--domain', 'messaging',
      '--grade', '3',
      '--profile-dir', profileDir,
    ]);
    const result = runUpdate([
      '--concept', 'kafka',
      '--domain', 'messaging',
      '--grade', '4',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.action, 'updated');
    assert.equal(result.success, true);

    const filePath = path.join(profileDir, 'messaging', 'kafka.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.review_history.length, 2);
    assert.equal(frontmatter.review_history[1].grade, 4);
  });
});
