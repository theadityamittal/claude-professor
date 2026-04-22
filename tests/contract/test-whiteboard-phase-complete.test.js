'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');

let workDir, sessionDir;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pc-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}

function writeState(s) {
  fs.writeFileSync(path.join(sessionDir, '.session-state.json'), JSON.stringify(s, null, 2));
}
function readState() {
  return JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-state.json'), 'utf-8'));
}
function readLog() {
  const p = path.join(sessionDir, '.session-log.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function baseState(overrides = {}) {
  return {
    schema_version: 5,
    session_id: 'sess-pc',
    task: 'pc-test',
    current_phase: 1,
    phases: {},
    concepts_checked: [],
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('whiteboard.js phase-complete', () => {
  it('blocks on invalid phase number (0 and 5)', () => {
    writeState(baseState());
    const r0 = run(['phase-complete', '--session-dir', sessionDir, '--phase', '0']);
    assert.equal(r0.status, 2);
    assert.match(JSON.parse(r0.stderr).error.message, /Invalid --phase/);
    const r5 = run(['phase-complete', '--session-dir', sessionDir, '--phase', '5']);
    assert.equal(r5.status, 2);
    assert.match(JSON.parse(r5.stderr).error.message, /Invalid --phase/);
  });

  it('blocks when phase not started', () => {
    writeState(baseState({ phases: {} }));
    const r = run(['phase-complete', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Phase 1 has not been started/);
  });

  it('blocks when phase already complete (calling twice)', () => {
    writeState(baseState({
      phases: {
        1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
      },
    }));
    const r = run(['phase-complete', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stderr).error.message, /not in_progress/);
  });

  it('blocks with list of incomplete concern ids in phase 1', () => {
    writeState(baseState({
      phases: {
        1: {
          status: 'in_progress',
          concerns: [
            { id: 'data_consistency', source: 'catalog', concepts: [], status: 'done' },
            { id: 'webhook_retries', source: 'proposed', concepts: [] },
          ],
          current_concern_index: 1,
          discussions: [],
        },
      },
    }));
    const r = run(['phase-complete', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /concerns not done/);
    assert.match(err.error.message, /webhook_retries/);
    assert.doesNotMatch(err.error.message, /data_consistency/);
  });

  it('happy path: phase 1 with all concerns done completes and logs event', () => {
    writeState(baseState({
      phases: {
        1: {
          status: 'in_progress',
          concerns: [
            { id: 'a', source: 'catalog', concepts: [], status: 'done' },
            { id: 'b', source: 'proposed', concepts: [], status: 'done' },
          ],
          current_concern_index: 2,
          discussions: [],
        },
      },
    }));
    const r = run(['phase-complete', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.phase, 1);
    assert.equal(out.data.completed, true);

    const s = readState();
    assert.equal(s.phases['1'].status, 'complete');

    const events = readLog();
    const last = events[events.length - 1];
    assert.equal(last.event, 'phase_complete');
    assert.equal(last.phase, 1);
    assert.equal(last.session_id, 'sess-pc');
  });

  it('phase 4: directly completes even though it has no nested units', () => {
    writeState(baseState({
      current_phase: 4,
      phases: {
        1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
        2: { status: 'complete', components: [], current_component_index: null, discussions: [] },
        3: { status: 'complete', components: [], current_component_index: null, discussions: [] },
        4: { status: 'in_progress' },
      },
    }));
    const r = run(['phase-complete', '--session-dir', sessionDir, '--phase', '4']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const s = readState();
    assert.equal(s.phases['4'].status, 'complete');
  });
});
