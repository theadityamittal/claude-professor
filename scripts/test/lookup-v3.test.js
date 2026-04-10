'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let profileDir;
let registryPath;
const SCRIPT = path.resolve(__dirname, '..', 'lookup.js');
const domainsPath = path.resolve(__dirname, '..', '..', 'data', 'domains.json');

// Phase 3 seed registry format
const seedRegistry = [
  {
    concept_id: 'consensus',
    domain: 'distributed_systems',
    difficulty_tier: 'advanced',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    aliases: ['distributed consensus'],
    related_concepts: ['leader_election'],
    scope_note: 'Agreement among nodes.',
  },
  {
    concept_id: 'leader_election',
    domain: 'distributed_systems',
    difficulty_tier: 'advanced',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    aliases: ['raft leader'],
    related_concepts: ['consensus'],
    scope_note: 'Selecting a coordinator node.',
  },
  {
    concept_id: 'bgp',
    domain: 'networking',
    difficulty_tier: 'advanced',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    aliases: ['border gateway protocol'],
    related_concepts: [],
    scope_note: 'Inter-domain routing protocol.',
  },
  {
    concept_id: 'oauth2',
    domain: 'security',
    difficulty_tier: 'intermediate',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    aliases: ['oauth', 'oauth 2.0'],
    related_concepts: [],
    scope_note: 'Authorization framework.',
  },
];

function makeFrontmatter(obj) {
  return '---json\n' + JSON.stringify(obj, null, 2) + '\n---\n\n# ' + obj.concept_id + '\n';
}

