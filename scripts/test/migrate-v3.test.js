'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readMarkdownWithFrontmatter, writeMarkdownFile } = require('../utils.js');
const { migrate } = require('../migrate-v3.js');

let tmpDir;
let profileDir;

// Helper: create a Phase 2 concept file in profileDir
function createPhase2Concept(domain, conceptId, overrides = {}) {
  const dirPath = path.join(profileDir, domain);
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, `${conceptId}.md`);
  const frontmatter = {
    concept_id: conceptId,
    domain,
    is_registry_concept: true,
    difficulty_tier: 'foundational',
    first_encountered: '2026-04-01T00:00:00Z',
    last_reviewed: '2026-04-05T00:00:00Z',
    review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
    fsrs_stability: 10.0,
    fsrs_difficulty: 5.0,
    documentation_url: null,
    ...overrides,
  };
  const body = `\n# ${conceptId}\n\n## Notes\nSome notes.\n`;
  writeMarkdownFile(filePath, frontmatter, body);
  return filePath;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-migrate-v3-'));
  profileDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrate-v3 — domain renames', () => {
  it('renames systems/ to operating_systems/ and updates domain field', () => {
    createPhase2Concept('systems', 'processes');

    const stats = migrate(profileDir);

    const destPath = path.join(profileDir, 'operating_systems', 'processes.md');
    assert.ok(fs.existsSync(destPath), 'File should exist at operating_systems/processes.md');
    assert.ok(!fs.existsSync(path.join(profileDir, 'systems', 'processes.md')), 'Source file should be removed');

    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'operating_systems');
    assert.ok(stats.moved >= 1);
  });

  it('renames ml_ai/ to machine_learning/ and updates domain field', () => {
    createPhase2Concept('ml_ai', 'gradient_descent');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'machine_learning', 'gradient_descent.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'machine_learning');
  });

  it('renames languages/ to programming_languages/ and updates domain field', () => {
    createPhase2Concept('languages', 'closures');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'programming_languages', 'closures.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'programming_languages');
  });
});

describe('migrate-v3 — domain merges', () => {
  it('merges algorithms/ + data_structures/ into algorithms_data_structures/', () => {
    createPhase2Concept('algorithms', 'quicksort');
    createPhase2Concept('data_structures', 'binary_tree');

    const stats = migrate(profileDir);

    const sortPath = path.join(profileDir, 'algorithms_data_structures', 'quicksort.md');
    const treePath = path.join(profileDir, 'algorithms_data_structures', 'binary_tree.md');
    assert.ok(fs.existsSync(sortPath), 'quicksort should be in merged domain');
    assert.ok(fs.existsSync(treePath), 'binary_tree should be in merged domain');
    assert.ok(!fs.existsSync(path.join(profileDir, 'algorithms', 'quicksort.md')));
    assert.ok(!fs.existsSync(path.join(profileDir, 'data_structures', 'binary_tree.md')));

    const { frontmatter: f1 } = readMarkdownWithFrontmatter(sortPath);
    const { frontmatter: f2 } = readMarkdownWithFrontmatter(treePath);
    assert.equal(f1.domain, 'algorithms_data_structures');
    assert.equal(f2.domain, 'algorithms_data_structures');
    assert.equal(stats.moved, 2);
  });

  it('merges cloud_infrastructure/ into devops_infrastructure/', () => {
    createPhase2Concept('cloud_infrastructure', 'kubernetes');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'devops_infrastructure', 'kubernetes.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'devops_infrastructure');
  });
});

describe('migrate-v3 — field enrichment', () => {
  it('adds Phase 3 default fields to migrated concepts', () => {
    createPhase2Concept('systems', 'processes');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'operating_systems', 'processes.md');
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.level, 1);
    assert.equal(frontmatter.parent_concept, null);
    assert.deepEqual(frontmatter.aliases, []);
    assert.deepEqual(frontmatter.related_concepts, []);
    assert.equal(frontmatter.scope_note, '');
  });

  it('renames is_registry_concept → is_seed_concept', () => {
    createPhase2Concept('ml_ai', 'neural_net', { is_registry_concept: true });

    migrate(profileDir);

    const destPath = path.join(profileDir, 'machine_learning', 'neural_net.md');
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.is_seed_concept, true);
    assert.ok(!('is_registry_concept' in frontmatter), 'Old field should be removed');
  });

  it('renames difficulty_tier "foundational" → "beginner"', () => {
    createPhase2Concept('languages', 'variables', { difficulty_tier: 'foundational' });

    migrate(profileDir);

    const destPath = path.join(profileDir, 'programming_languages', 'variables.md');
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.difficulty_tier, 'beginner');
  });

  it('does not rename non-foundational difficulty tiers', () => {
    createPhase2Concept('ml_ai', 'transformers', { difficulty_tier: 'advanced' });

    migrate(profileDir);

    const destPath = path.join(profileDir, 'machine_learning', 'transformers.md');
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.difficulty_tier, 'advanced');
  });
});

