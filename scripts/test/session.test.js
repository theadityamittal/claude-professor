'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

let tmpDir, sessionDir;
const scriptPath = path.resolve(__dirname, '..', 'session.js');

function runSession(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

function runSessionRaw(args) {
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return {
    status: result.status,
    stdout: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr,
  };
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

  describe('gate', () => {
    it('opens when concepts_checked is non-empty', () => {
      runSession([
        'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
      ]);
      runSession([
        'add-concept', '--session-dir', sessionDir,
        '--concept-id', 'websocket', '--domain', 'networking', '--status', 'taught',
      ]);
      const result = runSessionRaw([
        'gate', '--require', 'concepts', '--session-dir', sessionDir,
      ]);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.gate, 'open');
    });

    it('blocks when concepts_checked is empty', () => {
      runSession([
        'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
      ]);
      const result = runSessionRaw([
        'gate', '--require', 'concepts', '--session-dir', sessionDir,
      ]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout.gate, 'blocked');
      assert.ok(result.stdout.reason.includes('concepts_checked is empty'));
    });

    it('opens with warning when no session exists', () => {
      const result = runSessionRaw([
        'gate', '--require', 'concepts', '--session-dir', sessionDir,
      ]);
      assert.equal(result.status, 0);
      assert.equal(result.stdout.gate, 'open');
      assert.ok(result.stdout.warning);
    });

    it('exits non-zero on unknown --require value', () => {
      runSession([
        'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
      ]);
      const result = runSessionRaw([
        'gate', '--require', 'unknown_value', '--session-dir', sessionDir,
      ]);
      assert.equal(result.status, 1);
    });
  });
});
