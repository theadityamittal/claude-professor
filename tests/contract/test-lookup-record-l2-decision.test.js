'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
let sessionDir;

beforeEach(() => {
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-l2-'));
});
afterEach(() => {
  fs.rmSync(sessionDir, { recursive: true, force: true });
});

function run(proposed, decision) {
  return spawnSync('node', [
    SCRIPT, 'record-l2-decision',
    '--session-dir', sessionDir,
    '--proposed', proposed,
    '--decision-json', JSON.stringify(decision),
  ], { encoding: 'utf-8' });
}

function readLog() {
  const logPath = path.join(sessionDir, '.session-log.jsonl');
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
}

describe('lookup.js record-l2-decision', () => {
  it('valid semantic_l2 returns use_existing + matched_id', () => {
    const r = run('rrf', {
      match: 'semantic_l2',
      matched_id: 'reciprocal_rank_fusion',
      confidence: 0.91,
      reasoning: 'Same concept with different naming.',
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.action, 'use_existing');
    assert.equal(out.data.id, 'reciprocal_rank_fusion');
  });

  it('valid l1_instead returns use_existing + matched_id (the L1)', () => {
    const r = run('some_proposed', {
      match: 'l1_instead',
      matched_id: 'information_retrieval',
      confidence: 0.8,
      reasoning: 'Proposed is actually a rename of the L1.',
    });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.action, 'use_existing');
    assert.equal(out.data.id, 'information_retrieval');
  });

  it('valid parent_disputed returns accept_with_new_parent', () => {
    const r = run('weird_thing', {
      match: 'parent_disputed',
      suggested_parent: 'other_l1',
      confidence: 0.6,
      reasoning: 'Parent seems wrong.',
    });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.action, 'accept_with_new_parent');
    assert.equal(out.data.id, 'weird_thing');
  });

  it('valid no_match returns accept_novel + original id', () => {
    const r = run('novel_concept', {
      match: 'no_match',
      confidence: 0.95,
      reasoning: 'Not in universe.',
    });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.action, 'accept_novel');
    assert.equal(out.data.id, 'novel_concept');
  });

  it('invalid schema (semantic_l2 without matched_id) blocks', () => {
    const r = run('x', {
      match: 'semantic_l2',
      confidence: 0.9,
      reasoning: 'Missing matched_id.',
    });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /schema invalid/i);
  });

  it('confidence out of range blocks', () => {
    const r = run('x', {
      match: 'no_match',
      confidence: 1.5,
      reasoning: 'Bad confidence.',
    });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /confidence/i);
  });

  it('empty reasoning blocks', () => {
    const r = run('x', {
      match: 'no_match',
      confidence: 0.9,
      reasoning: '',
    });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /reasoning/i);
  });

  it('appends l2_decision event to session log', () => {
    run('rrf', {
      match: 'semantic_l2',
      matched_id: 'reciprocal_rank_fusion',
      confidence: 0.9,
      reasoning: 'Same thing.',
    });
    run('other', {
      match: 'no_match',
      confidence: 0.8,
      reasoning: 'Novel.',
    });
    const events = readLog();
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'l2_decision');
    assert.equal(events[0].proposed, 'rrf');
    assert.equal(events[0].decision, 'semantic_l2');
    assert.equal(events[0].matched_id, 'reciprocal_rank_fusion');
    assert.equal(events[1].proposed, 'other');
    assert.equal(events[1].decision, 'no_match');
  });

  it('invalid match value blocks', () => {
    const r = run('x', {
      match: 'invalid_value',
      confidence: 0.5,
      reasoning: 'whatever',
    });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });
});
