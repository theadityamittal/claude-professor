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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-recdisc-'));
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

function setupPhase1() {
  const r = run(['init-session', '--task', 'rd', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
  const r2 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
  assert.equal(r2.status, 0);
  const s = readState();
  s.phases['1'].concerns = [
    { id: 'data_consistency', source: 'catalog', concepts: ['transactions'] },
  ];
  s.phases['1'].current_concern_index = 0;
  writeState(s);
}

describe('whiteboard.js record-discussion', () => {
  it('happy path: appends to phases[1].discussions and emits discussion_recorded event', () => {
    setupPhase1();
    const before = readLog().length;
    const r = run([
      'record-discussion',
      '--session-dir', sessionDir,
      '--unit-id', 'data_consistency',
      '--summary', 'We discussed read-after-write consistency tradeoffs.',
      '--open-questions', '["What about sticky sessions?"]',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.recorded, true);

    const s = readState();
    const disc = s.phases['1'].discussions;
    assert.equal(disc.length, 1);
    assert.equal(disc[0].unit_id, 'data_consistency');
    assert.equal(disc[0].summary, 'We discussed read-after-write consistency tradeoffs.');
    assert.deepEqual(disc[0].open_questions, ['What about sticky sessions?']);
    assert.ok(disc[0].timestamp);

    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'discussion_recorded');
    assert.equal(last.unit_id, 'data_consistency');
    assert.equal(last.phase, 1);
    assert.deepEqual(last.open_questions, ['What about sticky sessions?']);
  });

  it('summary saved with empty array when --open-questions absent', () => {
    setupPhase1();
    const r = run([
      'record-discussion',
      '--session-dir', sessionDir,
      '--unit-id', 'data_consistency',
      '--summary', 'short summary',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const s = readState();
    assert.deepEqual(s.phases['1'].discussions[0].open_questions, []);
  });

  it('blocks when summary is empty', () => {
    setupPhase1();
    const r = run([
      'record-discussion',
      '--session-dir', sessionDir,
      '--unit-id', 'data_consistency',
      '--summary', '   ',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /summary/);
  });

  it('blocks on unit mismatch', () => {
    setupPhase1();
    const r = run([
      'record-discussion',
      '--session-dir', sessionDir,
      '--unit-id', 'wrong_unit',
      '--summary', 'a real summary',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /does not match current scheduled unit/);
  });

  it('blocks on invalid JSON in --open-questions', () => {
    setupPhase1();
    const r = run([
      'record-discussion',
      '--session-dir', sessionDir,
      '--unit-id', 'data_consistency',
      '--summary', 'a summary',
      '--open-questions', '{not valid json',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /open-questions/);
  });
});
