'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'graph.js');
const PLUGIN_DIR = path.join(__dirname, '..', '..');

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('graph.js contract', () => {
  it('scan returns envelope with files array', () => {
    const output = run(['scan', '--dir', PLUGIN_DIR, '--budget', '10']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(Array.isArray(output.data.files));
    assert.ok(typeof output.data.total_files === 'number');
    assert.strictEqual('error' in output, false);
  });
});
