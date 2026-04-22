'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');
const REPO_CONCERNS = path.join(__dirname, '..', '..', 'data', 'concerns.json');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let workDir;
let sessionDir;
let concernsPath;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-init-'));
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
  const p = path.join(sessionDir, '.session-log.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('whiteboard.js init-session — happy path', () => {
  it('creates state with valid envelope, UUID session_id, schema_version 5', () => {
    const r = run([
      'init-session',
      '--task',
      'Design a RAG pipeline',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.match(out.data.session_id, UUID_RE);
    assert.equal(out.data.schema_version, 5);
    assert.equal(out.data.task, 'Design a RAG pipeline');
    assert.equal(out.data.session_dir, sessionDir);

    // State file written, log file written.
    assert.ok(fs.existsSync(path.join(sessionDir, '.session-state.json')));
    assert.ok(fs.existsSync(path.join(sessionDir, '.session-log.jsonl')));

    const state = readState();
    assert.equal(state.schema_version, 5);
    assert.match(state.session_id, UUID_RE);
    assert.equal(state.task, 'Design a RAG pipeline');
    assert.equal(state.current_phase, null);
    assert.deepEqual(state.phases, {});
    assert.deepEqual(state.concepts_checked, []);

    // concerns_catalog_version is sha256 of fixture file.
    const expected =
      'sha256:' +
      crypto.createHash('sha256').update(fs.readFileSync(concernsPath)).digest('hex');
    assert.equal(state.concerns_catalog_version, expected);
  });

  it('appends a session_start event with task + session_id to .session-log.jsonl', () => {
    run([
      'init-session',
      '--task',
      'task-A',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    const events = readLog();
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'session_start');
    assert.equal(events[0].task, 'task-A');
    assert.match(events[0].session_id, UUID_RE);
    assert.ok(events[0].timestamp);
  });
});

describe('whiteboard.js init-session — validation errors', () => {
  it('rejects existing state without --force-new (blocking)', () => {
    const a = run([
      'init-session',
      '--task',
      'first',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    assert.equal(a.status, 0);

    const b = run([
      'init-session',
      '--task',
      'second',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    assert.equal(b.status, 2);
    const err = JSON.parse(b.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Session state exists/);
    assert.match(err.error.message, /--force-new|resume-session/);

    // First state preserved.
    assert.equal(readState().task, 'first');
  });

  it('--force-new discards old state and old log, creating a fresh session_id', () => {
    const a = run([
      'init-session',
      '--task',
      'first',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    const idA = JSON.parse(a.stdout).data.session_id;

    const b = run([
      'init-session',
      '--task',
      'second',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
      '--force-new',
    ]);
    assert.equal(b.status, 0, `stderr: ${b.stderr}`);
    const idB = JSON.parse(b.stdout).data.session_id;
    assert.notEqual(idA, idB);

    // State now reflects the second task; log was wiped — exactly one event.
    assert.equal(readState().task, 'second');
    const events = readLog();
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'session_start');
    assert.equal(events[0].session_id, idB);
  });

  it('rejects missing --task with blocking error', () => {
    const r = run([
      'init-session',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      concernsPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /--task/);
  });

  it('rejects missing --session-dir with blocking error', () => {
    const r = run([
      'init-session',
      '--task',
      'X',
      '--concerns-path',
      concernsPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /--session-dir/);
  });

  it('returns fatal when concerns.json is missing', () => {
    const missing = path.join(workDir, 'nope.json');
    const r = run([
      'init-session',
      '--task',
      'X',
      '--session-dir',
      sessionDir,
      '--concerns-path',
      missing,
    ]);
    assert.equal(r.status, 1);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'fatal');
    assert.match(err.error.message, /concerns\.json/);
  });
});

describe('whiteboard.js — router', () => {
  it('rejects unknown subcommand with blocking error', () => {
    const r = run(['not-a-command']);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /unknown subcommand/);
  });

  it('rejects missing subcommand with blocking error', () => {
    const r = run([]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Missing subcommand/);
  });
});
