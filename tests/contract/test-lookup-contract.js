'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'lookup.js');
const PLUGIN_DIR = path.join(__dirname, '..', '..');
const REGISTRY = path.join(PLUGIN_DIR, 'data', 'concepts_registry.json');
const DOMAINS = path.join(PLUGIN_DIR, 'data', 'domains.json');

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('lookup.js contract', () => {
  it('search returns envelope with matched_concepts', () => {
    const output = run(['search', '--query', 'caching', '--registry-path', REGISTRY, '--domains-path', DOMAINS]);
    assert.strictEqual(output.status, 'ok');
    assert.ok(Array.isArray(output.data.matched_concepts));
    assert.ok(Array.isArray(output.data.matched_domains));
    assert.strictEqual('error' in output, false);
  });

  it('reconcile returns envelope with match_type', () => {
    const output = run(['reconcile', '--mode', 'exact', '--candidate', 'oauth2', '--registry-path', REGISTRY, '--profile-dir', '/tmp/contract-test-lookup']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(output.data.match_type);
    assert.strictEqual('error' in output, false);
  });
});
