'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeMarkdownFile } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
let profileDir;

beforeEach(() => {
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-l2-'));
});
afterEach(() => {
  fs.rmSync(profileDir, { recursive: true, force: true });
});

function makeProfile(domain, id, overrides = {}) {
  const fm = {
    concept_id: id,
    domain,
    schema_version: 5,
    level: 2,
    parent_concept: overrides.parent ?? null,
    is_seed_concept: false,
    difficulty_tier: 'intermediate',
    first_encountered: '2026-04-01T00:00:00Z',
    last_reviewed: overrides.last_reviewed ?? null,
    review_history: overrides.review_history ?? [],
    fsrs_stability: overrides.fsrs_stability ?? 1.0,
    fsrs_difficulty: 5.0,
    operation_nonce: null,
  };
  const body = overrides.body || '\n## Description\n\nx\n\n## Teaching Guide\n\nPreferred analogy: something.\n';
  writeMarkdownFile(path.join(profileDir, domain, `${id}.md`), fm, body);
}

function run(args) {
  return spawnSync('node', [SCRIPT, 'find-l2-children', ...args, '--profile-dir', profileDir], { encoding: 'utf-8' });
}

describe('lookup.js find-l2-children', () => {
  it('returns multiple children matching --parent', () => {
    makeProfile('nlp', 'sparse_vectors', { parent: 'information_retrieval', fsrs_stability: 4.2 });
    makeProfile('nlp', 'dense_retrieval', { parent: 'information_retrieval' });
    makeProfile('nlp', 'unrelated', { parent: 'other_l1' });

    const r = run(['--parent', 'information_retrieval']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.parent, 'information_retrieval');
    const ids = out.data.children.map(c => c.concept_id).sort();
    assert.deepEqual(ids, ['dense_retrieval', 'sparse_vectors']);
    for (const child of out.data.children) {
      assert.ok('fsrs_status' in child);
      assert.ok('fsrs_stability' in child);
      assert.ok('last_reviewed' in child);
      assert.ok('teaching_guide_summary' in child);
      assert.ok('domain' in child);
    }
  });

  it('returns empty children when no match', () => {
    makeProfile('nlp', 'sparse_vectors', { parent: 'information_retrieval' });
    const r = run(['--parent', 'nothing']);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.parent, 'nothing');
    assert.deepEqual(out.data.children, []);
  });

  it('ignores wrong-parent files', () => {
    makeProfile('nlp', 'a', { parent: 'information_retrieval' });
    makeProfile('nlp', 'b', { parent: 'other' });
    makeProfile('nlp', 'c', { parent: 'information_retrieval' });

    const r = run(['--parent', 'information_retrieval']);
    const out = JSON.parse(r.stdout);
    const ids = out.data.children.map(c => c.concept_id).sort();
    assert.deepEqual(ids, ['a', 'c']);
  });

  it('extracts teaching_guide_summary from body (first 200 chars)', () => {
    const longBody = '\n## Description\n\nDesc.\n\n## Teaching Guide\n\n' + 'X'.repeat(300) + '\n';
    makeProfile('nlp', 'x', { parent: 'p', body: longBody });
    const r = run(['--parent', 'p']);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.children.length, 1);
    const summary = out.data.children[0].teaching_guide_summary;
    assert.ok(summary);
    assert.ok(summary.length <= 200);
  });

  it('returns null teaching_guide_summary when section absent', () => {
    const noTG = '\n## Description\n\nDesc only.\n';
    makeProfile('nlp', 'y', { parent: 'p', body: noTG });
    const r = run(['--parent', 'p']);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.children[0].teaching_guide_summary, null);
  });

  it('errors with blocking on missing --parent', () => {
    const r = spawnSync('node', [SCRIPT, 'find-l2-children', '--profile-dir', profileDir], { encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });
});
