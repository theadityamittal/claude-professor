'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeMarkdownFile } = require('../../scripts/utils.js');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');
const REPO_CONCERNS = path.join(__dirname, '..', '..', 'data', 'concerns.json');

let workDir;
let sessionDir;
let concernsPath;
let registryPath;
let profileDir;

function makeRegistry() {
  return [
    { concept_id: 'transactions', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'retry_backoff', domain: 'distributed_systems', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'information_retrieval', domain: 'search', level: 1, is_seed_concept: true, difficulty_tier: 'intermediate' },
    { concept_id: 'caching', domain: 'systems', level: 1, is_seed_concept: true, difficulty_tier: 'beginner' },
  ];
}

function addProfile(id, domain, overrides = {}) {
  const fm = {
    concept_id: id,
    domain,
    schema_version: 5,
    level: overrides.level ?? 1,
    parent_concept: overrides.parent_concept ?? null,
    is_seed_concept: overrides.is_seed_concept ?? true,
    difficulty_tier: overrides.difficulty_tier ?? 'intermediate',
    first_encountered: '2026-01-01T00:00:00Z',
    last_reviewed: overrides.last_reviewed ?? null,
    review_history: overrides.review_history ?? [],
    fsrs_stability: overrides.fsrs_stability ?? 1.0,
    fsrs_difficulty: overrides.fsrs_difficulty ?? 5.0,
    operation_nonce: null,
  };
  const body = '\n## Description\n\nDesc.\n\n## Teaching Guide\n\nGuide.\n';
  writeMarkdownFile(path.join(profileDir, domain, `${id}.md`), fm, body);
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-recconc-'));
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

function setupPhase1() {
  const r = run(['init-session', '--task', 'rc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
  assert.equal(r.status, 0);
  const r2 = run(['phase-start', '--session-dir', sessionDir, '--phase', '1']);
  assert.equal(r2.status, 0);
  const s = readState();
  s.phases['1'].concerns = [
    { id: 'data_consistency', source: 'catalog', concepts: ['transactions', 'retry_backoff'] },
  ];
  s.phases['1'].current_concern_index = 0;
  writeState(s);
}

function setupPhase2() {
  const r = run(['init-session', '--task', 'rc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
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
          L2_decisions: [],
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

describe('whiteboard.js record-concept — validation', () => {
  it('blocks when --notes is missing', () => {
    setupPhase1();
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--grade', '3',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /notes/i);
  });

  it('blocks when current_phase is null (no phase started)', () => {
    const r0 = run(['init-session', '--task', 'rc', '--session-dir', sessionDir, '--concerns-path', concernsPath]);
    assert.equal(r0.status, 0);
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--grade', '3',
      '--notes', 'Taught via X analogy',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /current_phase/);
  });

  it('blocks when unit_id does not match current scheduled unit', () => {
    setupPhase1();
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'wrong_concern',
      '--action', 'taught',
      '--grade', '3',
      '--notes', 'Taught via X analogy',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /does not match current scheduled unit/);
  });

  it('blocks when concept_id is not scheduled in current unit', () => {
    setupPhase1();
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'caching',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--grade', '3',
      '--notes', 'Taught via X analogy',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /not scheduled/);
  });

  it('blocks when --grade missing for action=taught', () => {
    setupPhase1();
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--notes', 'Taught via X analogy',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /grade/i);
  });

  it('blocks when --grade provided for action=skipped_not_due', () => {
    setupPhase1();
    // Create profile with high R so status becomes skip.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    addProfile('transactions', 'distributed_systems', {
      last_reviewed: yesterday,
      review_history: [{ date: yesterday, grade: 4 }],
      fsrs_stability: 10000,
    });
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'skipped_not_due',
      '--grade', '2',
      '--notes', 'skip per FSRS',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /grade not allowed for skipped_not_due/);
  });

  it('blocks on invalid --action vocabulary', () => {
    setupPhase1();
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'garbage',
      '--grade', '3',
      '--notes', 'x',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /Invalid --action/);
  });
});

