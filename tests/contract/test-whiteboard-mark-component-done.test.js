'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');
const REPO_CONCERNS = path.join(__dirname, '..', '..', 'data', 'concerns.json');

let workDir, sessionDir, concernsPath;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mcomp-'));
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
function readState() {
  return JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-state.json'), 'utf-8'));
}
function writeState(s) {
  fs.writeFileSync(path.join(sessionDir, '.session-state.json'), JSON.stringify(s, null, 2));
}
function readLog() {
  return fs.readFileSync(path.join(sessionDir, '.session-log.jsonl'), 'utf-8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function setupPhase2(missing = false) {
  const r = run(['init-session', '--task', 'mcomp', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
  const s = readState();
  s.current_phase = 2;
  s.phases = {
    1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
    2: {
      status: 'in_progress',
      components: [
        {
          id: 'retrieval',
          concepts_seed: ['information_retrieval'],
          concepts_proposed: [{ id: 'sparse_vectors', parent: 'information_retrieval' }],
          L2_decisions: [],
          concepts_checked: [],
          status: 'in_progress',
        },
        {
          id: 'ranking',
          concepts_seed: ['caching'],
          concepts_proposed: [],
          L2_decisions: [],
          concepts_checked: [],
          status: 'in_progress',
        },
      ],
      current_component_index: 0,
      discussions: [],
    },
  };
  const baseChecked = [
    { concept_id: 'information_retrieval', concern_or_component: 'retrieval', phase: 2, grade: 3, action: 'taught', timestamp: '2026-04-20T00:00:00Z' },
  ];
  if (!missing) {
    baseChecked.push(
      { concept_id: 'sparse_vectors', concern_or_component: 'retrieval', phase: 2, grade: 3, action: 'taught', timestamp: '2026-04-20T00:01:00Z' }
    );
  }
  s.concepts_checked = baseChecked;
  writeState(s);
}

describe('whiteboard.js mark-component-done', () => {
  it('blocks when current_phase is 1 (wrong phase)', () => {
    const r0 = run(['init-session', '--task', 'mc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r0.status, 0);
    const r1 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r1.status, 0);
    const r = run(['mark-component-done', '--session-dir', sessionDir, '--id', 'x']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.match(err.error.message, /only valid in phase 2 or 3/);
  });

  it('blocks when --id does not match current scheduled component', () => {
    setupPhase2();
    const r = run(['mark-component-done', '--session-dir', sessionDir, '--id', 'ranking']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.match(err.error.message, /does not match current scheduled component/);
  });

  it('blocks listing missing concept IDs when component concepts not all recorded', () => {
    setupPhase2(true);
    const r = run(['mark-component-done', '--session-dir', sessionDir, '--id', 'retrieval']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /concepts not yet recorded/);
    assert.match(err.error.message, /sparse_vectors/);
  });

  it('happy path: marks status=done, increments index, emits component_done event', () => {
    setupPhase2();
    const before = readLog().length;
    const r = run(['mark-component-done', '--session-dir', sessionDir, '--id', 'retrieval']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.marked_done, 'retrieval');
    assert.equal(out.data.next_index, 1);

    const s = readState();
    assert.equal(s.phases['2'].current_component_index, 1);
    assert.equal(s.phases['2'].components[0].status, 'done');
    // Second component still in_progress.
    assert.equal(s.phases['2'].components[1].status, 'in_progress');

    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'component_done');
    assert.equal(last.id, 'retrieval');
    assert.equal(last.phase, 2);
  });
});
