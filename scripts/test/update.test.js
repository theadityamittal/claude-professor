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
  profileDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('update.js', () => {
  it('creates new concept as markdown file', () => {
    const result = runUpdate([
      '--concept', 'cache_aside_pattern',
      '--domain', 'databases',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
      '--notes', 'Learned during Redis caching design',
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');
    assert.equal(result.concept_id, 'cache_aside_pattern');
    assert.ok(result.new_stability > 0);

    // Verify markdown file was created
    const filePath = path.join(profileDir, 'databases', 'cache_aside_pattern.md');
    assert.ok(fs.existsSync(filePath), 'Expected markdown file to exist');

    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.startsWith('---json\n'), 'Expected JSON frontmatter');
    assert.ok(raw.includes('"concept_id": "cache_aside_pattern"'));
    assert.ok(raw.includes('# Cache Aside Pattern'), 'Expected human-readable title');
    assert.ok(raw.includes('Redis caching design'), 'Expected notes in body');
  });

  it('updates existing markdown concept file', () => {
    // Create initial
    runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    // Update
    const result = runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.equal(result.action, 'updated');

    // Verify review_history appended in frontmatter
    const filePath = path.join(profileDir, 'databases', 'redis.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.review_history.length, 2);
    assert.equal(frontmatter.review_history[1].grade, 4);
  });

  it('preserves markdown body when updating frontmatter', () => {
    // Create with notes
    runUpdate([
      '--concept', 'noted_concept', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
      '--notes', 'Important context here',
    ]);
    // Update grade only (no --notes)
    runUpdate([
      '--concept', 'noted_concept', '--domain', 'backend',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);

    const filePath = path.join(profileDir, 'backend', 'noted_concept.md');
    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.includes('Important context here'), 'Body should be preserved');
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
    const filePath = path.join(profileDir, 'testing', 'test_lapse.md');
    const { frontmatter: fm1 } = readMarkdownWithFrontmatter(filePath);
    const stabilityBefore = fm1.fsrs_stability;

    const result = runUpdate([
      '--concept', 'test_lapse', '--domain', 'testing',
      '--grade', '1', '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.ok(result.new_stability <= stabilityBefore,
      `Lapse should not increase stability: ${result.new_stability} > ${stabilityBefore}`);
  });

  it('preserves documentation_url across updates', () => {
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
    const filePath = path.join(profileDir, 'backend', 'noted.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.documentation_url, 'https://example.com/docs');
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
});