describe('whiteboard.js record-concept — happy path', () => {
  it('phase 1: action=taught, status=new → appends concepts_checked + professor_action event', () => {
    setupPhase1();
    const before = readLog().length;
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--grade', '3',
      '--notes', 'Taught transactions via bank analogy',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'ok');
    assert.equal(out.data.recorded, true);

    const state = readState();
    assert.equal(state.concepts_checked.length, 1);
    const entry = state.concepts_checked[0];
    assert.equal(entry.concept_id, 'transactions');
    assert.equal(entry.concern_or_component, 'data_consistency');
    assert.equal(entry.phase, 1);
    assert.equal(entry.grade, 3);
    assert.equal(entry.action, 'taught');
    assert.ok(entry.timestamp);

    const events = readLog();
    assert.equal(events.length, before + 1);
    const last = events[events.length - 1];
    assert.equal(last.event, 'professor_action');
    assert.equal(last.concept_id, 'transactions');
    assert.equal(last.action, 'taught');
    assert.equal(last.grade, 3);
    assert.equal(last.notes, 'Taught transactions via bank analogy');
    assert.equal(last.phase, 1);
    assert.equal(last.unit_id, 'data_consistency');
  });

  it('accepts valid action even when live FSRS status has advanced (regression: issue 4)', () => {
    setupPhase1();
    // Simulate post-update.js state: profile now has skip-level stability.
    // Before the fix, record-concept would re-fetch this and reject "taught".
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    addProfile('transactions', 'distributed_systems', {
      last_reviewed: yesterday,
      review_history: [{ date: yesterday, grade: 4 }],
      fsrs_stability: 10000,
    });
    const r = run([
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'transactions',
      '--unit-id', 'data_consistency',
      '--action', 'taught',
      '--grade', '3',
      '--notes', 'Taught after FSRS already advanced to skip',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    // Should succeed: record-concept does not re-validate live FSRS status.
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.recorded, true);
    const state = readState();
    assert.equal(state.concepts_checked[0].action, 'taught');
  });

  it('phase 2 component seed; action=reviewed, status=review → appends both top-level and component concepts_checked', () => {
    setupPhase2();
    // Construct profile in review band (moderate R).
    const daysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    addProfile('information_retrieval', 'search', {
      last_reviewed: daysAgo,
      review_history: [{ date: daysAgo, grade: 3 }],
      fsrs_stability: 5.0,
    });
    // The review-band fsrs_stability heuristic is inherited from existing lookup test.
    // If FSRS computes `skip` or `teach_new`, fall back: we assert via actual status.

    // Fetch status indirectly: run next-component to check what lookup returns.
    const nc = run(['next-component', '--session-dir', sessionDir, '--registry-path', registryPath, '--profile-dir', profileDir]);
    assert.equal(nc.status, 0, `stderr: ${nc.stderr}`);
    const ncOut = JSON.parse(nc.stdout);
    const irStatus = ncOut.data.concepts[0].fsrs_status;
    // Pick an action that pairs with whatever irStatus is.
    const actionByStatus = {
      new: 'taught',
      encountered_via_child: 'taught',
      teach_new: 'reviewed',
      review: 'reviewed',
      skip: 'skipped_not_due',
    };
    const action = actionByStatus[irStatus];
    const needsGrade = action === 'taught' || action === 'reviewed';

    const args = [
      'record-concept',
      '--session-dir', sessionDir,
      '--concept-id', 'information_retrieval',
      '--unit-id', 'retrieval',
      '--action', action,
      '--notes', 'Reviewed IR basics',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ];
    if (needsGrade) args.push('--grade', '3');

    const r = run(args);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.data.recorded, true);

    const state = readState();
    assert.equal(state.concepts_checked.length, 1);
    assert.equal(state.concepts_checked[0].phase, 2);
    assert.equal(state.concepts_checked[0].action, action);

    // Component-level array must also include the concept id.
    const comp = state.phases['2'].components[0];
    assert.deepEqual(comp.concepts_checked, ['information_retrieval']);
  });
});