describe('migrate-v3 — FSRS field preservation', () => {
  it('preserves FSRS fields (stability, difficulty, review_history)', () => {
    createPhase2Concept('algorithms', 'mergesort', {
      fsrs_stability: 42.5,
      fsrs_difficulty: 7.3,
      review_history: [
        { date: '2026-04-01T00:00:00Z', grade: 4 },
        { date: '2026-04-03T00:00:00Z', grade: 5 },
      ],
      first_encountered: '2026-04-01T00:00:00Z',
      last_reviewed: '2026-04-03T00:00:00Z',
    });

    migrate(profileDir);

    const destPath = path.join(profileDir, 'algorithms_data_structures', 'mergesort.md');
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.fsrs_stability, 42.5);
    assert.equal(frontmatter.fsrs_difficulty, 7.3);
    assert.equal(frontmatter.review_history.length, 2);
    assert.equal(frontmatter.review_history[0].grade, 4);
    assert.equal(frontmatter.review_history[1].grade, 5);
    assert.equal(frontmatter.first_encountered, '2026-04-01T00:00:00Z');
    assert.equal(frontmatter.last_reviewed, '2026-04-03T00:00:00Z');
  });
});

describe('migrate-v3 — idempotency', () => {
  it('is idempotent — running twice does not duplicate or error', () => {
    createPhase2Concept('systems', 'threads');

    const stats1 = migrate(profileDir);
    const stats2 = migrate(profileDir);

    // First run moves the file; source dir is removed
    assert.equal(stats1.moved, 1);
    // Second run: source dir is gone, destination is an unknown domain — nothing to migrate
    assert.equal(stats2.moved, 0);
    assert.equal(stats2.errors, 0);

    const destPath = path.join(profileDir, 'operating_systems', 'threads.md');
    const destFiles = fs.readdirSync(path.join(profileDir, 'operating_systems'));
    assert.equal(destFiles.filter(f => f === 'threads.md').length, 1, 'Exactly one file');
    assert.ok(fs.existsSync(destPath));
  });

  it('skips dest files that already exist', () => {
    // Create source
    createPhase2Concept('ml_ai', 'backprop');
    // Pre-populate destination
    const destDir = path.join(profileDir, 'machine_learning');
    fs.mkdirSync(destDir, { recursive: true });
    const alreadyThere = path.join(destDir, 'backprop.md');
    writeMarkdownFile(alreadyThere, { concept_id: 'backprop', domain: 'machine_learning' }, 'existing content\n');

    const stats = migrate(profileDir);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.moved, 0);

    // Should not overwrite
    const { body } = readMarkdownWithFrontmatter(alreadyThere);
    assert.ok(body.includes('existing content'));
  });
});

