'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonce-test-'));
  fs.mkdirSync(path.join(testDir, 'testing'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('nonce idempotency', () => {
  it('writes nonce to frontmatter on first grade', () => {
    const { update } = require('../../scripts/update.js');

    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    assert.strictEqual(result.action, 'created');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.operation_nonce, 'session123-test_concept');
    assert.strictEqual(file.frontmatter.schema_version, 4);
  });

  it('returns idempotent_skip when nonce matches', () => {
    const { update } = require('../../scripts/update.js');

    // First write
    update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    // Retry with same nonce
    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    assert.strictEqual(result.action, 'idempotent_skip');

    // Verify single review_history entry
    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.review_history.length, 1);
  });

  it('proceeds with update when nonce does not match', () => {
    const { update } = require('../../scripts/update.js');

    // First write
    update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    // Different nonce (new session)
    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '4',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session456-test_concept',
    });

    assert.strictEqual(result.action, 'updated');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.review_history.length, 2);
    assert.strictEqual(file.frontmatter.operation_nonce, 'session456-test_concept');
  });

  it('works without nonce (backward compatible)', () => {
    const { update } = require('../../scripts/update.js');

    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
    });

    assert.strictEqual(result.action, 'created');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.operation_nonce, null);
  });
});
