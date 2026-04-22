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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mskip-'));
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
function readLog() {
  return fs.readFileSync(path.join(sessionDir, '.session-log.jsonl'), 'utf-8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function initSession() {
  const r = run(['init-session', '--task', 'mskip', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
}

describe('whiteboard.js mark-skipped', () => {
  it('happy path: 2 ids → 2 synthetic concepts_checked entries + remediation_choice event', () => {
    initSession();
    const before = readLog().length;
    const r = run([
      'mark-skipped',
      '--session-dir', sessionDir,
      '--phase', '1',
      '--ids', '["foo_concept", "bar_concept"]',
      '--reason', 'user opted to skip remediation',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.skipped_count, 2);

    const s = readState();
    assert.equal(s.concepts_checked.length, 2);
    for (const e of s.concepts_checked) {
      assert.equal(e.phase, 1);
      assert.equal(e.grade, null);
      assert.equal(e.action, 'skipped_remediation');
      assert.equal(e.reason, 'user opted to skip remediation');
      assert.ok(e.timestamp);
    }
    assert.equal(s.concepts_checked[0].concept_id, 'foo_concept');
    assert.equal(s.concepts_checked[1].concept_id, 'bar_concept');

    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'remediation_choice');
    assert.equal(last.choice, 'skip');
    assert.equal(last.phase, 1);
    assert.deepEqual(last.affected, ['foo_concept', 'bar_concept']);
    assert.equal(last.reason, 'user opted to skip remediation');
  });

  it('blocks on invalid --ids JSON', () => {
    initSession();
    const r = run([
      'mark-skipped',
      '--session-dir', sessionDir,
      '--phase', '2',
      '--ids', '{not json',
      '--reason', 'r',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Invalid --ids JSON/);
  });

  it('blocks on empty --ids array', () => {
    initSession();
    const r = run([
      'mark-skipped',
      '--session-dir', sessionDir,
      '--phase', '2',
      '--ids', '[]',
      '--reason', 'r',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /non-empty/);
  });

  it('blocks on invalid --phase value', () => {
    initSession();
    const r = run([
      'mark-skipped',
      '--session-dir', sessionDir,
      '--phase', '4',
      '--ids', '["x"]',
      '--reason', 'r',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Invalid --phase/);
  });

  it('blocks on missing --reason', () => {
    initSession();
    const r = run([
      'mark-skipped',
      '--session-dir', sessionDir,
      '--phase', '1',
      '--ids', '["x"]',
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /reason/i);
  });
});
