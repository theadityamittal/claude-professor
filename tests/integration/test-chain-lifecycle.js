'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { create, addConcept, update: sessionUpdate, finish, clear } = require('../../scripts/session.js');
const { schedule, checkpoint, log } = require('../../scripts/gate.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-lifecycle-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 3: Full session lifecycle', () => {
  it('create → schedule → checkpoint → teach → log → finish → verify', () => {
    const session = create(testDir, 'lifecycle test', 'main');
    assert.ok(session.session_id);

    schedule(testDir, 1, [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ]);

    const blocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(blocked.result, 'blocked');

    addConcept(testDir, {
      conceptId: 'caching', domain: 'databases', status: 'taught',
      grade: '3', phase: 'requirements', context: 'lifecycle test',
    });

    const passed = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(passed.result, 'passed');

    log(testDir, { event: 'checkpoint', step: 'phase1_checkpoint1', result: 'passed' });
    log(testDir, { event: 'phase_transition', from: 'requirements', to: 'hld' });

    sessionUpdate(testDir, { phase: 'hld' });

    log(testDir, { event: 'session_finish', phase: 'complete' });

    const finishResult = finish(testDir);
    assert.strictEqual(finishResult.verified, true);
    assert.deepStrictEqual(finishResult.warnings, []);

    const logPath = path.join(testDir, '.session-log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[0]).event, 'checkpoint');
    assert.strictEqual(JSON.parse(lines[1]).event, 'phase_transition');
    assert.strictEqual(JSON.parse(lines[2]).event, 'session_finish');

    clear(testDir);
    assert.strictEqual(fs.existsSync(path.join(testDir, '.session-state.json')), false);
    assert.strictEqual(fs.existsSync(logPath), true);
  });
});
