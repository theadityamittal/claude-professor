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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fin-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}
function statePath() { return path.join(sessionDir, '.session-state.json'); }
function logPath() { return path.join(sessionDir, '.session-log.jsonl'); }
function writeState(s) {
  fs.writeFileSync(statePath(), JSON.stringify(s, null, 2));
}
function writeLog(lines) {
  fs.writeFileSync(logPath(), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}
function readLogLines() {
  if (!fs.existsSync(logPath())) return [];
  return fs.readFileSync(logPath(), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function baseState(phase4Status) {
  return {
    schema_version: 5,
    session_id: 'sess-fin',
    task: 'fin',
    current_phase: 4,
    phases: {
      1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
      2: { status: 'complete', components: [], current_component_index: null, discussions: [] },
      3: { status: 'complete', components: [], current_component_index: null, discussions: [] },
      4: { status: phase4Status },
    },
    concepts_checked: [],
    updated_at: '2026-04-20T00:00:00Z',
  };
}

describe('whiteboard.js finish', () => {
  it('blocks when phases[4] is not complete and --abort not set', () => {
    writeState(baseState('in_progress'));
    writeLog([{ event: 'init_session', session_id: 'sess-fin' }]);
    const r = run(['finish', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /session not complete/);
    assert.match(err.error.message, /--abort/);
    // State still intact.
    assert.ok(fs.existsSync(statePath()));
    assert.ok(fs.existsSync(logPath()));
  });

  it('--abort succeeds even without phases[4] complete; both files deleted by default', () => {
    writeState(baseState('in_progress'));
    writeLog([{ event: 'init_session', session_id: 'sess-fin' }]);
    const r = run(['finish', '--session-dir', sessionDir, '--abort']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.outcome, 'aborted');
    assert.equal(out.data.kept_log, false);
    assert.ok(!fs.existsSync(statePath()));
    assert.ok(!fs.existsSync(logPath()));
  });

  it('--keep-log deletes state, preserves log, appends session_finish event', () => {
    writeState(baseState('complete'));
    writeLog([{ event: 'init_session', session_id: 'sess-fin' }]);
    const r = run(['finish', '--session-dir', sessionDir, '--keep-log']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.outcome, 'completed');
    assert.equal(out.data.kept_log, true);
    assert.ok(!fs.existsSync(statePath()));
    assert.ok(fs.existsSync(logPath()));

    const events = readLogLines();
    const last = events[events.length - 1];
    assert.equal(last.event, 'session_finish');
    assert.equal(last.session_id, 'sess-fin');
    assert.equal(last.outcome, 'completed');
  });

  it('default (success) deletes both state and log', () => {
    writeState(baseState('complete'));
    writeLog([{ event: 'init_session', session_id: 'sess-fin' }]);
    const r = run(['finish', '--session-dir', sessionDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.outcome, 'completed');
    assert.equal(out.data.kept_log, false);
    assert.ok(!fs.existsSync(statePath()));
    assert.ok(!fs.existsSync(logPath()));
  });

  it('blocks when state file is missing', () => {
    // No state written.
    const r = run(['finish', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /No session state/);
  });
});
