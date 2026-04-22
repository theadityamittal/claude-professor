'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeMarkdownFile, writeJSON } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
let sandbox, profileDir, registryPath;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'list-l2-universe-'));
  profileDir = path.join(sandbox, 'profile');
  registryPath = path.join(sandbox, 'registry.json');
  fs.mkdirSync(profileDir, { recursive: true });

  writeJSON(registryPath, [
    { concept_id: 'information_retrieval', domain: 'natural_language_processing', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate', scope_note: 'Searching and ranking text. More details follow.' },
    { concept_id: 'ranking_algorithms', domain: 'natural_language_processing', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate', scope_note: 'Ordering results by relevance.' },
    { concept_id: 'caching_strategies', domain: 'systems_design', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate', scope_note: 'Cache placement, invalidation, and eviction.' },
  ]);

  function addL2(domain, id, parent, desc) {
    const fm = {
      concept_id: id, domain, schema_version: 5, level: 2, parent_concept: parent,
      is_seed_concept: false, difficulty_tier: 'intermediate',
      first_encountered: '2026-04-01T00:00:00Z', last_reviewed: null,
      review_history: [], fsrs_stability: 1.0, fsrs_difficulty: 5.0, operation_nonce: null,
    };
    const body = `\n## Description\n\n${desc}\n\n## Teaching Guide\n\nUse inverted index analogy.\n`;
    writeMarkdownFile(path.join(profileDir, domain, `${id}.md`), fm, body);
  }
  addL2('natural_language_processing', 'sparse_vectors', 'information_retrieval', 'Sparse high-dimensional weighted term vectors. Mostly zeros.');
  addL2('natural_language_processing', 'dense_retrieval', 'information_retrieval', 'Dense embedding-based retrieval. Uses neural encoders.');
  addL2('systems_design', 'write_through_cache', 'caching_strategies', 'Writes pass through cache to backing store.');
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, 'list-l2-universe', '--profile-dir', profileDir, '--registry-path', registryPath, ...args], { encoding: 'utf-8' });
}

describe('lookup.js list-l2-universe', () => {
  it('thin mode (default) returns L2s + L1s with scope_1line', () => {
    const r = run([]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');

    const l2Ids = out.data.l2s.map(x => x.id).sort();
    assert.deepEqual(l2Ids, ['dense_retrieval', 'sparse_vectors', 'write_through_cache']);
    for (const l2 of out.data.l2s) {
      assert.ok('id' in l2);
      assert.ok('parent' in l2);
      assert.ok('scope_1line' in l2);
      // thin: scope_1line is short (first sentence)
      assert.ok(typeof l2.scope_1line === 'string');
    }

    const l1Ids = out.data.l1s.map(x => x.id).sort();
    assert.deepEqual(l1Ids, ['caching_strategies', 'information_retrieval', 'ranking_algorithms']);
    for (const l1 of out.data.l1s) {
      assert.ok('id' in l1);
      assert.ok('domain' in l1);
      assert.ok('scope_1line' in l1);
    }
  });

  it('thin mode with --thin explicit also works', () => {
    const r = run(['--thin']);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.ok(Array.isArray(out.data.l2s));
    assert.ok(Array.isArray(out.data.l1s));
  });

  it('full mode with --thin false --ids returns full metadata only for listed IDs', () => {
    const r = run(['--thin', 'false', '--ids', 'sparse_vectors,information_retrieval']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.l2s.length, 1);
    assert.equal(out.data.l2s[0].id, 'sparse_vectors');
    assert.ok('full_description' in out.data.l2s[0]);
    assert.ok('teaching_guide_summary' in out.data.l2s[0]);
    assert.equal(out.data.l1s.length, 1);
    assert.equal(out.data.l1s[0].id, 'information_retrieval');
    assert.ok('full_description' in out.data.l1s[0]);
  });

  it('full mode without --ids is a blocking error', () => {
    const r = run(['--thin', 'false']);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /full mode requires --ids/);
  });

  it('missing --profile-dir is blocking', () => {
    const r = spawnSync('node', [SCRIPT, 'list-l2-universe', '--registry-path', registryPath], { encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });
});
