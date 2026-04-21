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

function makeRegistry() {
  return [
    { concept_id: 'information_retrieval', domain: 'search', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'ranking_algorithms', domain: 'search', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'caching', domain: 'systems', level: 1, is_seed_concept: true, difficulty_tier: 'beginner' },
  ];
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-regcomp-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
  concernsPath = path.join(workDir, 'concerns.json');
  fs.copyFileSync(REPO_CONCERNS, concernsPath);
  registryPath = path.join(workDir, 'concepts_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(makeRegistry(), null, 2));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}

/** Init + drive state to phase 2 (in_progress) via manual patch. */
function initAndPhase2() {
  let r = run(['init-session', '--task', 'rc-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0, `init: ${r.stderr}`);
  const statePath = path.join(sessionDir, '.session-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  state.current_phase = 2;
  state.phases = {
    1: { status: 'complete', concerns: [], current_concern_index: null, discussions: [] },
    2: { status: 'in_progress', components: [], current_component_index: null, discussions: [] },
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readState() {
  return JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-state.json'), 'utf-8'));
}

function readLog() {
  return fs
    .readFileSync(path.join(sessionDir, '.session-log.jsonl'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('whiteboard.js register-components — happy path', () => {
  it('registers 1 component with 1 seed + 2 proposed + 2 decisions', () => {
    initAndPhase2();
    const components = [
      {
        id: 'retrieval',
        concepts_seed: ['information_retrieval'],
        concepts_proposed: [
          { id: 'sparse_vectors', parent: 'information_retrieval' },
          { id: 'dense_retrieval', parent: 'information_retrieval' },
        ],
        L2_decisions: [
          { proposed: 'sparse_vectors', decision: 'accept_novel', matched_id: 'sparse_vectors', confidence: 0.91, reasoning: 'new' },
          { proposed: 'dense_retrieval', decision: 'accept_novel', matched_id: 'dense_retrieval', confidence: 0.85, reasoning: 'new' },
        ],
      },
    ];
    const r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.components_count, 1);
    assert.equal(out.data.total_concepts, 3); // 1 seed + 2 proposed
    assert.equal(out.data.novel_l2_count, 2);

    const state = readState();
    const p2 = state.phases['2'];
    assert.equal(p2.current_component_index, 0);
    assert.equal(p2.components.length, 1);
    const comp = p2.components[0];
    assert.equal(comp.id, 'retrieval');
    assert.deepEqual(comp.concepts_checked, []);
    assert.equal(comp.status, 'in_progress');
    assert.equal(comp.concepts_seed.length, 1);
    assert.equal(comp.concepts_proposed.length, 2);
    assert.equal(comp.L2_decisions.length, 2);
  });

  it('appends a components_selected event', () => {
    initAndPhase2();
    const components = [
      {
        id: 'cache',
        concepts_seed: ['caching'],
        concepts_proposed: [],
        L2_decisions: [],
      },
    ];
    const before = readLog().length;
    const r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'components_selected');
    assert.deepEqual(last.components, ['cache']);
    assert.ok(last.timestamp);
  });
});

describe('whiteboard.js register-components — validation errors', () => {
  it('rejects seed not in registry', () => {
    initAndPhase2();
    const components = [
      { id: 'x', concepts_seed: ['no_such_seed'], concepts_proposed: [], L2_decisions: [] },
    ];
    const r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /seed not in registry/);
  });

  it('rejects proposed whose parent is not in registry', () => {
    initAndPhase2();
    const components = [
      {
        id: 'x',
        concepts_seed: ['caching'],
        concepts_proposed: [{ id: 'foo', parent: 'no_such_parent' }],
        L2_decisions: [{ proposed: 'foo', decision: 'accept_novel', matched_id: 'foo', confidence: 0.5, reasoning: '' }],
      },
    ];
    const r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /parent not in registry/);
  });

  it('rejects when L2_decisions does not cover every proposed', () => {
    initAndPhase2();
    const components = [
      {
        id: 'x',
        concepts_seed: ['caching'],
        concepts_proposed: [
          { id: 'foo', parent: 'caching' },
          { id: 'bar', parent: 'caching' },
        ],
        L2_decisions: [
          { proposed: 'foo', decision: 'accept_novel', matched_id: 'foo', confidence: 0.5, reasoning: '' },
        ],
      },
    ];
    const r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /L2_decisions missing entry for proposed: bar/);
  });

  it('rejects when current_phase is 1 (wrong phase)', () => {
    // init + phase-start 1 then try register-components
    let r = run(['init-session', '--task', 'rc-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0);
    r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
    assert.equal(r.status, 0);
    const components = [{ id: 'x', concepts_seed: ['caching'], concepts_proposed: [], L2_decisions: [] }];
    r = run([
      'register-components',
      '--session-dir', sessionDir,
      '--components-json', JSON.stringify({ components }),
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /only valid in phase 2 or 3/);
  });
});
