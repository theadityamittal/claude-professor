'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir, sessionDir;
const scriptPath = path.resolve(__dirname, '..', 'session.js');

function runSession(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-session-'));
  sessionDir = path.join(tmpDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('session.js', () => {
  it('creates session with feature name and branch', () => {
    const result = runSession([
      'create',
      '--feature', 'Real-time notifications',
      '--branch', 'feature/notifications',
      '--session-dir', sessionDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.feature, 'Real-time notifications');

    const filePath = path.join(sessionDir, '.session-state.json');
    assert.ok(fs.existsSync(filePath));

    const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.equal(state.feature, 'Real-time notifications');
    assert.equal(state.branch, 'feature/notifications');
    assert.equal(state.version, 1);
    assert.ok(state.started);
    assert.deepEqual(state.concepts_checked, []);
    assert.deepEqual(state.decisions, []);
  });

  it('loads existing session state', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.feature, 'Test');
    assert.equal(result.branch, 'main');
  });

  it('returns exists:false when no session', () => {
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.exists, false);
  });

  it('updates specific fields', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    runSession([
      'update', '--session-dir', sessionDir,
      '--phase', 'design_options',
      '--context-snapshot', 'Discussing Redis pub/sub',
    ]);
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.phase, 'design_options');
    assert.equal(result.context_snapshot, 'Discussing Redis pub/sub');
  });

  it('adds concept and deduplicates', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);

    const r1 = runSession([
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'websocket',
      '--domain', 'networking',
      '--status', 'taught',
      '--grade', '3',
      '--phase', 'requirements',
      '--context', 'Discussing delivery mechanism',
    ]);
    assert.equal(r1.action, 'added');

    // Duplicate — should skip
    const r2 = runSession([
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'websocket',
      '--domain', 'networking',
      '--status', 'taught',
      '--grade', '4',
      '--phase', 'design_options',
      '--context', 'Revisiting',
    ]);
    assert.equal(r2.action, 'already_checked');

    const state = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(state.concepts_checked.length, 1);
    assert.equal(state.concepts_checked[0].concept_id, 'websocket');
  });

  it('clears session state', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    const r = runSession(['clear', '--session-dir', sessionDir]);
    assert.equal(r.success, true);

    const filePath = path.join(sessionDir, '.session-state.json');
    assert.ok(!fs.existsSync(filePath));
  });

  it('clear on non-existent session succeeds silently', () => {
    const r = runSession(['clear', '--session-dir', sessionDir]);
    assert.equal(r.success, true);
  });
});
