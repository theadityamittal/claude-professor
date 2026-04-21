'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'whiteboard.js');

let workDir, sessionDir;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-edd-'));
  sessionDir = path.join(workDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
}
function writeState(s) {
  fs.writeFileSync(path.join(sessionDir, '.session-state.json'), JSON.stringify(s, null, 2));
}
function readLog() {
  const p = path.join(sessionDir, '.session-log.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function baseState(overrides = {}) {
  return {
    schema_version: 5,
    session_id: 'sess-edd',
    task: 'design a payments service',
    current_phase: 4,
    phases: {},
    concepts_checked: [],
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

function fullState() {
  return baseState({
    phases: {
      1: {
        status: 'complete',
        concerns: [
          { id: 'data_consistency', source: 'catalog', concepts: ['transactions'], status: 'done' },
        ],
        current_concern_index: 1,
        discussions: [
          { unit_id: 'data_consistency', summary: 'Use single-writer; strong consistency in the ledger.', open_questions: ['idempotency key TTL?'] },
        ],
      },
      2: {
        status: 'complete',
        components: [
          {
            id: 'ledger',
            concepts_seed: ['transactions'],
            concepts_proposed: [{ id: 'double_entry', parent: 'transactions' }],
            L2_decisions: [{ id: 'double_entry', decision: 'use_canonical', canonical_id: 'double_entry_bookkeeping' }],
            concepts_checked: [],
            status: 'done',
          },
        ],
        current_component_index: 1,
        discussions: [
          { unit_id: 'ledger', summary: 'Ledger is append-only.' },
        ],
      },
      3: {
        status: 'in_progress',
        components: [
          {
            id: 'ledger_detail',
            concepts_seed: ['double_entry_bookkeeping'],
            concepts_proposed: [],
            L2_decisions: [],
            concepts_checked: [],
            status: 'in_progress',
          },
        ],
        current_component_index: 0,
        discussions: [],
      },
      4: { status: 'in_progress' },
    },
    concepts_checked: [
      { concept_id: 'transactions', concern_or_component: 'data_consistency', phase: 1, grade: 4, action: 'taught', timestamp: '2026-04-20T00:00:00Z' },
      { concept_id: 'double_entry_bookkeeping', concern_or_component: 'ledger', phase: 2, grade: 3, action: 'taught', timestamp: '2026-04-20T00:01:00Z' },
    ],
  });
}

describe('whiteboard.js export-design-doc', () => {
  it('blocks when --output is missing', () => {
    writeState(fullState());
    const r = run(['export-design-doc', '--session-dir', sessionDir]);
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stderr).error.message, /Missing required argument: --output/);
  });

  it('blocks when --template is unknown', () => {
    writeState(fullState());
    const out = path.join(workDir, 'design.md');
    const r = run(['export-design-doc', '--session-dir', sessionDir, '--output', out, '--template', 'fancy']);
    assert.equal(r.status, 2);
    assert.match(JSON.parse(r.stderr).error.message, /unknown template/);
  });

  it('blocks when phases 1/2/3 are not started', () => {
    writeState(baseState({ phases: {} })); // only init-style shape
    const out = path.join(workDir, 'design.md');
    const r = run(['export-design-doc', '--session-dir', sessionDir, '--output', out]);
    assert.equal(r.status, 2);
    const err = JSON.parse(r.stderr);
    assert.equal(err.error.level, 'blocking');
    assert.match(err.error.message, /phases not started/);
    assert.match(err.error.message, /1/);
    assert.match(err.error.message, /2/);
    assert.match(err.error.message, /3/);
  });

  it('happy path writes markdown with all expected sections and logs event', () => {
    writeState(fullState());
    const out = path.join(workDir, 'design.md');
    const r = run(['export-design-doc', '--session-dir', sessionDir, '--output', out]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.data.output_path, out);
    assert.ok(parsed.data.sections_written >= 3);

    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    assert.match(content, /^# design a payments service/m);
    assert.match(content, /## Phase 1 — Requirements/);
    assert.match(content, /## Phase 2 — High-Level Design/);
    assert.match(content, /## Phase 3 — Low-Level Design/);
    assert.match(content, /## Concept Coverage/);
    assert.match(content, /data_consistency/);
    assert.match(content, /idempotency key TTL/);
    assert.match(content, /ledger/);
    assert.match(content, /double_entry/);

    const events = readLog();
    const last = events[events.length - 1];
    assert.equal(last.event, 'design_doc_exported');
    assert.equal(last.output_path, out);
  });

  it('creates parent directories for the output path if they do not exist', () => {
    writeState(fullState());
    const nested = path.join(workDir, 'deep', 'nested', 'dir', 'design.md');
    assert.ok(!fs.existsSync(path.dirname(nested)));
    const r = run(['export-design-doc', '--session-dir', sessionDir, '--output', nested]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(nested));
    const content = fs.readFileSync(nested, 'utf-8');
    assert.match(content, /## Phase 1/);
    assert.match(content, /## Phase 2/);
    assert.match(content, /## Phase 3/);
  });
});
