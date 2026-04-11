'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-update-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('update.js contract', () => {
  it('create returns envelope with action created', () => {
    const output = run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir,
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'created');
    assert.strictEqual(output.data.success, true);
    assert.strictEqual('error' in output, false);
  });

  it('nonce skip returns envelope with action idempotent_skip', () => {
    run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    const output = run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'idempotent_skip');
  });
});
