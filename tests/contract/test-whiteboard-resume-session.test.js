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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-resume-'));
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

function init(task) {
  const r = run([
    'init-session',
    '--task',
    task || 'a task',
    '--session-dir',
    sessionDir,
    '--concerns-path',
    concernsPath,
  ]);
  assert.equal(r.status, 0, `init failed: ${r.stderr}`);
  return JSON.parse(r.stdout).data;
}

function appendLogLine(obj) {
  fs.appendFileSync(
    path.join(sessionDir, '.session-log.jsonl'),
    JSON.stringify(obj) + '\n',
    'utf-8'
  );
}

function appendRaw(line) {
  fs.appendFileSync(path.join(sessionDir, '.session-log.jsonl'), line + '\n', 'utf-8');
}

function readLog() {
  return fs
    .readFileSync(path.join(sessionDir, '.session-log.jsonl'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { __malformed: true, raw: l };
      }
    });
}

describe('whiteboard.js resume-session — errors', () => {
  it('blocks when no state file exists', () => {
    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /No session state|init-session/);
  });

  it('blocks on wrong schema_version (e.g. 2)', () => {
    fs.writeFileSync(
      path.join(sessionDir, '.session-state.json'),
      JSON.stringify({ schema_version: 2, session_id: 'old-uuid', task: 'legacy' }),
      'utf-8'
    );
    fs.writeFileSync(path.join(sessionDir, '.session-log.jsonl'), '', 'utf-8');
    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /schema_version 2/);
    assert.match(err.error.message, /force-new|migrate/);
  });

  it('blocks when state exists but log file is missing', () => {
    init('task');
    fs.unlinkSync(path.join(sessionDir, '.session-log.jsonl'));
    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /session log/);
  });
});

describe('whiteboard.js resume-session — happy path', () => {
  it('returns session_id, current_phase, current_position, narrative_summary, next_action_hint', () => {
    const created = init('Design a system');
    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.session_id, created.session_id);
    assert.equal(out.data.current_phase, null);
    assert.ok(typeof out.data.current_position === 'string');
    assert.equal(out.data.task, 'Design a system');
    assert.ok(typeof out.data.started_at === 'string');
    assert.ok(typeof out.data.narrative_summary === 'string');
    assert.equal(out.data.next_action_hint, 'phase-start');
  });

  it('narrative_summary includes professor_action and discussion_recorded events', () => {
    init('teaching task');
    appendLogLine({
      event: 'professor_action',
      phase: 1,
      concern_id: 'data_modeling',
      action: 'taught',
      notes: 'Walked through normalization basics with grade 3',
      timestamp: new Date().toISOString(),
    });
    appendLogLine({
      event: 'discussion_recorded',
      phase: 1,
      concern_id: 'data_modeling',
      summary: 'Decided to denormalize the orders table for query speed.',
      timestamp: new Date().toISOString(),
    });
    appendLogLine({
      event: 'l2_decision',
      phase: 2,
      component_id: 'retrieval',
      decision: 'accept_novel',
      reasoning: 'sparse_vectors is genuinely new under information_retrieval',
      timestamp: new Date().toISOString(),
    });
    appendLogLine({
      event: 'remediation_choice',
      phase: 1,
      concern_id: 'caching',
      choice: 'skip',
      timestamp: new Date().toISOString(),
    });
    // This event type should NOT appear in the narrative.
    appendLogLine({
      event: 'phase_start',
      phase: 1,
      timestamp: new Date().toISOString(),
    });

    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 0);
    const summary = JSON.parse(r.stdout).data.narrative_summary;
    assert.match(summary, /Walked through normalization basics/);
    assert.match(summary, /denormalize the orders table/);
    assert.match(summary, /sparse_vectors/);
    assert.match(summary, /remediation: skip/);
    // phase_start should not appear by name in narrative.
    assert.doesNotMatch(summary, /phase_start/);
  });

  it('appends a session_resumed event to the log on success', () => {
    init('a task');
    const before = readLog().length;
    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 0);
    const after = readLog();
    assert.equal(after.length, before + 1);
    assert.equal(after[after.length - 1].event, 'session_resumed');
    assert.ok(after[after.length - 1].timestamp);
  });

  it('skips malformed log lines without crashing and surfaces a warning', () => {
    init('a task');
    appendLogLine({
      event: 'professor_action',
      phase: 1,
      action: 'taught',
      notes: 'good notes',
    });
    appendRaw('this is not json {{{');
    appendLogLine({
      event: 'discussion_recorded',
      phase: 1,
      summary: 'after malformed',
    });

    const r = run(['resume-session', '--session-dir', sessionDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.match(out.data.narrative_summary, /good notes/);
    assert.match(out.data.narrative_summary, /after malformed/);
    assert.ok(Array.isArray(out.data.log_warnings));
    assert.ok(out.data.log_warnings.some((w) => /malformed JSON/.test(w)));
  });
});
