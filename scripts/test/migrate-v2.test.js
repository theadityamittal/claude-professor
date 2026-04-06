'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readMarkdownWithFrontmatter } = require('../utils.js');

let tmpDir, sourceDir, targetDir;
const scriptPath = path.resolve(__dirname, '..', 'migrate-v2.js');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-migrate-'));
  sourceDir = path.join(tmpDir, 'profile');
  targetDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(sourceDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrate-v2', () => {
  it('converts JSON profile to markdown concept files', () => {
    fs.writeFileSync(path.join(sourceDir, 'databases.json'), JSON.stringify([
      {
        concept_id: 'connection_pooling',
        domain: 'databases',
        is_registry_concept: true,
        difficulty_tier: 'intermediate',
        first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-05T00:00:00Z',
        review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
        fsrs_stability: 10.0,
        fsrs_difficulty: 5.0,
        documentation_url: null,
        notes: 'Test note',
      },
    ]));

    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir], {
      encoding: 'utf-8', timeout: 5000,
    });

    const filePath = path.join(targetDir, 'databases', 'connection_pooling.md');
    assert.ok(fs.existsSync(filePath), 'Concept file should exist');

    const { frontmatter, body } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.concept_id, 'connection_pooling');
    assert.equal(frontmatter.fsrs_stability, 10.0);
    assert.ok(body.includes('Test note'));
    assert.ok(output.includes('1 concept'));
  });

  it('is idempotent — running twice does not duplicate', () => {
    fs.writeFileSync(path.join(sourceDir, 'backend.json'), JSON.stringify([
      { concept_id: 'rest_api', domain: 'backend', is_registry_concept: true,
        difficulty_tier: 'foundational', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
        fsrs_stability: 8.0, fsrs_difficulty: 3.0, documentation_url: null, notes: null },
    ]));

    execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });
    execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });

    const files = fs.readdirSync(path.join(targetDir, 'backend'));
    assert.equal(files.length, 1);
  });

  it('handles empty source directory', () => {
    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });
    assert.ok(output.includes('0 concept'));
  });

  it('migrates multiple concepts across multiple domains', () => {
    fs.writeFileSync(path.join(sourceDir, 'databases.json'), JSON.stringify([
      { concept_id: 'redis', domain: 'databases', is_registry_concept: true,
        difficulty_tier: 'intermediate', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
        fsrs_stability: 5.0, fsrs_difficulty: 4.0, documentation_url: null, notes: null },
      { concept_id: 'cache_invalidation', domain: 'databases', is_registry_concept: true,
        difficulty_tier: 'advanced', first_encountered: '2026-04-02T00:00:00Z',
        last_reviewed: '2026-04-02T00:00:00Z', review_history: [{ date: '2026-04-02T00:00:00Z', grade: 2 }],
        fsrs_stability: 3.0, fsrs_difficulty: 6.0, documentation_url: 'https://example.com', notes: 'Tricky' },
    ]));
    fs.writeFileSync(path.join(sourceDir, 'backend.json'), JSON.stringify([
      { concept_id: 'rest_api', domain: 'backend', is_registry_concept: true,
        difficulty_tier: 'foundational', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
        fsrs_stability: 8.0, fsrs_difficulty: 3.0, documentation_url: null, notes: null },
    ]));

    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });

    assert.ok(fs.existsSync(path.join(targetDir, 'databases', 'redis.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'databases', 'cache_invalidation.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'backend', 'rest_api.md')));
    assert.ok(output.includes('3 concept'));
  });
});
