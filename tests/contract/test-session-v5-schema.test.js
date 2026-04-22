'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'session.js');
const REPO_CONCERNS = path.join(__dirname, '..', '..', 'data', 'concerns.json');

let workDir;
let sessionDir;
let concernsPath;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-v5-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
  // Copy the real concerns.json into an isolated path so tests are unit-testable.
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

function writeState(state) {
  fs.writeFileSync(
    path.join(sessionDir, '.session-state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf-8'
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('session.js v5 schema — create', () => {
  it('produces v5 state with required fields', () => {
    const r = run(['create', '--task', 'Design a RAG pipeline', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.ok(out.data.session_id);

    const state = readState();
    assert.equal(state.schema_version, 5);
    assert.match(state.session_id, UUID_RE);
    assert.equal(state.task, 'Design a RAG pipeline');
    assert.ok(state.started_at);
    assert.ok(state.updated_at);
    assert.equal(state.current_phase, null);
    assert.deepEqual(state.phases, {});
    assert.deepEqual(state.concepts_checked, []);
    assert.ok(typeof state.concerns_catalog_version === 'string');
    assert.ok(state.concerns_catalog_version.startsWith('sha256:'));

    // Verify hash is deterministic — matches sha256 of file bytes.
    const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(concernsPath)).digest('hex');
    assert.equal(state.concerns_catalog_version, expected);

    // Removed v4 fields must not be present.
    assert.equal('circuit_breaker' in state, false);
    assert.equal('chosen_option' in state, false);
    assert.equal('design_options_proposed' in state, false);
    assert.equal('requirements' in state, false);
    assert.equal('decisions' in state, false);
    assert.equal('architecture_loaded' in state, false);
    assert.equal('architecture_components_read' in state, false);
    assert.equal('feature' in state, false);
    assert.equal('branch' in state, false);
    assert.equal('version' in state, false);
  });

  it('rejects --feature with blocking error', () => {
    const r = run(['create', '--task', 'X', '--feature', 'foo', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /--feature.*--branch.*v5|v5.*--task/i);
  });

  it('rejects --branch with blocking error', () => {
    const r = run(['create', '--task', 'X', '--branch', 'main', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });

  it('rejects empty --task', () => {
    const r = run(['create', '--task', '', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });

  it('fails fatal when data/concerns.json is missing', () => {
    const missingPath = path.join(workDir, 'does-not-exist.json');
    const r = run(['create', '--task', 'X', '--session-dir', sessionDir, '--concerns-path', missingPath]);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'fatal');
    assert.match(err.error.message, /concerns\.json/);
  });
});

describe('session.js v5 schema — load', () => {
  it('returns v5 state normally', () => {
    run(['create', '--task', 'Task A', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const r = run(['load', '--session-dir', sessionDir]);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.schema_version, 5);
    assert.equal(out.data.task, 'Task A');
  });

  it('returns blocking error on v4 (schema_version: 2) state', () => {
    writeState({ schema_version: 2, feature: 'old', branch: 'main' });
    const r = run(['load', '--session-dir', sessionDir]);
    assert.notEqual(r.status, 0);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.status, 'error');
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /migrate-from-v4|discard/);
  });

  it('returns exists:false when no state file', () => {
    const r = run(['load', '--session-dir', sessionDir]);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.exists, false);
  });
});

describe('session.js v5 schema — update', () => {
  it('mutates current_phase via --field/--value and updates updated_at', () => {
    run(['create', '--task', 'T', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const before = readState();

    // Force a different timestamp by waiting a ms then updating
    const r = run(['update', '--session-dir', sessionDir, '--field', 'current_phase', '--value', '2']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const after = readState();
    assert.equal(after.current_phase, 2);
    assert.notEqual(after.updated_at, before.updated_at);
  });

  it('rejects unknown fields with blocking error', () => {
    run(['create', '--task', 'T', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const r = run(['update', '--session-dir', sessionDir, '--field', 'feature', '--value', 'foo']);
    assert.notEqual(r.status, 0);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
  });
});

describe('session.js v5 schema — add-concept', () => {
  it('appends entry to top-level concepts_checked', () => {
    run(['create', '--task', 'T', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const r = run([
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'optimistic_concurrency',
      '--phase', '1',
      '--grade', '3',
      '--nonce', 'n-1',
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');

    const state = readState();
    assert.equal(state.concepts_checked.length, 1);
    assert.equal(state.concepts_checked[0].concept_id, 'optimistic_concurrency');
    assert.equal(state.concepts_checked[0].phase, 1);
    assert.equal(state.concepts_checked[0].grade, 3);
    assert.equal(state.concepts_checked[0].nonce, 'n-1');
  });

  it('idempotent on repeated nonce — no duplicate entry', () => {
    run(['create', '--task', 'T', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const args = [
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'caching',
      '--phase', '2',
      '--grade', '4',
      '--nonce', 'same-nonce',
    ];

    const r1 = run(args);
    assert.equal(r1.status, 0);
    const out1 = JSON.parse(r1.stdout);
    assert.equal(out1.data.action, 'added');

    const r2 = run(args);
    assert.equal(r2.status, 0);
    const out2 = JSON.parse(r2.stdout);
    assert.equal(out2.data.action, 'idempotent_skip');

    const state = readState();
    assert.equal(state.concepts_checked.length, 1);
  });
});

describe('session.js v5 schema — migrate-from-v4', () => {
  it('rejects v4 state with blocking error; stderr mentions discard', () => {
    writeState({ schema_version: 2, feature: 'old', branch: 'main' });
    const r = run(['migrate-from-v4', '--session-dir', sessionDir]);
    assert.notEqual(r.status, 0);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /discard/);
  });

  it('returns {already_v5: true} on v5 state', () => {
    run(['create', '--task', 'T', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    const r = run(['migrate-from-v4', '--session-dir', sessionDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.already_v5, true);
  });
});
