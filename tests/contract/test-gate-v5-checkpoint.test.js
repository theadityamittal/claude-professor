'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'gate.js');
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-v5-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeState(state) {
  fs.writeFileSync(path.join(dir, '.session-state.json'), JSON.stringify(state));
}

function runCheckpoint(step, extraArgs = []) {
  return spawnSync(
    'node',
    [SCRIPT, 'checkpoint', '--session-dir', dir, '--step', String(step), ...extraArgs],
    { encoding: 'utf-8' },
  );
}

describe('gate.js checkpoint (v5)', () => {
  it('phase 1 passed: all concerns concepts checked → result=passed, missing=[]', () => {
    writeState({
      schema_version: 5,
      phases: {
        '1': {
          status: 'in_progress',
          concerns: [
            { id: 'c1', concepts: ['x', 'y'] },
            { id: 'c2', concepts: ['z'] },
          ],
        },
      },
      concepts_checked: [
        { concept_id: 'x', phase: 1, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'y', phase: 1, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'z', phase: 1, grade: 4, timestamp: '2026-04-20T00:00:00Z' },
      ],
    });

    const r = runCheckpoint(1);
    assert.equal(r.status, 0, `expected 0 exit, got ${r.status}; stderr=${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.result, 'passed');
    assert.deepEqual(out.data.missing, []);
    assert.equal(out.data.scheduled_count, 3);
    assert.equal(out.data.checked_count, 3);
    assert.ok(out.data.timestamp);
  });

  it('phase 1 blocked: one concept missing → result=blocked, missing includes id', () => {
    writeState({
      schema_version: 5,
      phases: {
        '1': {
          status: 'in_progress',
          concerns: [{ id: 'c1', concepts: ['x', 'y'] }],
        },
      },
      concepts_checked: [
        { concept_id: 'x', phase: 1, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
      ],
    });

    const r = runCheckpoint(1);
    assert.equal(r.status, 0, `expected 0 exit, got ${r.status}; stderr=${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.result, 'blocked');
    assert.deepEqual(out.data.missing, ['y']);
    assert.equal(out.data.scheduled_count, 2);
    assert.equal(out.data.checked_count, 1);
  });

  it('phase 2 passed: concepts_seed + concepts_proposed all checked → result=passed', () => {
    writeState({
      schema_version: 5,
      phases: {
        '2': {
          status: 'in_progress',
          components: [
            {
              id: 'retrieval',
              concepts_seed: ['a', 'b'],
              concepts_proposed: [{ id: 'c', parent: 'a' }],
            },
            {
              id: 'ranking',
              concepts_seed: ['d'],
              concepts_proposed: [],
            },
          ],
        },
      },
      concepts_checked: [
        { concept_id: 'a', phase: 2, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'b', phase: 2, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'c', phase: 2, grade: 4, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'd', phase: 2, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
      ],
    });

    const r = runCheckpoint(2);
    assert.equal(r.status, 0, `expected 0 exit, got ${r.status}; stderr=${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.result, 'passed');
    assert.deepEqual(out.data.missing, []);
    assert.equal(out.data.scheduled_count, 4);
    assert.equal(out.data.checked_count, 4);
  });

  it('phase 2 blocked: one seed missing → result=blocked with that id', () => {
    writeState({
      schema_version: 5,
      phases: {
        '2': {
          status: 'in_progress',
          components: [
            {
              id: 'retrieval',
              concepts_seed: ['a', 'b'],
              concepts_proposed: [{ id: 'c', parent: 'a' }],
            },
          ],
        },
      },
      concepts_checked: [
        { concept_id: 'a', phase: 2, grade: 3, timestamp: '2026-04-20T00:00:00Z' },
        { concept_id: 'c', phase: 2, grade: 4, timestamp: '2026-04-20T00:00:00Z' },
      ],
    });

    const r = runCheckpoint(2);
    assert.equal(r.status, 0, `expected 0 exit, got ${r.status}; stderr=${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.result, 'blocked');
    assert.deepEqual(out.data.missing, ['b']);
    assert.equal(out.data.scheduled_count, 3);
    assert.equal(out.data.checked_count, 2);
  });

  it('--force-proceed flag is rejected (non-zero exit, unknown flag)', () => {
    writeState({
      schema_version: 5,
      phases: {
        '1': { status: 'in_progress', concerns: [{ id: 'c1', concepts: ['x'] }] },
      },
      concepts_checked: [],
    });

    const r = runCheckpoint(1, ['--force-proceed']);
    assert.notEqual(r.status, 0, 'expected non-zero exit when --force-proceed is used');
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
  });

  it('schedule subcommand is removed (non-zero exit, blocking error)', () => {
    const r = spawnSync(
      'node',
      [SCRIPT, 'schedule', '--session-dir', dir, '--phase', '1', '--concepts', '[]'],
      { encoding: 'utf-8' },
    );
    assert.notEqual(r.status, 0, 'expected non-zero exit for removed schedule subcommand');
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /unknown|removed|not supported/i);
  });

  it('missing state file → fatal error', () => {
    const r = runCheckpoint(1);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'fatal');
  });

  it('invalid step (5) → blocking error', () => {
    writeState({
      schema_version: 5,
      phases: { '1': { status: 'in_progress', concerns: [] } },
      concepts_checked: [],
    });

    const r = runCheckpoint(5);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
  });
});
