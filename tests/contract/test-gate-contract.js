'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SESSION_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'session.js');
const GATE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'gate.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-gate-'));
  execFileSync('node', [SESSION_SCRIPT, 'create', '--session-dir', testDir, '--feature', 'test', '--branch', 'main'], { encoding: 'utf-8' });
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

describe('gate.js contract', () => {
  it('schedule returns envelope with scheduled count', () => {
    const concepts = JSON.stringify([{ concept_id: 'x', domain: 'y', status: 'new', step: 'phase1_checkpoint1' }]);
    const output = run(['schedule', '--session-dir', testDir, '--phase', '1', '--concepts', concepts]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(typeof output.data.scheduled, 'number');
    assert.strictEqual(typeof output.data.total, 'number');
    assert.strictEqual('error' in output, false);
  });

  it('checkpoint returns envelope with result and missing', () => {
    const output = run(['checkpoint', '--session-dir', testDir, '--step', 'phase1_checkpoint1']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(['passed', 'blocked', 'degraded'].includes(output.data.result));
    assert.ok(Array.isArray(output.data.missing));
    assert.strictEqual('error' in output, false);
  });

  it('log returns envelope with logged true', () => {
    const entry = JSON.stringify({ event: 'test' });
    const output = run(['log', '--session-dir', testDir, '--entry', entry]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.logged, true);
  });

  it('status returns envelope with schedule, checkpoints, circuit', () => {
    const output = run(['status', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'ok');
    assert.ok(Array.isArray(output.data.schedule));
    assert.ok(Array.isArray(output.data.checkpoints));
    assert.ok(['closed', 'open', 'half-open'].includes(output.data.circuit));
  });

  it('error returns envelope with error object', () => {
    const badDir = path.join(testDir, 'nonexistent');
    const output = runExpectFail(['status', '--session-dir', badDir]);
    assert.strictEqual(output.status, 'error');
    assert.ok(output.error.level);
    assert.ok(output.error.message);
    assert.strictEqual('data' in output, false);
  });
});
