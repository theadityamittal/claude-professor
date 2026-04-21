'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GATE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'gate.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-gate-'));
  // Minimal v5 session state directly; session.js migration to v5 is handled in T-SCRIPT-4.
  fs.writeFileSync(
    path.join(testDir, '.session-state.json'),
    JSON.stringify({
      schema_version: 5,
      phases: { '1': { status: 'in_progress', concerns: [] } },
      concepts_checked: [],
    }),
  );
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [GATE_SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

function runExpectFail(args) {
  try {
    execFileSync('node', [GATE_SCRIPT, ...args], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.fail('Expected command to fail');
  } catch (err) {
    return JSON.parse(err.stderr);
  }
}

describe('gate.js contract (v5)', () => {
  it('checkpoint returns envelope with passed/blocked result, missing, counts, timestamp', () => {
    const output = run(['checkpoint', '--session-dir', testDir, '--step', '1']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(['passed', 'blocked'].includes(output.data.result));
    assert.ok(Array.isArray(output.data.missing));
    assert.strictEqual(typeof output.data.scheduled_count, 'number');
    assert.strictEqual(typeof output.data.checked_count, 'number');
    assert.ok(output.data.timestamp);
    assert.strictEqual('error' in output, false);
  });

  it('checkpoint never returns degraded result (circuit_breaker is removed)', () => {
    const output = run(['checkpoint', '--session-dir', testDir, '--step', '1']);
    assert.notStrictEqual(output.data.result, 'degraded');
  });

  it('log returns envelope with logged true', () => {
    const entry = JSON.stringify({ event: 'test' });
    const output = run(['log', '--session-dir', testDir, '--entry', entry]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.logged, true);
  });

  it('status returns envelope with phases and concepts_checked', () => {
    const output = run(['status', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'ok');
    assert.ok(output.data.phases);
    assert.ok(Array.isArray(output.data.concepts_checked));
    // circuit field removed in v5
    assert.strictEqual('circuit' in output.data, false);
  });

  it('error returns envelope with error object', () => {
    const badDir = path.join(testDir, 'nonexistent');
    const output = runExpectFail(['status', '--session-dir', badDir]);
    assert.strictEqual(output.status, 'error');
    assert.ok(output.error.level);
    assert.ok(output.error.message);
    assert.strictEqual('data' in output, false);
  });

  it('schedule subcommand is removed (blocking error)', () => {
    const output = runExpectFail(['schedule', '--session-dir', testDir, '--phase', '1', '--concepts', '[]']);
    assert.strictEqual(output.status, 'error');
    assert.strictEqual(output.error.level, 'blocking');
  });

  it('--force-proceed flag is rejected on checkpoint', () => {
    const output = runExpectFail(['checkpoint', '--session-dir', testDir, '--step', '1', '--force-proceed']);
    assert.strictEqual(output.status, 'error');
  });
});
