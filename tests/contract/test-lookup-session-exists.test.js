'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeJSON } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
let sessionDir;

beforeEach(() => {
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-exists-'));
});
afterEach(() => {
  fs.rmSync(sessionDir, { recursive: true, force: true });
});

function run() {
  return spawnSync('node', [SCRIPT, 'session-exists', '--session-dir', sessionDir], { encoding: 'utf-8' });
}

describe('lookup.js session-exists', () => {
  it('returns exists:false when no .session-state.json', () => {
    const r = run();
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.exists, false);
  });

  it('returns exists:true with v5 session metadata and progress_summary', () => {
    writeJSON(path.join(sessionDir, '.session-state.json'), {
      schema_version: 5,
      session_id: 'abc-123',
      task: 'Design a RAG pipeline',
      started_at: '2026-04-20T14:30:00Z',
      updated_at: '2026-04-20T15:12:00Z',
      current_phase: 2,
      phases: {
        2: {
          status: 'in_progress',
          components: [
            { id: 'retrieval', status: 'done' },
            { id: 'ranking', status: 'in_progress' },
            { id: 'storage', status: 'pending' },
          ],
        },
      },
    });
    const r = run();
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.exists, true);
    assert.equal(out.data.session_id, 'abc-123');
    assert.equal(out.data.task, 'Design a RAG pipeline');
    assert.equal(out.data.current_phase, 2);
    assert.equal(out.data.started_at, '2026-04-20T14:30:00Z');
    assert.ok(typeof out.data.progress_summary === 'string');
    assert.match(out.data.progress_summary, /Phase 2 of 4/);
    assert.match(out.data.progress_summary, /1 of 3 components done/);
  });

  it('progress_summary works for phase 1 (concerns) too', () => {
    writeJSON(path.join(sessionDir, '.session-state.json'), {
      schema_version: 5,
      session_id: 'x', task: 't', started_at: 'now',
      current_phase: 1,
      phases: {
        1: {
          status: 'in_progress',
          concerns: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
          current_concern_index: 1,
          discussions: [],
        },
      },
    });
    const r = run();
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.exists, true);
    assert.equal(out.data.current_phase, 1);
    assert.match(out.data.progress_summary, /Phase 1 of 4/);
    assert.match(out.data.progress_summary, /concerns/);
  });

  it('blocking error when --session-dir missing', () => {
    const r = spawnSync('node', [SCRIPT, 'session-exists'], { encoding: 'utf-8' });
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });
});
