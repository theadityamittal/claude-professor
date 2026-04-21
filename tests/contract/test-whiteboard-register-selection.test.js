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

function makeConcerns() {
  return {
    schema_version: 5,
    concerns: {
      data_consistency: {
        description: 'Data consistency',
        keywords: ['consistency'],
        mapped_seeds: ['optimistic_concurrency', 'transactions'],
        canonical_sources: [],
      },
      observability: {
        description: 'Obs',
        keywords: ['logs'],
        mapped_seeds: ['logging', 'metrics'],
        canonical_sources: [],
      },
    },
  };
}

function makeRegistry() {
  // Top-level array per v5.
  return [
    { concept_id: 'optimistic_concurrency', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'transactions', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'logging', domain: 'observability', level: 1, is_seed_concept: true, difficulty_tier: 'beginner' },
    { concept_id: 'metrics', domain: 'observability', level: 1, is_seed_concept: true, difficulty_tier: 'beginner' },
    { concept_id: 'retry_backoff', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'idempotency', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
  ];
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-regsel-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
  // Use a fixture concerns.json so the in-repo one's hash isn't required.
  concernsPath = path.join(workDir, 'concerns.json');
  fs.writeFileSync(concernsPath, JSON.stringify(makeConcerns(), null, 2));
  registryPath = path.join(workDir, 'concepts_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(makeRegistry(), null, 2));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}

function initAndStartPhase1() {
  let r = run(['init-session', '--task', 'rs-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0, `init failed: ${r.stderr}`);
  r = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
  assert.equal(r.status, 0, `phase-start failed: ${r.stderr}`);
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

describe('whiteboard.js register-selection — happy paths', () => {
  it('registers two catalog concerns and writes phases.1.concerns + index 0', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [
        { id: 'data_consistency', source: 'catalog' },
        { id: 'observability', source: 'catalog' },
      ],
    });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.concerns_count, 2);
    assert.equal(out.data.catalog_count, 2);
    assert.equal(out.data.proposed_count, 0);
    assert.equal(out.data.total_concepts, 4);

    const state = readState();
    assert.equal(state.phases['1'].current_concern_index, 0);
    assert.equal(state.phases['1'].concerns.length, 2);
    assert.deepEqual(state.phases['1'].concerns[0], {
      id: 'data_consistency',
      source: 'catalog',
      concepts: ['optimistic_concurrency', 'transactions'],
    });
  });

  it('registers 1 catalog + 1 proposed concern with mapped_seeds resolved from input', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [
        { id: 'data_consistency', source: 'catalog' },
        { id: 'webhook_retries', source: 'proposed', mapped_seeds: ['retry_backoff', 'idempotency'] },
      ],
    });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.catalog_count, 1);
    assert.equal(out.data.proposed_count, 1);
    assert.equal(out.data.total_concepts, 4);

    const state = readState();
    assert.equal(state.phases['1'].concerns[1].source, 'proposed');
    assert.deepEqual(state.phases['1'].concerns[1].concepts, ['retry_backoff', 'idempotency']);
  });

  it('appends a concerns_selected event with proposed_count to the log', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [
        { id: 'data_consistency', source: 'catalog' },
        { id: 'webhook_retries', source: 'proposed', mapped_seeds: ['retry_backoff'] },
      ],
    });
    const before = readLog().length;
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'concerns_selected');
    assert.equal(last.proposed_count, 1);
    assert.deepEqual(last.concerns, [
      { id: 'data_consistency', source: 'catalog' },
      { id: 'webhook_retries', source: 'proposed' },
    ]);
    assert.ok(last.timestamp);
  });
});

describe('whiteboard.js register-selection — validation errors', () => {
  it('rejects unknown catalog id with blocking', () => {
    initAndStartPhase1();
    const json = JSON.stringify({ concerns: [{ id: 'no_such_concern', source: 'catalog' }] });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /catalog concern not found/);
  });

  it('rejects proposed id colliding with catalog id', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [
        { id: 'data_consistency', source: 'proposed', mapped_seeds: ['retry_backoff'] },
      ],
    });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /collides with catalog/);
  });

  it('rejects proposed concern with empty mapped_seeds', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [{ id: 'webhook_retries', source: 'proposed', mapped_seeds: [] }],
    });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /non-empty mapped_seeds/);
  });

  it('rejects proposed seed not in registry', () => {
    initAndStartPhase1();
    const json = JSON.stringify({
      concerns: [{ id: 'webhook_retries', source: 'proposed', mapped_seeds: ['no_such_seed'] }],
    });
    const r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /seed not in registry/);
  });

  it('rejects when current_phase is not 1 (e.g. phase 2)', () => {
    // Init only — no phase-start. Then manually patch state to phase 2.
    let r = run(['init-session', '--task', 'rs-test', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r.status, 0);
    const statePath = path.join(sessionDir, '.session-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.current_phase = 2;
    state.phases = { 2: { status: 'in_progress', components: [], current_component_index: null, discussions: [] } };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const json = JSON.stringify({ concerns: [{ id: 'data_consistency', source: 'catalog' }] });
    r = run([
      'register-selection',
      '--session-dir', sessionDir,
      '--concerns-json', json,
      '--concerns-path', concernsPath,
      '--registry-path', registryPath,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /only valid in phase 1/);
  });
});