function runLookup(args) {
  const output = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(output);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-lookup-v3-'));
  profileDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  registryPath = path.join(tmpDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(seedRegistry));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── list-concepts ────────────────────────────────────────────────────────────

describe('list-concepts mode', () => {
  it('returns seed concepts for a single domain', () => {
    const result = runLookup([
      'list-concepts',
      '--domains', 'distributed_systems',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.ok(Array.isArray(result.concepts));
    const ids = result.concepts.map(c => c.concept_id);
    assert.ok(ids.includes('consensus'));
    assert.ok(ids.includes('leader_election'));
    assert.ok(!ids.includes('bgp'));
  });

  it('returns seed concepts for multiple domains', () => {
    const result = runLookup([
      'list-concepts',
      '--domains', 'distributed_systems,networking',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    const ids = result.concepts.map(c => c.concept_id);
    assert.ok(ids.includes('consensus'));
    assert.ok(ids.includes('bgp'));
    assert.ok(!ids.includes('oauth2'));
  });

  it('includes aliases and scope_note in each result', () => {
    const result = runLookup([
      'list-concepts',
      '--domains', 'distributed_systems',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    const c = result.concepts.find(x => x.concept_id === 'consensus');
    assert.ok(c);
    assert.deepEqual(c.aliases, ['distributed consensus']);
    assert.equal(c.scope_note, 'Agreement among nodes.');
    assert.equal(c.domain, 'distributed_systems');
    assert.equal(c.source, 'seed');
  });

  it('includes user profile concepts and merges with seed (profile overrides seed)', () => {
    // Write a profile concept that overrides 'consensus' with a different scope_note
    const domainDir = path.join(profileDir, 'distributed_systems');
    fs.mkdirSync(domainDir, { recursive: true });
    const profileFm = {
      concept_id: 'consensus',
      domain: 'distributed_systems',
      level: 1,
      aliases: ['distributed consensus', 'paxos consensus'],
      scope_note: 'User-customized scope note.',
      review_history: [],
      fsrs_stability: 5.0,
      fsrs_difficulty: 3.0,
    };
    fs.writeFileSync(path.join(domainDir, 'consensus.md'), makeFrontmatter(profileFm));

    const result = runLookup([
      'list-concepts',
      '--domains', 'distributed_systems',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    const c = result.concepts.find(x => x.concept_id === 'consensus');
    assert.ok(c);
    // Profile overrides seed
    assert.equal(c.source, 'profile');
    assert.equal(c.scope_note, 'User-customized scope note.');
    assert.deepEqual(c.aliases, ['distributed consensus', 'paxos consensus']);

    // leader_election still from seed
    const le = result.concepts.find(x => x.concept_id === 'leader_election');
    assert.equal(le.source, 'seed');
  });

  it('includes profile-only concepts not in seed registry', () => {
    const domainDir = path.join(profileDir, 'distributed_systems');
    fs.mkdirSync(domainDir, { recursive: true });
    const profileFm = {
      concept_id: 'custom_concept',
      domain: 'distributed_systems',
      level: 1,
      aliases: ['my custom'],
      scope_note: 'A custom concept.',
      review_history: [],
      fsrs_stability: 2.0,
      fsrs_difficulty: 4.0,
    };
    fs.writeFileSync(path.join(domainDir, 'custom_concept.md'), makeFrontmatter(profileFm));

    const result = runLookup([
      'list-concepts',
      '--domains', 'distributed_systems',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    const ids = result.concepts.map(c => c.concept_id);
    assert.ok(ids.includes('custom_concept'));
    const c = result.concepts.find(x => x.concept_id === 'custom_concept');
    assert.equal(c.source, 'profile');
  });
});

// ── reconcile ────────────────────────────────────────────────────────────────

describe('reconcile mode', () => {
  it('finds concept by exact ID in seed registry', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'oauth2',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'exact');
    assert.equal(result.concept_id, 'oauth2');
    assert.equal(result.domain, 'security');
    assert.equal(result.source, 'seed');
  });

  it('finds concept by exact ID in user profile', () => {
    const domainDir = path.join(profileDir, 'networking');
    fs.mkdirSync(domainDir, { recursive: true });
    const profileFm = {
      concept_id: 'bgp',
      domain: 'networking',
      level: 1,
      aliases: ['border gateway protocol', 'bgpv4'],
      scope_note: 'Profile version of BGP.',
      review_history: [],
      fsrs_stability: 8.0,
      fsrs_difficulty: 5.0,
    };
    fs.writeFileSync(path.join(domainDir, 'bgp.md'), makeFrontmatter(profileFm));

    const result = runLookup([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'bgp',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'exact');
    assert.equal(result.concept_id, 'bgp');
    assert.equal(result.domain, 'networking');
    // Profile overrides seed, so source should be profile
    assert.equal(result.source, 'profile');
  });

  it('finds concept by alias in seed registry', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'alias',
      '--candidate', 'oauth',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'alias');
    assert.equal(result.concept_id, 'oauth2');
    assert.equal(result.domain, 'security');
    assert.equal(result.source, 'seed');
  });

  it('finds concept by alias case-insensitively', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'alias',
      '--candidate', 'Distributed Consensus',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'alias');
    assert.equal(result.concept_id, 'consensus');
  });

  it('returns no_match for unknown concept', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'totally_unknown_concept',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'no_match');
  });

  it('returns no_match when alias does not match', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'alias',
      '--candidate', 'nonexistent_alias',
      '--registry', registryPath,
      '--profile-dir', profileDir,
    ]);

    assert.equal(result.match_type, 'no_match');
  });
});

// ── regression: existing modes still work ───────────────────────────────────

describe('existing modes regression', () => {
  // Use old Phase 1 registry format (id field) for compatibility with existing search tests
  const legacyRegistry = [
    { id: 'caching_strategies', domain: 'databases', difficulty: 'intermediate' },
    { id: 'redis', domain: 'databases', difficulty: 'intermediate' },
  ];

  it('search mode still works', () => {
    const legacyRegPath = path.join(tmpDir, 'legacy-registry.json');
    fs.writeFileSync(legacyRegPath, JSON.stringify(legacyRegistry));

    const result = runLookup([
      'search',
      '--query', 'redis',
      '--registry-path', legacyRegPath,
      '--domains-path', domainsPath,
    ]);

    assert.ok(Array.isArray(result.matched_concepts));
    const ids = result.matched_concepts.map(c => c.id);
    assert.ok(ids.includes('redis'));
  });

  it('status mode still works', () => {
    const result = runLookup([
      'status',
      '--concepts', 'consensus',
      '--profile-dir', profileDir,
      '--domains-path', domainsPath,
      '--registry-path', registryPath,
    ]);

    assert.ok(Array.isArray(result.concepts));
    assert.equal(result.concepts[0].concept_id, 'consensus');
  });
});
