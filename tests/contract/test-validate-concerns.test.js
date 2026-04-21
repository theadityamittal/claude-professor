'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'validate-concerns.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-validate-concerns-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function writeFixtures(concernsDoc, registry) {
  const concernsPath = path.join(testDir, 'concerns.json');
  const registryPath = path.join(testDir, 'registry.json');
  fs.writeFileSync(concernsPath, JSON.stringify(concernsDoc, null, 2), 'utf-8');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  return { concernsPath, registryPath };
}

function run(args) {
  const res = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return {
    code: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

function makeRegistry(ids, domain = 'testing') {
  return ids.map(id => ({ concept_id: id, domain }));
}

describe('validate-concerns.js contract', () => {
  it('happy path: valid concerns and registry exit 0', () => {
    const registry = makeRegistry(['a', 'b', 'c', 'd', 'e', 'f', 'orph1', 'orph2', 'orph3']);
    const concerns = {
      schema_version: 5,
      concerns: {
        c1: { description: 'x', keywords: [], mapped_seeds: ['a', 'b', 'c'], canonical_sources: [] },
        c2: { description: 'y', keywords: [], mapped_seeds: ['d', 'e', 'f'], canonical_sources: [] },
      },
      orphan_l1s: {
        orph1: 'reason',
        orph2: 'reason',
        orph3: 'reason',
      },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.status, 'ok');
    assert.strictEqual(out.data.concerns_count, 2);
    assert.strictEqual(out.data.registry_count, 9);
    assert.strictEqual(out.data.mapped_count, 6);
    assert.strictEqual(out.data.orphan_count, 3);
  });

  it('seed not in registry fails', () => {
    const registry = makeRegistry(['a', 'b', 'c']);
    const concerns = {
      schema_version: 5,
      concerns: {
        data_modeling: { description: '', keywords: [], mapped_seeds: ['a', 'b', 'ghost'], canonical_sources: [] },
      },
      orphan_l1s: { c: 'reason' },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /ghost/);
    assert.match(out.error.message, /not in registry/);
  });

  it('uncovered L1 fails', () => {
    const registry = makeRegistry(['a', 'b', 'c', 'd', 'lonely']);
    const concerns = {
      schema_version: 5,
      concerns: {
        c1: { description: '', keywords: [], mapped_seeds: ['a', 'b', 'c'], canonical_sources: [] },
      },
      orphan_l1s: { d: 'reason' },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /lonely/);
  });

  it('disjoint violation: ID in both mapped_seeds and orphan_l1s fails', () => {
    const registry = makeRegistry(['a', 'b', 'c', 'd']);
    const concerns = {
      schema_version: 5,
      concerns: {
        X: { description: '', keywords: [], mapped_seeds: ['a', 'b', 'c'], canonical_sources: [] },
      },
      orphan_l1s: { a: 'reason', d: 'reason' },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /a/);
    assert.match(out.error.message, /disjoint|both/);
  });

  it('over-mapped L1 (>4 concerns) fails', () => {
    const registry = makeRegistry(['foo', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y']);
    const concerns = {
      schema_version: 5,
      concerns: {
        c1: { description: '', keywords: [], mapped_seeds: ['foo', 'p', 'q'], canonical_sources: [] },
        c2: { description: '', keywords: [], mapped_seeds: ['foo', 'r', 's'], canonical_sources: [] },
        c3: { description: '', keywords: [], mapped_seeds: ['foo', 't', 'u'], canonical_sources: [] },
        c4: { description: '', keywords: [], mapped_seeds: ['foo', 'v', 'w'], canonical_sources: [] },
        c5: { description: '', keywords: [], mapped_seeds: ['foo', 'x', 'y'], canonical_sources: [] },
      },
      orphan_l1s: {},
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /foo/);
  });

  it('concern with <3 seeds fails', () => {
    const registry = makeRegistry(['a', 'b', 'c', 'd']);
    const concerns = {
      schema_version: 5,
      concerns: {
        small_concern: { description: '', keywords: [], mapped_seeds: ['a', 'b'], canonical_sources: [] },
      },
      orphan_l1s: { c: 'r', d: 'r' },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /small_concern/);
  });

  it('orphan not in registry fails', () => {
    const registry = makeRegistry(['a', 'b', 'c']);
    const concerns = {
      schema_version: 5,
      concerns: {
        c1: { description: '', keywords: [], mapped_seeds: ['a', 'b', 'c'], canonical_sources: [] },
      },
      orphan_l1s: { fake_id: 'reason' },
    };
    const { concernsPath, registryPath } = writeFixtures(concerns, registry);
    const r = run(['--concerns', concernsPath, '--registry', registryPath]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /fake_id/);
  });

  it('missing required args fails with exit 2', () => {
    const r = run([]);
    assert.strictEqual(r.code, 2);
    const out = JSON.parse(r.stderr);
    assert.strictEqual(out.status, 'error');
    assert.match(out.error.message, /--concerns|--registry|required/);
  });
});
