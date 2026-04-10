'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readMarkdownWithFrontmatter, writeMarkdownFile } = require('../utils.js');

// ── Shared state — single temp dir across all tests ──────────────────────────

let tmpDir;
let profileDir;
let registryPath;
let domainsPath;

const LOOKUP = path.resolve(__dirname, '..', 'lookup.js');
const UPDATE = path.resolve(__dirname, '..', 'update.js');
const MIGRATE = path.resolve(__dirname, '..', 'migrate-v3.js');

const REAL_REGISTRY = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');
const REAL_DOMAINS = path.resolve(__dirname, '..', '..', 'data', 'domains.json');

function runLookup(args) {
  const out = execFileSync('node', [LOOKUP, ...args], { encoding: 'utf-8', timeout: 5000 });
  return JSON.parse(out);
}

function runUpdate(args) {
  const out = execFileSync('node', [UPDATE, ...args], { encoding: 'utf-8', timeout: 5000 });
  return JSON.parse(out);
}

function runMigrate(args) {
  return execFileSync('node', [MIGRATE, ...args], { encoding: 'utf-8', timeout: 10000 });
}

// ── Setup: single shared temp dir ────────────────────────────────────────────

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-lifecycle-'));
  profileDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });

  // Copy real registry and domains into temp dir for realistic tests
  registryPath = path.join(tmpDir, 'registry.json');
  domainsPath = path.join(tmpDir, 'domains.json');
  fs.copyFileSync(REAL_REGISTRY, registryPath);
  fs.copyFileSync(REAL_DOMAINS, domainsPath);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Phase 1: L1 Resolution (resolve-only) ────────────────────────────────────

describe('Phase 1: L1 Resolution (resolve-only)', () => {
  it('reconcile exact match finds seed concept', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'oauth2',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.match_type, 'exact');
    assert.equal(result.concept_id, 'oauth2');
  });

  it('reconcile alias match resolves to canonical ID', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'alias',
      '--candidate', 'oauth',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.match_type, 'alias');
    assert.equal(result.concept_id, 'oauth2');
  });

  it('reconcile no match for unknown concept', () => {
    const result = runLookup([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'nonexistent_xyz',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.match_type, 'no_match');
  });

  it('list-concepts returns concepts with scope_notes for specified domains', () => {
    const result = runLookup([
      'list-concepts',
      '--domains', 'security',
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ]);
    assert.ok(Array.isArray(result.concepts));
    assert.ok(result.concepts.length > 0, 'Expected at least one security concept');
    for (const c of result.concepts) {
      assert.ok(c.scope_note !== undefined && c.scope_note !== null,
        `Concept ${c.concept_id} is missing scope_note`);
    }
  });

  it('status shows new concept as new (no profile file)', () => {
    const result = runLookup([
      'status',
      '--concepts', 'oauth2',
      '--profile-dir', profileDir,
      '--domains-path', domainsPath,
      '--registry-path', registryPath,
    ]);
    assert.ok(Array.isArray(result.concepts));
    const concept = result.concepts[0];
    assert.equal(concept.concept_id, 'oauth2');
    // No profile file yet → status is 'new' (legacy) or 'teach_new' (FSRS determineAction)
    assert.ok(
      concept.status === 'new' || concept.status === 'teach_new',
      `Expected new or teach_new, got: ${concept.status}`
    );
  });
});

// ── Professor-teach simulation: first teach ───────────────────────────────────

describe('Professor-teach simulation: first teach', () => {
  it('update creates concept file with FSRS on grade', () => {
    const result = runUpdate([
      '--concept', 'oauth2',
      '--domain', 'security',
      '--grade', '3',
      '--profile-dir', profileDir,
      '--level', '1',
      '--is-seed-concept',
      '--scope-note', 'Delegation framework',
    ]);
    assert.equal(result.success, true);
    assert.ok(['created', 'updated'].includes(result.action), `unexpected action: ${result.action}`);

    const filePath = path.join(profileDir, 'security', 'oauth2.md');
    assert.ok(fs.existsSync(filePath), 'Concept file should exist');

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.ok(frontmatter.fsrs_stability > 0, 'fsrs_stability should be > 0 after grade');
    assert.ok(frontmatter.fsrs_difficulty > 0, 'fsrs_difficulty should be > 0 after grade');
    assert.equal(frontmatter.review_history.length, 1, 'Should have 1 review entry');
  });

  it('status shows just-taught concept as skip (R ≈ 1.0)', () => {
    const result = runLookup([
      'status',
      '--concepts', 'oauth2',
      '--profile-dir', profileDir,
      '--domains-path', domainsPath,
      '--registry-path', registryPath,
    ]);
    const concept = result.concepts[0];
    assert.equal(concept.status, 'skip', `Expected skip, got: ${concept.status}`);
  });
});

