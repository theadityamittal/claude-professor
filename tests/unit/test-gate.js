'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function writeSessionState(dir, state) {
  fs.writeFileSync(
    path.join(dir, '.session-state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );
}

function readSessionState(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.session-state.json'), 'utf-8'));
}

function baseState() {
  return {
    version: 2,
    session_id: 'test-session-id',
    feature: 'test',
    branch: 'main',
    started: '2026-04-11T00:00:00.000Z',
    last_updated: '2026-04-11T00:00:00.000Z',
    phase: 'requirements',
    concepts_checked: [],
    teaching_schedule: [],
    checkpoint_history: [],
    circuit_breaker: 'closed',
  };
}

describe('schedule', () => {
  it('adds concepts to empty teaching_schedule', () => {
    const { schedule } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const concepts = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    const result = schedule(testDir, 1, concepts);

    assert.strictEqual(result.scheduled, 1);
    assert.strictEqual(result.total, 1);

    const state = readSessionState(testDir);
    assert.strictEqual(state.teaching_schedule.length, 1);
    assert.strictEqual(state.teaching_schedule[0].concept_id, 'caching');
  });

  it('appends phase 2 concepts without replacing phase 1', () => {
    const { schedule } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    writeSessionState(testDir, state);

    const concepts = [
      { concept_id: 'circuit_breaker', domain: 'reliability_observability', status: 'new', step: 'phase2_checkpoint1' },
    ];
    const result = schedule(testDir, 2, concepts);

    assert.strictEqual(result.scheduled, 1);
    assert.strictEqual(result.total, 2);

    const updated = readSessionState(testDir);
    assert.strictEqual(updated.teaching_schedule.length, 2);
    assert.strictEqual(updated.teaching_schedule[0].concept_id, 'caching');
    assert.strictEqual(updated.teaching_schedule[1].concept_id, 'circuit_breaker');
  });
});

describe('checkpoint', () => {
  it('returns passed when all scheduled concepts are in concepts_checked', () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [
      { concept_id: 'caching', domain: 'databases', status: 'taught', grade: 3 },
    ];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'passed');
    assert.deepStrictEqual(result.missing, []);
  });

  it('returns blocked when scheduled concept is not taught', () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'blocked');
    assert.deepStrictEqual(result.missing, ['caching']);
  });

  it('returns degraded when circuit breaker is open', () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.circuit_breaker = 'open';
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'degraded');
  });

  it('returns passed when no concepts scheduled for step', () => {
    const { checkpoint } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'passed');
    assert.deepStrictEqual(result.missing, []);
  });

  it('appends to checkpoint_history', () => {
    const { checkpoint } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    checkpoint(testDir, 'phase1_checkpoint1');

    const state = readSessionState(testDir);
    assert.strictEqual(state.checkpoint_history.length, 1);
    assert.strictEqual(state.checkpoint_history[0].step, 'phase1_checkpoint1');
    assert.strictEqual(state.checkpoint_history[0].result, 'passed');
    assert.ok(state.checkpoint_history[0].timestamp);
  });
});

describe('log', () => {
  it('appends JSONL entry to session log file', () => {
    const { log } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const entry = { event: 'checkpoint', step: 'phase1_checkpoint1', result: 'passed' };
    const result = log(testDir, entry);

    assert.strictEqual(result.logged, true);

    const logPath = path.join(testDir, '.session-log.jsonl');
    assert.ok(fs.existsSync(logPath));

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.ok(parsed.timestamp);
    assert.strictEqual(parsed.event, 'checkpoint');
    assert.strictEqual(parsed.step, 'phase1_checkpoint1');
  });

  it('appends multiple entries without overwriting', () => {
    const { log } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    log(testDir, { event: 'first' });
    log(testDir, { event: 'second' });

    const logPath = path.join(testDir, '.session-log.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[0]).event, 'first');
    assert.strictEqual(JSON.parse(lines[1]).event, 'second');
  });
});

describe('status', () => {
  it('returns schedule, checkpoints, and circuit state', () => {
    const { status } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.checkpoint_history = [
      { step: 'phase1_checkpoint1', result: 'passed', timestamp: '2026-04-11T00:00:00.000Z' },
    ];
    writeSessionState(testDir, state);

    const result = status(testDir);

    assert.strictEqual(result.schedule.length, 1);
    assert.strictEqual(result.checkpoints.length, 1);
    assert.strictEqual(result.circuit, 'closed');
  });

  it('throws when no active session', () => {
    const { status } = require('../../scripts/gate.js');

    assert.throws(() => status(testDir), /No active session/);
  });
});
