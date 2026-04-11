'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { create, addConcept } = require('../../scripts/session.js');
const { schedule, checkpoint } = require('../../scripts/gate.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-schedule-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 1: Teaching schedule lifecycle', () => {
  it('full flow: create → schedule → blocked → teach → passed', () => {
    const session = create(testDir, 'test feature', 'main');
    assert.ok(session.session_id);

    const concepts = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
      { concept_id: 'indexing', domain: 'databases', status: 'review', step: 'phase1_checkpoint1' },
    ];
    const schedResult = schedule(testDir, 1, concepts);
    assert.strictEqual(schedResult.scheduled, 2);

    const blocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(blocked.result, 'blocked');
    assert.deepStrictEqual(blocked.missing, ['caching', 'indexing']);

    addConcept(testDir, {
      conceptId: 'caching', domain: 'databases', status: 'taught',
      grade: '3', phase: 'requirements', context: 'test',
    });

    const stillBlocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(stillBlocked.result, 'blocked');
    assert.deepStrictEqual(stillBlocked.missing, ['indexing']);

    addConcept(testDir, {
      conceptId: 'indexing', domain: 'databases', status: 'taught',
      grade: '4', phase: 'requirements', context: 'test',
    });

    const passed = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(passed.result, 'passed');
    assert.deepStrictEqual(passed.missing, []);
  });
});
