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
    { concept_id: 'information_retrieval', domain: 'search', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'caching', domain: 'systems', level: 1, is_seed_concept: true, difficulty_tier: 'beginner' },
  ];
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-nextcomp-'));
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

function initPhase2WithComponent() {
  let r = run(['init-session', '--task', 'nc-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
  const s = readState();
  s.current_phase = 2;
  s.phases = {
    1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
    2: {
      status: 'in_progress',
      components: [
        {
          id: 'retrieval',
          concepts_seed: ['information_retrieval'],
          concepts_proposed: [{ id: 'sparse_vectors', parent: 'information_retrieval' }],
          L2_decisions: [{ proposed: 'sparse_vectors', decision: 'accept_novel', matched_id: 'sparse_vectors', confidence: 0.9, reasoning: '' }],
          concepts_checked: [],
          status: 'in_progress',
        },
      ],
      current_component_index: 0,
      discussions: [],
    },
  };
  writeState(s);
}

describe('whiteboard.js next-component — validation errors', () => {
  it('rejects when current_phase is 1 (wrong phase)', () => {
    let r = run(['init-session', '--task', 'nc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0);
    r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 0);
    r = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /only valid in phase 2 or 3/);
  });

  it('blocks when phase 2 started but no components scheduled', () => {
    let r = run(['init-session', '--task', 'nc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0);
    const s = readState();
    s.current_phase = 2;
    s.phases = {
      1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
      2: { status: 'in_progress', components: [], current_component_index: null, discussions: [] },
    };
    writeState(s);
    r = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /no components scheduled/);
  });
});

describe('whiteboard.js next-component — happy path', () => {
  it('returns first component with flattened seed + proposed concepts; does NOT advance index', () => {
    initPhase2WithComponent();
    const r = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.done, false);
    assert.equal(out.data.component_id, 'retrieval');
    assert.equal(out.data.concepts.length, 2);
    assert.equal(out.data.concepts[0].concept_id, 'information_retrieval');
    assert.equal(out.data.concepts[1].concept_id, 'sparse_vectors');
    // sparse_vectors is NOT in registry → in_registry false, fsrs_status new.
    assert.equal(out.data.concepts[1].registry_meta.in_registry, false);
    assert.equal(out.data.concepts[1].fsrs_status, 'new');
    // Index unchanged.
    const state = readState();
    assert.equal(state.phases['2'].current_component_index, 0);
  });

  it('returns {done: true, components_completed} when index past end', () => {
    initPhase2WithComponent();
    const s = readState();
    s.phases['2'].current_component_index = s.phases['2'].components.length;
    writeState(s);
    const r = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.done, true);
    assert.equal(out.data.components_completed, 1);
  });

  it('appends a next_component event with component_id + flattened concepts', () => {
    initPhase2WithComponent();
    const before = readLog().length;
    const r = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'next_component');
    assert.equal(last.component_id, 'retrieval');
    assert.deepEqual(last.concepts, ['information_retrieval', 'sparse_vectors']);
    assert.ok(last.timestamp);
  });
});
