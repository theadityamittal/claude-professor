'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');
const REPO_CONCERNS = path.join(__dirname, '..', '..', 'data', 'concerns.json');

let workDir;
let sessionDir;
let concernsPath;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-phase-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
  concernsPath = path.join(workDir, 'concerns.json');
  fs.copyFileSync(REPO_CONCERNS, concernsPath);
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}

function init() {
  const r = run([
    'init-session',
    '--task',
    'phase test',
    '--session-dir',
    sessionDir,
    '--concerns-path',
    concernsPath,
  ]);
  assert.equal(r.status, 0, `init failed: ${r.stderr}`);
}

function readState() {
  return JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-state.json'), 'utf-8'));
}

function writeState(state) {
  fs.writeFileSync(
    path.join(sessionDir, '.session-state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf-8'
  );
}

function readLog() {
  return fs
    .readFileSync(path.join(sessionDir, '.session-log.jsonl'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('whiteboard.js phase-start — validation errors', () => {
  it('rejects invalid phase number 0 with blocking error', () => {
    init();
    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '0']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Invalid --phase/);
  });

  it('rejects invalid phase number 5 with blocking error', () => {
    init();
    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '5']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Invalid --phase/);
  });

  it('rejects starting phase 2 when phase 1 is not complete', () => {
    init();
    // Start phase 1 (in_progress) but do not complete it.
    const r1 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r1.status, 0);

    const r2 = run(['phase-start', '--session-dir', sessionDir, '--phase', '2']);
    assert.equal(r2.status, 2);
    const err = JSON.parse(r2.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /phase 1.*in_progress|expected 'complete'/);
  });

  it('rejects starting a phase that is already started', () => {
    init();
    const r1 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r1.status, 0);
    const r2 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r2.status, 2);
    const err = JSON.parse(r2.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /already started/);
  });

  it('blocks when state file is missing', () => {
    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /No session state|init-session/);
  });
});

describe('whiteboard.js phase-start — happy paths', () => {
  it('starts phase 1 from current_phase=null with phase 1 empty shape', () => {
    init();
    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.phase, 1);
    assert.equal(out.data.transitioned_from, null);

    const state = readState();
    assert.equal(state.current_phase, 1);
    assert.deepEqual(state.phases['1'], {
      status: 'in_progress',
      concerns: [],
      current_concern_index: null,
      discussions: [],
    });
  });

  it('phase 2 transition succeeds when phase 1 is marked complete', () => {
    init();
    // Manually set phases[1] = complete to bypass not-yet-implemented phase-complete.
    const state = readState();
    state.current_phase = 1;
    state.phases['1'] = {
      status: 'complete',
      concerns: [],
      current_concern_index: null,
      discussions: [],
    };
    writeState(state);

    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '2']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.phase, 2);
    assert.equal(out.data.transitioned_from, 1);

    const after = readState();
    assert.equal(after.current_phase, 2);
    assert.deepEqual(after.phases['2'], {
      status: 'in_progress',
      components: [],
      current_component_index: null,
      discussions: [],
    });
    // Phase 1 state preserved.
    assert.equal(after.phases['1'].status, 'complete');
  });

  it('phase 4 initializes with status-only shape', () => {
    init();
    const state = readState();
    state.current_phase = 3;
    state.phases['1'] = { status: 'complete', concerns: [], current_concern_index: null, discussions: [] };
    state.phases['2'] = { status: 'complete', components: [], current_component_index: null, discussions: [] };
    state.phases['3'] = { status: 'complete', components: [], current_component_index: null, discussions: [] };
    writeState(state);

    const r = run(['phase-start', '--session-dir', sessionDir, '--phase', '4']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const after = readState();
    assert.deepEqual(after.phases['4'], { status: 'in_progress' });
  });

  it('appends a phase_start event with phase + transitioned_from to log', () => {
    init();
    const before = readLog().length;
    run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'phase_start');
    assert.equal(last.phase, 1);
    assert.equal(last.transitioned_from, null);
    assert.ok(last.timestamp);
  });
});