describe('migrate-v3 — backend redistribution', () => {
  it('redistributes backend/ rest_api → api_design', () => {
    createPhase2Concept('backend', 'rest_api');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'api_design', 'rest_api.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'api_design');
  });

  it('redistributes backend/ websockets → networking', () => {
    createPhase2Concept('backend', 'websockets');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'networking', 'websockets.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'networking');
  });

  it('redistributes backend/ async_patterns → concurrency', () => {
    createPhase2Concept('backend', 'async_patterns');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'concurrency', 'async_patterns.md');
    assert.ok(fs.existsSync(destPath));
  });

  it('redistributes backend/ circuit_breaker → reliability_observability', () => {
    createPhase2Concept('backend', 'circuit_breaker');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'reliability_observability', 'circuit_breaker.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'reliability_observability');
  });

  it('redistributes backend/ authentication → security', () => {
    createPhase2Concept('backend', 'authentication');

    migrate(profileDir);

    assert.ok(fs.existsSync(path.join(profileDir, 'security', 'authentication.md')));
  });

  it('redistributes backend/ caching → performance_scalability', () => {
    createPhase2Concept('backend', 'caching');

    migrate(profileDir);

    assert.ok(fs.existsSync(path.join(profileDir, 'performance_scalability', 'caching.md')));
  });

  it('redistributes unmapped backend/ concept → architecture (fallback)', () => {
    createPhase2Concept('backend', 'some_unknown_concept');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'architecture', 'some_unknown_concept.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'architecture');
  });

  it('redistributes all backend/ concepts to their correct domains in one pass', () => {
    const backendConcepts = [
      ['rest_api', 'api_design'],
      ['graphql', 'api_design'],
      ['websockets', 'networking'],
      ['middleware', 'architecture'],
      ['async_patterns', 'concurrency'],
      ['event_sourcing', 'architecture'],
      ['circuit_breaker', 'reliability_observability'],
      ['rate_limiting', 'api_design'],
      ['idempotency', 'distributed_systems'],
      ['session_management', 'security'],
      ['connection_pooling', 'databases'],
      ['caching', 'performance_scalability'],
      ['message_queue', 'performance_scalability'],
      ['microservices', 'architecture'],
      ['api_gateway', 'api_design'],
      ['pagination', 'api_design'],
      ['authentication', 'security'],
      ['authorization', 'security'],
    ];

    for (const [conceptId] of backendConcepts) {
      createPhase2Concept('backend', conceptId);
    }

    const stats = migrate(profileDir);
    assert.equal(stats.moved, backendConcepts.length);

    for (const [conceptId, expectedDomain] of backendConcepts) {
      const destPath = path.join(profileDir, expectedDomain, `${conceptId}.md`);
      assert.ok(fs.existsSync(destPath), `${conceptId} should be in ${expectedDomain}`);
      const { frontmatter } = readMarkdownWithFrontmatter(destPath);
      assert.equal(frontmatter.domain, expectedDomain, `${conceptId} domain should be ${expectedDomain}`);
    }
  });
});

describe('migrate-v3 — tools and custom', () => {
  it('redirects tools/ → software_construction/', () => {
    createPhase2Concept('tools', 'git_rebase');

    migrate(profileDir);

    const destPath = path.join(profileDir, 'software_construction', 'git_rebase.md');
    assert.ok(fs.existsSync(destPath));
    const { frontmatter } = readMarkdownWithFrontmatter(destPath);
    assert.equal(frontmatter.domain, 'software_construction');
  });

  it('moves custom/ → _unmapped/', () => {
    createPhase2Concept('custom', 'my_weird_thing');

    const stats = migrate(profileDir);

    const destPath = path.join(profileDir, '_unmapped', 'my_weird_thing.md');
    assert.ok(fs.existsSync(destPath));
    assert.ok(stats.moved >= 1);
  });
});

describe('migrate-v3 — stats return', () => {
  it('returns correct stats: moved, skipped, enriched, errors', () => {
    createPhase2Concept('systems', 'scheduler');
    createPhase2Concept('ml_ai', 'relu');

    const stats = migrate(profileDir);

    assert.ok(typeof stats.moved === 'number');
    assert.ok(typeof stats.skipped === 'number');
    assert.ok(typeof stats.enriched === 'number');
    assert.ok(typeof stats.errors === 'number');
    assert.equal(stats.moved, 2);
    assert.equal(stats.enriched, 2);
    assert.equal(stats.errors, 0);
  });

  it('returns zero stats for empty profileDir', () => {
    const stats = migrate(profileDir);
    assert.equal(stats.moved, 0);
    assert.equal(stats.skipped, 0);
    assert.equal(stats.enriched, 0);
    assert.equal(stats.errors, 0);
  });
});

describe('migrate-v3 — cleanup of empty source dirs', () => {
  it('removes empty source directory after moving all files', () => {
    createPhase2Concept('systems', 'scheduling');

    migrate(profileDir);

    assert.ok(!fs.existsSync(path.join(profileDir, 'systems')), 'Empty systems/ dir should be removed');
  });

  it('leaves non-empty source directories intact if some files were skipped', () => {
    createPhase2Concept('systems', 'ipc');
    // Pre-populate destination so it gets skipped
    const destDir = path.join(profileDir, 'operating_systems');
    fs.mkdirSync(destDir, { recursive: true });
    writeMarkdownFile(path.join(destDir, 'ipc.md'), { concept_id: 'ipc', domain: 'operating_systems' }, 'existing\n');

    migrate(profileDir);

    // The source was not moved (skipped), so source dir should still exist with the file
    assert.ok(fs.existsSync(path.join(profileDir, 'systems', 'ipc.md')), 'Skipped file should remain in source');
  });
});
