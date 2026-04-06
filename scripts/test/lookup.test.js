const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let profileDir;
const scriptPath = path.resolve(__dirname, '..', 'lookup.js');
const domainsPath = path.resolve(__dirname, '..', '..', 'data', 'domains.json');

const testRegistry = [
  { id: 'caching_strategies', domain: 'databases', difficulty: 'intermediate' },
  { id: 'redis', domain: 'databases', difficulty: 'intermediate' },
  { id: 'api_endpoint_design', domain: 'backend', difficulty: 'foundational' },
  { id: 'connection_pooling', domain: 'databases', difficulty: 'intermediate' },
  { id: 'gradient_descent', domain: 'ml_ai', difficulty: 'foundational' },
];

function runLookup(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-lookup-'));
  profileDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'registry.json'), JSON.stringify(testRegistry));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('lookup search mode', () => {
  it('finds concepts matching query words', () => {
    const result = runLookup([
      'search',
      '--query', 'Redis caching',
      '--registry-path', path.join(tmpDir, 'registry.json'),
      '--domains-path', domainsPath,
    ]);
    const ids = result.matched_concepts.map(c => c.id);
    assert.ok(ids.includes('redis'));
    assert.ok(ids.includes('caching_strategies'));
  });

  it('matches domain names', () => {
    const result = runLookup([
      'search',
      '--query', 'databases',
      '--registry-path', path.join(tmpDir, 'registry.json'),
      '--domains-path', domainsPath,
    ]);
    assert.ok(result.matched_domains.includes('databases'));
  });

  it('returns empty for non-matching query', () => {
    const result = runLookup([
      'search',
      '--query', 'xyznonexistent',
      '--registry-path', path.join(tmpDir, 'registry.json'),
      '--domains-path', domainsPath,
    ]);
    assert.equal(result.matched_concepts.length, 0);
  });
});

describe('lookup status mode', () => {
  it('returns new for concepts not in profile', () => {
    const result = runLookup([
      'status',
      '--concepts', 'connection_pooling,redis',
      '--profile-dir', profileDir,
      '--domains-path', domainsPath,
      '--registry-path', path.join(tmpDir, 'registry.json'),
    ]);
    assert.equal(result.concepts.length, 2);
    assert.equal(result.concepts[0].status, 'new');
    assert.equal(result.concepts[0].retrievability, null);
  });

  it('computes retrievability for known concepts', () => {
    const profileData = [{
      concept_id: 'connection_pooling',
      domain: 'databases',
      is_registry_concept: true,
      difficulty_tier: 'intermediate',
      first_encountered: '2026-03-01T00:00:00Z',
      last_reviewed: '2026-04-04T00:00:00Z',
      review_history: [{ date: '2026-04-04T00:00:00Z', grade: 3 }],
      fsrs_stability: 10.0,
      fsrs_difficulty: 5.0,
      documentation_url: null,
      notes: null,
    }];
    fs.writeFileSync(path.join(profileDir, 'databases.json'), JSON.stringify(profileData));

    const result = runLookup([
      'status',
      '--concepts', 'connection_pooling',
      '--profile-dir', profileDir,
      '--domains-path', domainsPath,
      '--registry-path', path.join(tmpDir, 'registry.json'),
    ]);
    assert.equal(result.concepts.length, 1);
    assert.ok(result.concepts[0].retrievability !== null);
    assert.ok(typeof result.concepts[0].stability === 'number');
  });

  it('creates profile directory if missing', () => {
    const newProfileDir = path.join(tmpDir, 'new-profile');
    const result = runLookup([
      'status',
      '--concepts', 'redis',
      '--profile-dir', newProfileDir,
      '--domains-path', domainsPath,
      '--registry-path', path.join(tmpDir, 'registry.json'),
    ]);
    assert.ok(fs.existsSync(newProfileDir));
    assert.equal(result.concepts[0].status, 'new');
  });
});
