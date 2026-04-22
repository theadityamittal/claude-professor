'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CONCERNS_PATH = path.join(__dirname, '..', '..', 'data', 'concerns.json');

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

function writeSessionState(dir, state) {
  fs.writeFileSync(
    path.join(dir, '.session-state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf-8'
  );
}

describe('session.js create (v5)', () => {
  it('generates a v4 UUID session_id', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'Design a RAG pipeline', CONCERNS_PATH);

    const state = readSessionState(testDir);
    assert.ok(state.session_id);
    assert.strictEqual(typeof state.session_id, 'string');
    assert.match(
      state.session_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('initializes schema_version 5', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'task-x', CONCERNS_PATH);

    const state = readSessionState(testDir);
    assert.strictEqual(state.schema_version, 5);
  });

  it('initializes v5 collections empty', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'task-x', CONCERNS_PATH);

    const state = readSessionState(testDir);
    assert.deepStrictEqual(state.phases, {});
    assert.deepStrictEqual(state.concepts_checked, []);
    assert.strictEqual(state.current_phase, null);
  });
});

describe('session.js finish (v5)', () => {
  it('sets current_phase to complete and returns verified true with no warnings', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'task-x', CONCERNS_PATH);

    const result = finish(testDir);

    assert.strictEqual(result.verified, true);
    assert.deepStrictEqual(result.warnings, []);

    const state = readSessionState(testDir);
    assert.strictEqual(state.current_phase, 'complete');
  });

  it('warns when a phase ended in non-complete status', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'task-x', CONCERNS_PATH);

    const state = readSessionState(testDir);
    state.phases = {
      1: { status: 'complete', concerns: [], discussions: [] },
      2: { status: 'in_progress', components: [], discussions: [] },
    };
    writeSessionState(testDir, state);

    const result = finish(testDir);
    assert.strictEqual(result.verified, true);
    assert.ok(result.warnings.some(w => w.includes("phase 2") && w.includes('in_progress')));
  });

  it('throws when no active session', () => {
    const { finish } = require('../../scripts/session.js');

    assert.throws(() => finish(testDir), /No active session/);
  });

  it('throws on v4 state (schema_version: 2)', () => {
    const { finish } = require('../../scripts/session.js');
    writeSessionState(testDir, { schema_version: 2, feature: 'old' });

    assert.throws(() => finish(testDir), /v4 session detected/);
  });
});
