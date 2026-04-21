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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mcd-'));
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

function setupPhase1WithRecorded(missingConcept = false) {
  const r = run(['init-session', '--task', 'mcd', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
  const r2 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
  assert.equal(r2.status, 0);
  const s = readState();
  s.phases['1'].concerns = [
    { id: 'data_consistency', source: 'catalog', concepts: ['transactions', 'retry_backoff'] },
    { id: 'webhook_retries', source: 'proposed', concepts: ['retry_backoff'] },
  ];
  s.phases['1'].current_concern_index = 0;
  // Pre-record concepts.
  const baseChecked = [
    { concept_id: 'transactions', concern_or_component: 'data_consistency', phase: 1, grade: 3, action: 'taught', timestamp: '2026-04-20T00:00:00Z' },
  ];
  if (!missingConcept) {
    baseChecked.push(
      { concept_id: 'retry_backoff', concern_or_component: 'data_consistency', phase: 1, grade: 4, action: 'taught', timestamp: '2026-04-20T00:01:00Z' }
    );
  }
  s.concepts_checked = baseChecked;
  writeState(s);
}

describe('whiteboard.js mark-concern-done', () => {
  it('blocks on wrong phase (current_phase != 1)', () => {
    const r0 = run(['init-session', '--task', 'mcd', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r0.status, 0);
    const s = readState();
    s.current_phase = 2;
    s.phases = { 2: { status: 'in_progress', components: [], current_component_index: null, discussions: [] } };
    writeState(s);
    const r = run(['mark-concern-done', '--session-dir', sessionDir, '--id', 'x']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.match(err.error.message, /only valid in phase 1/);
  });

  it('blocks when --id does not match current concern', () => {
    setupPhase1WithRecorded();
    const r = run(['mark-concern-done', '--session-dir', sessionDir, '--id', 'webhook_retries']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.match(err.error.message, /does not match current scheduled concern/);
  });

  it('blocks with list of missing concept IDs when not all recorded', () => {
    setupPhase1WithRecorded(true);
    const r = run(['mark-concern-done', '--session-dir', sessionDir, '--id', 'data_consistency']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /concepts not yet recorded/);
    assert.match(err.error.message, /retry_backoff/);
  });

  it('happy path: marks status=done, increments index, emits concern_done event', () => {
    setupPhase1WithRecorded();
    const before = readLog().length;
    const r = run(['mark-concern-done', '--session-dir', sessionDir, '--id', 'data_consistency']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.marked_done, 'data_consistency');
    assert.equal(out.data.next_index, 1);

    const s = readState();
    assert.equal(s.phases['1'].current_concern_index, 1);
    assert.equal(s.phases['1'].concerns[0].status, 'done');

    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'concern_done');
    assert.equal(last.id, 'data_consistency');
    assert.equal(last.phase, 1);
  });
});
