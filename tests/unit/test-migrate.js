'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeMarkdownFile, readMarkdownWithFrontmatter } = require('../../scripts/utils.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
  fs.mkdirSync(path.join(testDir, 'databases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('adds schema_version and operation_nonce to v3 files', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases', fsrs_stability: 1.5 },
      '\n# Caching\n'
    );

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.skipped, 0);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.frontmatter.schema_version, 4);
    assert.strictEqual(file.frontmatter.operation_nonce, null);
    assert.strictEqual(file.frontmatter.concept_id, 'caching');
  });

  it('skips files already at schema_version 4', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases', schema_version: 4, operation_nonce: null },
      '\n# Caching\n'
    );

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 0);
    assert.strictEqual(result.skipped, 1);
  });

  it('dry-run does not write files', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      '\n# Caching\n'
    );

    const result = migrate(testDir, true);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.dry_run, true);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.frontmatter.schema_version, undefined);
  });

  it('preserves existing body content', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');
    const body = '\n# Caching\n\n## Notes\nImportant concept.\n';

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      body
    );

    migrate(testDir, false);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.body, body);
  });

  it('continues on per-file error', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      '\n# Caching\n'
    );

    fs.writeFileSync(path.join(testDir, 'databases', 'broken.md'), 'not valid frontmatter', 'utf-8');

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.errors, 1);
  });
});
