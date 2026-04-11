'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function readSessionState(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.session-state.json'), 'utf-8'));
}

describe('create with v4 fields', () => {
  it('generates a session_id', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.ok(state.session_id);
    assert.strictEqual(typeof state.session_id, 'string');
    assert.ok(state.session_id.length > 0);
  });

  it('initializes version 2', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.strictEqual(state.version, 2);
  });

  it('initializes gate.js-owned fields', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.deepStrictEqual(state.teaching_schedule, []);
    assert.deepStrictEqual(state.checkpoint_history, []);
    assert.strictEqual(state.circuit_breaker, 'closed');
  });
});

describe('finish', () => {
  it('sets phase to complete and returns verified true with no warnings', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const result = finish(testDir);

    assert.strictEqual(result.verified, true);
    assert.deepStrictEqual(result.warnings, []);

    const state = readSessionState(testDir);
    assert.strictEqual(state.phase, 'complete');
  });

  it('warns when scheduled concepts are not taught', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.strictEqual(result.verified, true);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some(w => w.includes('1 concepts scheduled but not taught')));
  });

  it('warns when checkpoints are unresolved', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.checkpoint_history = [
      { step: 'phase1_checkpoint1', result: 'blocked', timestamp: '2026-04-11T00:00:00.000Z' },
    ];
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.ok(result.warnings.some(w => w.includes('1 checkpoints never resolved')));
  });

  it('warns when circuit breaker is open', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.circuit_breaker = 'open';
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.ok(result.warnings.some(w => w.includes('open circuit breaker')));
  });

  it('warns when checkpoints are degraded', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.checkpoint_history = [
      { step: 'phase1_checkpoint1', result: 'degraded', timestamp: '2026-04-11T00:00:00.000Z' },
    ];
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.ok(result.warnings.some(w => w.includes('degraded mode')));
  });

  it('throws when no active session', () => {
    const { finish } = require('../../scripts/session.js');

    assert.throws(() => finish(testDir), /No active session/);
  });
});
