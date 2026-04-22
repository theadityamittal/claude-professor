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
let registryPath;
let profileDir;

function makeRegistry() {
  return [
    { concept_id: 'optimistic_concurrency', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'transactions', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'retry_backoff', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
  ];
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-nextconc-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
  concernsPath = path.join(workDir, 'concerns.json');
  fs.copyFileSync(REPO_CONCERNS, concernsPath);
  registryPath = path.join(workDir, 'concepts_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(makeRegistry(), null, 2));
  profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
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

function initStartPhase1() {
  let r = run(['init-session', '--task', 'nc-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0, `init: ${r.stderr}`);
  r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
  assert.equal(r.status, 0, `p1 start: ${r.stderr}`);
}

function seedConcernsInState() {
  const state = readState();
  state.phases['1'].concerns = [
    { id: 'data_consistency', source: 'catalog', concepts: ['optimistic_concurrency', 'transactions'] },
    { id: 'webhook_retries', source: 'proposed', concepts: ['retry_backoff'] },
  ];
  state.phases['1'].current_concern_index = 0;
  writeState(state);
}

describe('whiteboard.js next-concern — validation errors', () => {
  it('rejects when current_phase is not 1 (e.g. phase 2)', () => {
    let r = run(['init-session', '--task', 'nc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0);
    const s = readState();
    s.current_phase = 2;
    s.phases = { 2: { status: 'in_progress', components: [], current_component_index: null, discussions: [] } };
    writeState(s);

    r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /only valid in phase 1/);
  });

  it('blocks when phase 1 started but no concerns scheduled', () => {
    initStartPhase1();
    const r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /no concerns scheduled/);
  });
});

describe('whiteboard.js next-concern — happy path', () => {
  it('returns first concern with concepts; does NOT advance current_concern_index', () => {
    initStartPhase1();
    seedConcernsInState();
    const r = run([
      'next-concern',
      '--session-dir', sessionDir,
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.done, false);
    assert.equal(out.data.concern_id, 'data_consistency');
    assert.equal(out.data.source, 'catalog');
    assert.equal(out.data.concepts.length, 2);
    // Shape assertions (not specific FSRS values).
    for (const c of out.data.concepts) {
      assert.ok(typeof c.concept_id === 'string');
      assert.ok(c.registry_meta && typeof c.registry_meta === 'object');
      assert.ok(typeof c.fsrs_status === 'string');
      // profile_path is either null or a string; empty profile dir → null.
      assert.ok(c.profile_path === null || typeof c.profile_path === 'string');
    }

    // Index unchanged.
    const state = readState();
    assert.equal(state.phases['1'].current_concern_index, 0);
  });

  it('returns {done: true, concerns_completed} when index is past end', () => {
    initStartPhase1();
    seedConcernsInState();
    const state = readState();
    state.phases['1'].current_concern_index = state.phases['1'].concerns.length; // 2
    writeState(state);

    const r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.done, true);
    assert.equal(out.data.concerns_completed, 2);
  });

  it('appends a next_concern event with concern_id + concepts', () => {
    initStartPhase1();
    seedConcernsInState();
    const before = readLog().length;
    const r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'next_concern');
    assert.equal(last.concern_id, 'data_consistency');
    assert.deepEqual(last.concepts, ['optimistic_concurrency', 'transactions']);
    assert.ok(last.timestamp);
  });

  it('does NOT append a next_concern event when done', () => {
    initStartPhase1();
    seedConcernsInState();
    const state = readState();
    state.phases['1'].current_concern_index = state.phases['1'].concerns.length;
    writeState(state);
    const before = readLog().length;
    const r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0);
    const events = readLog();
    assert.equal(events.length, before);
  });

  it('populates concept state from lookup.js (empty profile → fsrs_status=new, profile_path=null)', () => {
    initStartPhase1();
    seedConcernsInState();
    const r = run(['next-concern', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    for (const c of out.data.concepts) {
      assert.equal(c.fsrs_status, 'new');
      assert.equal(c.profile_path, null);
      assert.equal(c.registry_meta.in_registry, true);
    }
  });
});
