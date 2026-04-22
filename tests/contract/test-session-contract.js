'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'session.js');
const CONCERNS_PATH = path.join(__dirname, '..', '..', 'data', 'concerns.json');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-session-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

function runExpectFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.fail('Expected command to fail');
  } catch (err) {
    return JSON.parse(err.stderr);
  }
}

describe('session.js contract (v5)', () => {
  it('create returns envelope with status ok and data', () => {
    const output = run([
      'create',
      '--task', 'Design a RAG pipeline',
      '--session-dir', testDir,
      '--concerns-path', CONCERNS_PATH,
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.ok(output.data);
    assert.strictEqual(output.data.success, true);
    assert.ok(output.data.session_id);
    assert.strictEqual(output.data.task, 'Design a RAG pipeline');
    assert.strictEqual('error' in output, false);
  });

  it('finish returns envelope with verified and warnings', () => {
    run([
      'create',
      '--task', 'Task',
      '--session-dir', testDir,
      '--concerns-path', CONCERNS_PATH,
    ]);
    const output = run(['finish', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.verified, true);
    assert.ok(Array.isArray(output.data.warnings));
    assert.strictEqual('error' in output, false);
  });

  it('error returns envelope with status error and error object', () => {
    const output = runExpectFail(['finish', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'error');
    assert.ok(output.error);
    assert.ok(output.error.level);
    assert.ok(output.error.message);
    assert.strictEqual('data' in output, false);
  });
});
