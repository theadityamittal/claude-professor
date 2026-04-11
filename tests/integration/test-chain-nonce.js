'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { update } = require('../../scripts/update.js');
const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-nonce-'));
  fs.mkdirSync(path.join(testDir, 'databases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 2: Idempotency nonce', () => {
  it('first write creates, retry skips, different session updates', () => {
    const nonce1 = 'session-abc-caching';

    const created = update({
      concept: 'caching', domain: 'databases', grade: '3',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce1,
    });
    assert.strictEqual(created.action, 'created');

    const skipped = update({
      concept: 'caching', domain: 'databases', grade: '3',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce1,
    });
    assert.strictEqual(skipped.action, 'idempotent_skip');

    const file1 = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file1.frontmatter.review_history.length, 1);

    const nonce2 = 'session-def-caching';
    const updated = update({
      concept: 'caching', domain: 'databases', grade: '4',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce2,
    });
    assert.strictEqual(updated.action, 'updated');

    const file2 = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file2.frontmatter.review_history.length, 2);
    assert.strictEqual(file2.frontmatter.operation_nonce, nonce2);
  });
});