// ── Body writing ──────────────────────────────────────────────────────────────

describe('Body writing', () => {
  it('update --body writes markdown body', () => {
    const body = '# OAuth2\n\n## Key Points\n- Delegation framework\n';
    const result = runUpdate([
      '--concept', 'oauth2',
      '--domain', 'security',
      '--profile-dir', profileDir,
      '--body', body,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'body_updated');

    const filePath = path.join(profileDir, 'security', 'oauth2.md');
    const { body: fileBody } = readMarkdownWithFrontmatter(filePath);
    assert.ok(fileBody.includes('Key Points'), 'Body should contain Key Points section');
  });
});

// ── Phase 3: L2 creation with parent ensure ───────────────────────────────────

describe('Phase 3: L2 creation with parent ensure', () => {
  it('create-parent creates L1 with FSRS defaults', () => {
    const result = runUpdate([
      '--concept', 'consensus',
      '--domain', 'distributed_systems',
      '--profile-dir', profileDir,
      '--create-parent',
      '--level', '1',
      '--is-seed-concept',
      '--scope-note', 'Agreement among nodes',
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');

    const filePath = path.join(profileDir, 'distributed_systems', 'consensus.md');
    assert.ok(fs.existsSync(filePath), 'Parent concept file should exist');

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.fsrs_stability, 0, 'New parent should have stability=0');
    assert.equal(frontmatter.fsrs_difficulty, 0, 'New parent should have difficulty=0');
    assert.deepEqual(frontmatter.review_history, [], 'New parent should have empty review_history');
  });

  it('L2 concept created with parent reference', () => {
    const result = runUpdate([
      '--concept', 'raft_protocol',
      '--domain', 'distributed_systems',
      '--grade', '3',
      '--profile-dir', profileDir,
      '--level', '2',
      '--parent-concept', 'consensus',
      '--scope-note', 'Raft consensus implementation',
    ]);
    assert.equal(result.success, true);

    const filePath = path.join(profileDir, 'distributed_systems', 'raft_protocol.md');
    assert.ok(fs.existsSync(filePath), 'L2 concept file should exist');

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.level, 2, 'L2 concept should have level=2');
    assert.equal(frontmatter.parent_concept, 'consensus', 'L2 concept should reference parent');
  });

  it('parent L1 file has empty review_history (encountered_via_child state)', () => {
    const filePath = path.join(profileDir, 'distributed_systems', 'consensus.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.review_history.length, 0,
      'Parent created via create-parent should still have empty review_history');
  });

  it('create-parent on existing concept returns already_exists', () => {
    // oauth2 was created with a grade in the teach test above — has FSRS data
    const result = runUpdate([
      '--concept', 'oauth2',
      '--domain', 'security',
      '--profile-dir', profileDir,
      '--create-parent',
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'already_exists');

    // FSRS should be preserved
    const filePath = path.join(profileDir, 'security', 'oauth2.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.ok(frontmatter.fsrs_stability > 0,
      'Existing FSRS stability should be preserved after create-parent no-op');
  });
});

// ── Migration ─────────────────────────────────────────────────────────────────

describe('Migration', () => {
  it('migrates Phase 2 concept files correctly', () => {
    const migrateDir = path.join(tmpDir, 'migrate');
    fs.mkdirSync(migrateDir, { recursive: true });

    // Create Phase 2 format files in old domain directories
    const phase2Frontmatter = {
      concept_id: 'processes',
      domain: 'systems',
      is_registry_concept: true,
      difficulty_tier: 'foundational',
      first_encountered: '2026-04-01T00:00:00Z',
      last_reviewed: '2026-04-05T00:00:00Z',
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
      fsrs_stability: 10.0,
      fsrs_difficulty: 5.0,
    };
    fs.mkdirSync(path.join(migrateDir, 'systems'), { recursive: true });
    writeMarkdownFile(
      path.join(migrateDir, 'systems', 'processes.md'),
      phase2Frontmatter,
      '\n# Processes\n\n## Notes\nOS processes.\n'
    );

    const phase2RestApiFm = {
      concept_id: 'rest_api',
      domain: 'backend',
      is_registry_concept: true,
      difficulty_tier: 'foundational',
      first_encountered: '2026-04-01T00:00:00Z',
      last_reviewed: '2026-04-05T00:00:00Z',
      review_history: [],
      fsrs_stability: 5.0,
      fsrs_difficulty: 3.5,
    };
    fs.mkdirSync(path.join(migrateDir, 'backend'), { recursive: true });
    writeMarkdownFile(
      path.join(migrateDir, 'backend', 'rest_api.md'),
      phase2RestApiFm,
      '\n# Rest Api\n\n## Notes\nRESTful design.\n'
    );

    const phase2BinarySearchFm = {
      concept_id: 'binary_search',
      domain: 'algorithms',
      is_registry_concept: true,
      difficulty_tier: 'intermediate',
      first_encountered: '2026-04-01T00:00:00Z',
      last_reviewed: '2026-04-05T00:00:00Z',
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
      fsrs_stability: 15.0,
      fsrs_difficulty: 4.0,
    };
    fs.mkdirSync(path.join(migrateDir, 'algorithms'), { recursive: true });
    writeMarkdownFile(
      path.join(migrateDir, 'algorithms', 'binary_search.md'),
      phase2BinarySearchFm,
      '\n# Binary Search\n\n## Notes\nO(log n) search.\n'
    );

    // Run migration
    runMigrate(['--profile-dir', migrateDir]);

    // Verify systems → operating_systems
    const processesPath = path.join(migrateDir, 'operating_systems', 'processes.md');
    assert.ok(fs.existsSync(processesPath), 'operating_systems/processes.md should exist');
    const { frontmatter: processesFm } = readMarkdownWithFrontmatter(processesPath);
    assert.equal(processesFm.domain, 'operating_systems');
    assert.equal(processesFm.level, 1);
    assert.equal(processesFm.is_seed_concept, true);
    assert.deepEqual(processesFm.aliases, []);
    assert.ok(!('is_registry_concept' in processesFm), 'Old is_registry_concept field should be removed');

    // Verify backend/rest_api → api_design
    const restApiPath = path.join(migrateDir, 'api_design', 'rest_api.md');
    assert.ok(fs.existsSync(restApiPath), 'api_design/rest_api.md should exist');
    const { frontmatter: restApiFm } = readMarkdownWithFrontmatter(restApiPath);
    assert.equal(restApiFm.domain, 'api_design');
    assert.equal(restApiFm.level, 1);
    assert.equal(restApiFm.is_seed_concept, true);

    // Verify algorithms → algorithms_data_structures
    const binarySearchPath = path.join(migrateDir, 'algorithms_data_structures', 'binary_search.md');
    assert.ok(fs.existsSync(binarySearchPath), 'algorithms_data_structures/binary_search.md should exist');
    const { frontmatter: binarySearchFm } = readMarkdownWithFrontmatter(binarySearchPath);
    assert.equal(binarySearchFm.domain, 'algorithms_data_structures');
    assert.equal(binarySearchFm.level, 1);
    assert.equal(binarySearchFm.is_seed_concept, true);
    assert.deepEqual(binarySearchFm.aliases, []);

    // Verify old directories removed
    assert.ok(!fs.existsSync(path.join(migrateDir, 'systems')), 'systems/ dir should be removed');
    assert.ok(!fs.existsSync(path.join(migrateDir, 'algorithms')), 'algorithms/ dir should be removed');
  });
});
