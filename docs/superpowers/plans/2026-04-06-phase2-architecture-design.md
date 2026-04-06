# Phase 2: Architecture Analysis & System Design — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand claude-professor with architecture analysis and backend system design capabilities. Migrate storage to markdown, add lazy concept checking during design conversations, and produce high-level design documents.

**Architecture:** Bottom-up build. Storage migration first (Tasks 1-4), hard compatibility gate (Task 5), then new scripts and skills in parallel where possible. Each layer is testable before the next depends on it.

**Tech Stack:** Node.js (no external dependencies), `node:test` for testing, JSON frontmatter in markdown files, Claude Code plugin system (skills, agents, hooks).

**Spec:** `docs/superpowers/specs/2026-04-06-phase2-architecture-design-design.md`
**Reference:** `INSTRUCTIONS-v2.md` (full specification), `phase2-implementation-plan.md` (detailed code snippets)

---

## Task 1: Storage Migration — utils.js Additions

**Files:**
- Modify: `scripts/utils.js`
- Modify: `scripts/test/utils.test.js`

- [ ] **Step 1: Write failing tests for new markdown functions**

Add these imports at the top of `scripts/test/utils.test.js` (after existing imports):

```javascript
const {
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
} = require('../utils.js');
```

Then add these test blocks after the existing `parseArgs` describe block:

```javascript
describe('readMarkdownWithFrontmatter', () => {
  it('parses JSON frontmatter and body', () => {
    const filePath = path.join(tmpDir, 'concept.md');
    fs.writeFileSync(filePath, [
      '---json',
      '{"concept_id": "test", "domain": "testing", "fsrs_stability": 5.0}',
      '---',
      '',
      '# Test Concept',
      '',
      'Some notes here.',
    ].join('\n'));
    const result = readMarkdownWithFrontmatter(filePath);
    assert.equal(result.frontmatter.concept_id, 'test');
    assert.equal(result.frontmatter.fsrs_stability, 5.0);
    assert.ok(result.body.includes('# Test Concept'));
    assert.ok(result.body.includes('Some notes here.'));
  });

  it('returns null for non-existent file', () => {
    assert.equal(readMarkdownWithFrontmatter(path.join(tmpDir, 'nope.md')), null);
  });

  it('handles multi-line JSON frontmatter', () => {
    const filePath = path.join(tmpDir, 'multi.md');
    const fm = {
      concept_id: 'multi_test',
      review_history: [
        { date: '2026-04-01T00:00:00Z', grade: 3 },
        { date: '2026-04-05T00:00:00Z', grade: 4 },
      ],
    };
    fs.writeFileSync(filePath, [
      '---json',
      JSON.stringify(fm, null, 2),
      '---',
      '',
      '# Multi Test',
    ].join('\n'));
    const result = readMarkdownWithFrontmatter(filePath);
    assert.equal(result.frontmatter.review_history.length, 2);
    assert.equal(result.frontmatter.review_history[1].grade, 4);
  });

  it('throws on malformed JSON in frontmatter', () => {
    const filePath = path.join(tmpDir, 'bad.md');
    fs.writeFileSync(filePath, '---json\n{ broken }\n---\n\n# Bad');
    assert.throws(() => readMarkdownWithFrontmatter(filePath));
  });

  it('handles empty body after frontmatter', () => {
    const filePath = path.join(tmpDir, 'empty-body.md');
    fs.writeFileSync(filePath, '---json\n{"concept_id": "empty"}\n---\n');
    const result = readMarkdownWithFrontmatter(filePath);
    assert.equal(result.frontmatter.concept_id, 'empty');
    assert.equal(result.body.trim(), '');
  });
});

describe('writeMarkdownFile', () => {
  it('writes JSON frontmatter and body', () => {
    const filePath = path.join(tmpDir, 'out.md');
    writeMarkdownFile(filePath, { concept_id: 'test', grade: 3 }, '# Test\n\nBody text.');
    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.startsWith('---json\n'));
    assert.ok(raw.includes('"concept_id": "test"'));
    assert.ok(raw.includes('# Test'));
    // Verify round-trip
    const result = readMarkdownWithFrontmatter(filePath);
    assert.equal(result.frontmatter.concept_id, 'test');
    assert.ok(result.body.includes('Body text.'));
  });

  it('creates parent directories', () => {
    const filePath = path.join(tmpDir, 'a', 'b', 'deep.md');
    writeMarkdownFile(filePath, { id: 'deep' }, '# Deep');
    assert.ok(fs.existsSync(filePath));
  });

  it('preserves body when only updating frontmatter', () => {
    const filePath = path.join(tmpDir, 'preserve.md');
    writeMarkdownFile(filePath, { score: 1 }, '# Original Body\n\nDo not lose this.');
    // Update frontmatter only
    const { body } = readMarkdownWithFrontmatter(filePath);
    writeMarkdownFile(filePath, { score: 2 }, body);
    const result = readMarkdownWithFrontmatter(filePath);
    assert.equal(result.frontmatter.score, 2);
    assert.ok(result.body.includes('Do not lose this.'));
  });
});

describe('listMarkdownFiles', () => {
  it('lists .md files in directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), '# B');
    fs.writeFileSync(path.join(tmpDir, 'c.json'), '{}');
    const files = listMarkdownFiles(tmpDir);
    assert.equal(files.length, 2);
    assert.ok(files.includes('a.md'));
    assert.ok(files.includes('b.md'));
    assert.ok(!files.includes('c.json'));
  });

  it('returns empty array for non-existent directory', () => {
    const files = listMarkdownFiles(path.join(tmpDir, 'nonexistent'));
    assert.deepEqual(files, []);
  });
});

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const result = expandHome('~/test/path');
    assert.ok(!result.startsWith('~'));
    assert.ok(result.endsWith('/test/path'));
  });

  it('leaves absolute paths unchanged', () => {
    assert.equal(expandHome('/absolute/path'), '/absolute/path');
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
node --test scripts/test/utils.test.js
```

Expected: New tests FAIL (functions not exported), existing tests still PASS.

- [ ] **Step 3: Implement new utils.js functions**

Add `const os = require('node:os');` to the top of `scripts/utils.js` (after the existing `path` import).

Add these functions before `module.exports`:

```javascript
function readMarkdownWithFrontmatter(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const fmStart = raw.indexOf('---json\n');
  if (fmStart === -1) throw new Error(`No ---json frontmatter in ${filePath}`);
  const fmContentStart = fmStart + '---json\n'.length;
  const fmEnd = raw.indexOf('\n---', fmContentStart);
  if (fmEnd === -1) throw new Error(`Unclosed frontmatter in ${filePath}`);

  const jsonStr = raw.slice(fmContentStart, fmEnd);
  const frontmatter = JSON.parse(jsonStr);
  const body = raw.slice(fmEnd + '\n---'.length).replace(/^\n/, '');

  return { frontmatter, body };
}

function writeMarkdownFile(filePath, frontmatter, body) {
  ensureDir(path.dirname(filePath));
  const content = '---json\n' + JSON.stringify(frontmatter, null, 2) + '\n---\n' + (body || '');
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function listMarkdownFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function expandHome(filepath) {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}
```

Update `module.exports` to include the new functions:

```javascript
module.exports = {
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
};
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
node --test scripts/test/utils.test.js
```

Expected: All tests PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add scripts/utils.js scripts/test/utils.test.js
git commit -m "feat: add markdown frontmatter read/write utilities for Phase 2 storage"
```

---

## Task 2: Storage Migration — lookup.js Update

**Files:**
- Modify: `scripts/lookup.js`
- Modify: `scripts/test/lookup.test.js`

- [ ] **Step 1: Update lookup.test.js for markdown-based profile**

Replace the import line to include `fs` utilities we need, and update the `status` mode tests. The `search` mode tests are unchanged.

In `scripts/test/lookup.test.js`, replace the `'computes retrievability for known concepts'` test:

```javascript
  it('computes retrievability for known concepts', () => {
    const conceptDir = path.join(profileDir, 'databases');
    fs.mkdirSync(conceptDir, { recursive: true });

    const frontmatter = {
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
    };
    const content = '---json\n' + JSON.stringify(frontmatter, null, 2) + '\n---\n\n# Connection Pooling\n';
    fs.writeFileSync(path.join(conceptDir, 'connection_pooling.md'), content);

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
```

The other status tests (`'returns new for concepts not in profile'` and `'creates profile directory if missing'`) remain unchanged — they test the "no concept found" path which returns `new` regardless of storage format.

- [ ] **Step 2: Run tests to verify the updated test fails**

```bash
node --test scripts/test/lookup.test.js
```

Expected: `'computes retrievability for known concepts'` FAILS (lookup.js still reads JSON), other tests PASS.

- [ ] **Step 3: Update lookup.js status mode**

In `scripts/lookup.js`, add `readMarkdownWithFrontmatter` to the import from utils.js:

```javascript
const { readJSON, ensureDir, parseArgs, daysBetween, isoNow, readMarkdownWithFrontmatter } = require('./utils.js');
```

Replace the `status` function body:

```javascript
function status(conceptIds, profileDir, domainsPath, registryPath) {
  ensureDir(profileDir);
  const registry = readJSON(registryPath) || [];
  const now = isoNow();

  const concepts = conceptIds.map(conceptId => {
    const registryEntry = registry.find(c => c.id === conceptId);
    let domain = registryEntry ? registryEntry.domain : null;

    if (!domain) {
      const domains = readJSON(domainsPath) || [];
      for (const d of domains) {
        const conceptPath = path.join(profileDir, d.id, `${conceptId}.md`);
        if (fs.existsSync(conceptPath)) {
          domain = d.id;
          break;
        }
      }
    }

    if (!domain) {
      return {
        concept_id: conceptId, domain: null, status: 'new',
        retrievability: null, stability: null, difficulty: null,
        grade_history: [], last_reviewed: null, days_since_review: null,
        documentation_url: null,
      };
    }

    const conceptPath = path.join(profileDir, domain, `${conceptId}.md`);
    const result = readMarkdownWithFrontmatter(conceptPath);

    if (!result) {
      return {
        concept_id: conceptId, domain, status: 'new',
        retrievability: null, stability: null, difficulty: null,
        grade_history: [], last_reviewed: null, days_since_review: null,
        documentation_url: null,
      };
    }

    const entry = result.frontmatter;
    const elapsed = daysBetween(entry.last_reviewed, now);
    const retrievability = computeRetrievability(entry.fsrs_stability, elapsed);
    const action = determineAction(retrievability);

    return {
      concept_id: conceptId, domain, status: action,
      retrievability: Math.round(retrievability * 1000) / 1000,
      stability: entry.fsrs_stability,
      difficulty: entry.fsrs_difficulty,
      grade_history: (entry.review_history || []).map(r => r.grade),
      last_reviewed: entry.last_reviewed,
      days_since_review: Math.round(elapsed * 10) / 10,
      documentation_url: entry.documentation_url || null,
    };
  });

  return { concepts };
}
```

Note: Add `const fs = require('node:fs');` at the top of `scripts/lookup.js` (it's not currently imported there because Phase 1 used `readJSON` for file access).

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/lookup.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lookup.js scripts/test/lookup.test.js
git commit -m "feat: update lookup.js to read markdown concept files"
```

---

## Task 3: Storage Migration — update.js Update

**Files:**
- Modify: `scripts/update.js`
- Modify: `scripts/test/update.test.js`

- [ ] **Step 1: Rewrite update.test.js for markdown output**

Replace the entire test file `scripts/test/update.test.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readMarkdownWithFrontmatter } = require('../utils.js');

let tmpDir;
let profileDir;
const scriptPath = path.resolve(__dirname, '..', 'update.js');

function runUpdate(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-update-'));
  profileDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('update.js', () => {
  it('creates new concept as markdown file', () => {
    const result = runUpdate([
      '--concept', 'cache_aside_pattern',
      '--domain', 'databases',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
      '--notes', 'Learned during Redis caching design',
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');
    assert.equal(result.concept_id, 'cache_aside_pattern');
    assert.ok(result.new_stability > 0);

    // Verify markdown file was created
    const filePath = path.join(profileDir, 'databases', 'cache_aside_pattern.md');
    assert.ok(fs.existsSync(filePath), 'Expected markdown file to exist');

    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.startsWith('---json\n'), 'Expected JSON frontmatter');
    assert.ok(raw.includes('"concept_id": "cache_aside_pattern"'));
    assert.ok(raw.includes('# Cache Aside Pattern'), 'Expected human-readable title');
    assert.ok(raw.includes('Redis caching design'), 'Expected notes in body');
  });

  it('updates existing markdown concept file', () => {
    // Create initial
    runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    // Update
    const result = runUpdate([
      '--concept', 'redis', '--domain', 'databases',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.equal(result.action, 'updated');

    // Verify review_history appended in frontmatter
    const filePath = path.join(profileDir, 'databases', 'redis.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.review_history.length, 2);
    assert.equal(frontmatter.review_history[1].grade, 4);
  });

  it('preserves markdown body when updating frontmatter', () => {
    // Create with notes
    runUpdate([
      '--concept', 'noted_concept', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
      '--notes', 'Important context here',
    ]);
    // Update grade only (no --notes)
    runUpdate([
      '--concept', 'noted_concept', '--domain', 'backend',
      '--grade', '4', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);

    const filePath = path.join(profileDir, 'backend', 'noted_concept.md');
    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.includes('Important context here'), 'Body should be preserved');
  });

  it('uses initial stability for first encounter', () => {
    const result = runUpdate([
      '--concept', 'test_concept', '--domain', 'testing',
      '--grade', '3', '--is-registry-concept', 'false',
      '--difficulty-tier', 'foundational', '--profile-dir', profileDir,
    ]);
    assert.ok(Math.abs(result.new_stability - 2.3065) < 0.01,
      `Expected ~2.3065, got ${result.new_stability}`);
  });

  it('lapse never increases stability', () => {
    runUpdate([
      '--concept', 'test_lapse', '--domain', 'testing',
      '--grade', '4', '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    const filePath = path.join(profileDir, 'testing', 'test_lapse.md');
    const { frontmatter: fm1 } = readMarkdownWithFrontmatter(filePath);
    const stabilityBefore = fm1.fsrs_stability;

    const result = runUpdate([
      '--concept', 'test_lapse', '--domain', 'testing',
      '--grade', '1', '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    assert.ok(result.new_stability <= stabilityBefore,
      `Lapse should not increase stability: ${result.new_stability} > ${stabilityBefore}`);
  });

  it('preserves documentation_url across updates', () => {
    runUpdate([
      '--concept', 'noted', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
      '--documentation-url', 'https://example.com/docs',
      '--notes', 'Test note',
    ]);
    runUpdate([
      '--concept', 'noted', '--domain', 'backend',
      '--grade', '3', '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate', '--profile-dir', profileDir,
    ]);
    const filePath = path.join(profileDir, 'backend', 'noted.md');
    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.documentation_url, 'https://example.com/docs');
  });

  it('exits with code 1 on missing required args', () => {
    assert.throws(() => {
      execFileSync('node', [scriptPath, '--concept', 'test'], {
        encoding: 'utf-8', timeout: 5000,
      });
    }, (err) => err.status === 1);
  });

  it('rejects invalid grade values', () => {
    for (const bad of ['0', '5', 'abc', '-1']) {
      assert.throws(() => {
        execFileSync('node', [
          scriptPath, '--concept', 'test_invalid', '--domain', 'testing',
          '--grade', bad, '--profile-dir', profileDir,
        ], { encoding: 'utf-8', timeout: 5000 });
      }, (err) => err.status === 1, `Expected exit 1 for grade=${bad}`);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify updated tests fail**

```bash
node --test scripts/test/update.test.js
```

Expected: Tests that check for markdown files FAIL (update.js still writes JSON).

- [ ] **Step 3: Rewrite update.js for markdown storage**

Replace the `update` function body in `scripts/update.js`. Add new imports:

```javascript
const { readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
        readMarkdownWithFrontmatter, writeMarkdownFile } = require('./utils.js');
```

Replace the `update` function:

```javascript
function update(options) {
  const { concept, domain, grade, isRegistryConcept, difficultyTier,
          profileDir, documentationUrl, notes } = options;

  const gradeNum = parseInt(grade, 10);
  if (![1, 2, 3, 4].includes(gradeNum)) {
    throw new Error(`Invalid grade: ${grade}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
  }

  ensureDir(profileDir);
  const conceptPath = path.join(profileDir, domain, `${concept}.md`);
  const existing = readMarkdownWithFrontmatter(conceptPath);
  const now = isoNow();

  if (!existing) {
    const newStability = getInitialStability(gradeNum);
    const newDifficulty = getInitialDifficulty(gradeNum);

    const frontmatter = {
      concept_id: concept,
      domain,
      is_registry_concept: isRegistryConcept === 'true',
      difficulty_tier: difficultyTier,
      first_encountered: now,
      last_reviewed: now,
      review_history: [{ date: now, grade: gradeNum }],
      fsrs_stability: newStability,
      fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
      documentation_url: documentationUrl || null,
    };
    const title = concept.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const body = `\n# ${title}\n\n## Notes\n${notes || 'No notes yet.'}\n`;
    writeMarkdownFile(conceptPath, frontmatter, body);

    return {
      success: true,
      concept_id: concept,
      domain,
      new_stability: Math.round(newStability * 10000) / 10000,
      new_difficulty: Math.round(newDifficulty * 1000) / 1000,
      action: 'created',
    };
  }

  const entry = existing.frontmatter;
  const elapsed = daysBetween(entry.last_reviewed, now);
  const retrievability = computeRetrievability(entry.fsrs_stability, Math.max(elapsed, 0.001));

  const newStability = computeNewStability(
    entry.fsrs_stability, entry.fsrs_difficulty, gradeNum, retrievability
  );
  const newDifficulty = computeNewDifficulty(entry.fsrs_difficulty, gradeNum);

  const updatedFrontmatter = {
    ...entry,
    last_reviewed: now,
    review_history: [...entry.review_history, { date: now, grade: gradeNum }],
    fsrs_stability: Math.round(newStability * 10000) / 10000,
    fsrs_difficulty: Math.round(newDifficulty * 1000) / 1000,
    documentation_url: documentationUrl || entry.documentation_url,
  };

  writeMarkdownFile(conceptPath, updatedFrontmatter, existing.body);

  return {
    success: true,
    concept_id: concept,
    domain,
    new_stability: updatedFrontmatter.fsrs_stability,
    new_difficulty: updatedFrontmatter.fsrs_difficulty,
    action: 'updated',
  };
}
```

- [ ] **Step 4: Run update tests**

```bash
node --test scripts/test/update.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Run all tests together**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/update.js scripts/test/update.test.js
git commit -m "feat: update update.js to write markdown concept files"
```

---

## Task 4: Migration Script

**Files:**
- Create: `scripts/migrate-v2.js`
- Create: `scripts/test/migrate-v2.test.js`

- [ ] **Step 1: Write tests**

Create `scripts/test/migrate-v2.test.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { readMarkdownWithFrontmatter } = require('../utils.js');

let tmpDir, sourceDir, targetDir;
const scriptPath = path.resolve(__dirname, '..', 'migrate-v2.js');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-migrate-'));
  sourceDir = path.join(tmpDir, 'profile');
  targetDir = path.join(tmpDir, 'concepts');
  fs.mkdirSync(sourceDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrate-v2', () => {
  it('converts JSON profile to markdown concept files', () => {
    fs.writeFileSync(path.join(sourceDir, 'databases.json'), JSON.stringify([
      {
        concept_id: 'connection_pooling',
        domain: 'databases',
        is_registry_concept: true,
        difficulty_tier: 'intermediate',
        first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-05T00:00:00Z',
        review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
        fsrs_stability: 10.0,
        fsrs_difficulty: 5.0,
        documentation_url: null,
        notes: 'Test note',
      },
    ]));

    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir], {
      encoding: 'utf-8', timeout: 5000,
    });

    const filePath = path.join(targetDir, 'databases', 'connection_pooling.md');
    assert.ok(fs.existsSync(filePath), 'Concept file should exist');

    const { frontmatter, body } = readMarkdownWithFrontmatter(filePath);
    assert.equal(frontmatter.concept_id, 'connection_pooling');
    assert.equal(frontmatter.fsrs_stability, 10.0);
    assert.ok(body.includes('Test note'));
    assert.ok(output.includes('1 concept'));
  });

  it('is idempotent — running twice does not duplicate', () => {
    fs.writeFileSync(path.join(sourceDir, 'backend.json'), JSON.stringify([
      { concept_id: 'rest_api', domain: 'backend', is_registry_concept: true,
        difficulty_tier: 'foundational', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
        fsrs_stability: 8.0, fsrs_difficulty: 3.0, documentation_url: null, notes: null },
    ]));

    execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });
    execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });

    const files = fs.readdirSync(path.join(targetDir, 'backend'));
    assert.equal(files.length, 1);
  });

  it('handles empty source directory', () => {
    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });
    assert.ok(output.includes('0 concept'));
  });

  it('migrates multiple concepts across multiple domains', () => {
    fs.writeFileSync(path.join(sourceDir, 'databases.json'), JSON.stringify([
      { concept_id: 'redis', domain: 'databases', is_registry_concept: true,
        difficulty_tier: 'intermediate', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
        fsrs_stability: 5.0, fsrs_difficulty: 4.0, documentation_url: null, notes: null },
      { concept_id: 'cache_invalidation', domain: 'databases', is_registry_concept: true,
        difficulty_tier: 'advanced', first_encountered: '2026-04-02T00:00:00Z',
        last_reviewed: '2026-04-02T00:00:00Z', review_history: [{ date: '2026-04-02T00:00:00Z', grade: 2 }],
        fsrs_stability: 3.0, fsrs_difficulty: 6.0, documentation_url: 'https://example.com', notes: 'Tricky' },
    ]));
    fs.writeFileSync(path.join(sourceDir, 'backend.json'), JSON.stringify([
      { concept_id: 'rest_api', domain: 'backend', is_registry_concept: true,
        difficulty_tier: 'foundational', first_encountered: '2026-04-01T00:00:00Z',
        last_reviewed: '2026-04-01T00:00:00Z', review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
        fsrs_stability: 8.0, fsrs_difficulty: 3.0, documentation_url: null, notes: null },
    ]));

    const output = execFileSync('node', [scriptPath, '--source', sourceDir, '--target', targetDir],
      { encoding: 'utf-8', timeout: 5000 });

    assert.ok(fs.existsSync(path.join(targetDir, 'databases', 'redis.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'databases', 'cache_invalidation.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'backend', 'rest_api.md')));
    assert.ok(output.includes('3 concept'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/migrate-v2.test.js
```

Expected: FAIL (script doesn't exist yet).

- [ ] **Step 3: Implement migrate-v2.js**

Create `scripts/migrate-v2.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeMarkdownFile, parseArgs } = require('./utils.js');

function migrate(sourceDir, targetDir) {
  let totalMigrated = 0;
  let totalSkipped = 0;
  let domainCount = 0;

  let files;
  try {
    files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stdout.write(`Source directory not found: ${sourceDir}\nMigrated 0 concepts across 0 domains.\n`);
      return;
    }
    throw err;
  }

  for (const file of files) {
    const domain = path.basename(file, '.json');
    const profile = readJSON(path.join(sourceDir, file));
    if (!Array.isArray(profile) || profile.length === 0) continue;

    domainCount++;

    for (const entry of profile) {
      const conceptPath = path.join(targetDir, domain, `${entry.concept_id}.md`);

      if (fs.existsSync(conceptPath)) {
        totalSkipped++;
        continue;
      }

      const { notes, ...frontmatterFields } = entry;
      const frontmatter = { ...frontmatterFields };
      delete frontmatter.notes;

      const title = entry.concept_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const body = `\n# ${title}\n\n## Notes\n${notes || 'No notes yet.'}\n`;

      writeMarkdownFile(conceptPath, frontmatter, body);
      totalMigrated++;
    }
  }

  process.stdout.write(
    `Migrated ${totalMigrated} concept${totalMigrated !== 1 ? 's' : ''} across ${domainCount} domain${domainCount !== 1 ? 's' : ''}.`
    + (totalSkipped > 0 ? ` Skipped ${totalSkipped} (already exist).` : '')
    + ' Source directory preserved.\n'
  );
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const required = ['source', 'target'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
    process.stderr.write('Usage: node migrate-v2.js --source PATH --target PATH\n');
    process.exit(1);
  }

  try {
    migrate(args.source, args.target);
  } catch (err) {
    process.stderr.write(`Migration failed: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { migrate };
```

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/migrate-v2.test.js
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-v2.js scripts/test/migrate-v2.test.js
git commit -m "feat: add Phase 1 to Phase 2 profile migration script"
```

---

## Task 5: Phase 1 Compatibility Gate

**CRITICAL: This is a hard gate. Nothing proceeds until this passes.**

**Files:**
- Modify: `skills/professor/SKILL.md`
- Modify: `agents/knowledge-agent.md`
- Modify: `config/default_config.json`

- [ ] **Step 1: Run ALL tests**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests PASS across all files (fsrs, utils, lookup, update, migrate-v2).

- [ ] **Step 2: Update professor SKILL.md profile path**

In `skills/professor/SKILL.md`, replace all occurrences of `~/.claude/professor/profile/` with `~/.claude/professor/concepts/`.

There are two locations:
1. Step 8 (Update Scores): `--profile-dir ~/.claude/professor/profile/` → `--profile-dir ~/.claude/professor/concepts/`
2. If any other `profile/` references exist in the file

- [ ] **Step 3: Update knowledge-agent.md profile path**

In `agents/knowledge-agent.md`, Step 4, replace:
```
--profile-dir ~/.claude/professor/profile/
```
with:
```
--profile-dir ~/.claude/professor/concepts/
```

- [ ] **Step 4: Update default_config.json**

In `config/default_config.json`, change:
```json
"profile_directory": "~/.claude/professor/profile/"
```
to:
```json
"profile_directory": "~/.claude/professor/concepts/"
```

- [ ] **Step 5: Run all tests again**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests still PASS. The config/skill/agent changes are path-only and don't affect script tests.

- [ ] **Step 6: Commit**

```bash
git add skills/professor/SKILL.md agents/knowledge-agent.md config/default_config.json
git commit -m "feat: update profile paths from profile/ to concepts/ for Phase 2 storage"
```

---

## Task 6: Session State Script

**Files:**
- Create: `scripts/session.js`
- Create: `scripts/test/session.test.js`

- [ ] **Step 1: Write tests**

Create `scripts/test/session.test.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir, sessionDir;
const scriptPath = path.resolve(__dirname, '..', 'session.js');

function runSession(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-session-'));
  sessionDir = path.join(tmpDir, 'professor');
  fs.mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('session.js', () => {
  it('creates session with feature name and branch', () => {
    const result = runSession([
      'create',
      '--feature', 'Real-time notifications',
      '--branch', 'feature/notifications',
      '--session-dir', sessionDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.feature, 'Real-time notifications');

    const filePath = path.join(sessionDir, '.session-state.json');
    assert.ok(fs.existsSync(filePath));

    const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.equal(state.feature, 'Real-time notifications');
    assert.equal(state.branch, 'feature/notifications');
    assert.equal(state.version, 1);
    assert.ok(state.started);
    assert.deepEqual(state.concepts_checked, []);
    assert.deepEqual(state.decisions, []);
  });

  it('loads existing session state', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.feature, 'Test');
    assert.equal(result.branch, 'main');
  });

  it('returns exists:false when no session', () => {
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.exists, false);
  });

  it('updates specific fields', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    runSession([
      'update', '--session-dir', sessionDir,
      '--phase', 'design_options',
      '--context-snapshot', 'Discussing Redis pub/sub',
    ]);
    const result = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(result.phase, 'design_options');
    assert.equal(result.context_snapshot, 'Discussing Redis pub/sub');
  });

  it('adds concept and deduplicates', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);

    const r1 = runSession([
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'websocket',
      '--domain', 'networking',
      '--status', 'taught',
      '--grade', '3',
      '--phase', 'requirements',
      '--context', 'Discussing delivery mechanism',
    ]);
    assert.equal(r1.action, 'added');

    // Duplicate — should skip
    const r2 = runSession([
      'add-concept', '--session-dir', sessionDir,
      '--concept-id', 'websocket',
      '--domain', 'networking',
      '--status', 'taught',
      '--grade', '4',
      '--phase', 'design_options',
      '--context', 'Revisiting',
    ]);
    assert.equal(r2.action, 'already_checked');

    const state = runSession(['load', '--session-dir', sessionDir]);
    assert.equal(state.concepts_checked.length, 1);
    assert.equal(state.concepts_checked[0].concept_id, 'websocket');
  });

  it('clears session state', () => {
    runSession([
      'create', '--feature', 'Test', '--branch', 'main', '--session-dir', sessionDir,
    ]);
    const r = runSession(['clear', '--session-dir', sessionDir]);
    assert.equal(r.success, true);

    const filePath = path.join(sessionDir, '.session-state.json');
    assert.ok(!fs.existsSync(filePath));
  });

  it('clear on non-existent session succeeds silently', () => {
    const r = runSession(['clear', '--session-dir', sessionDir]);
    assert.equal(r.success, true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/session.test.js
```

Expected: FAIL (script doesn't exist).

- [ ] **Step 3: Implement session.js**

Create `scripts/session.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, parseArgs } = require('./utils.js');

const SESSION_FILE = '.session-state.json';

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function create(sessionDir, feature, branch) {
  ensureDir(sessionDir);
  const state = {
    version: 1,
    feature,
    branch,
    started: isoNow(),
    last_updated: isoNow(),
    phase: 'context_loading',
    architecture_loaded: false,
    architecture_components_read: [],
    requirements: { functional: [], non_functional: {} },
    concepts_checked: [],
    decisions: [],
    design_options_proposed: [],
    chosen_option: null,
    context_snapshot: null,
  };
  writeJSON(getSessionPath(sessionDir), state);
  return { success: true, feature, branch };
}

function load(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) return { exists: false };
  return state;
}

function update(sessionDir, updates) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to update');

  if (updates.phase) state.phase = updates.phase;
  if (updates.contextSnapshot) state.context_snapshot = updates.contextSnapshot;
  if (updates.chosenOption) state.chosen_option = updates.chosenOption;
  if (updates.architectureLoaded) state.architecture_loaded = updates.architectureLoaded === 'true';
  state.last_updated = isoNow();

  writeJSON(sessionPath, state);
  return { success: true };
}

function addConcept(sessionDir, conceptData) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const existing = state.concepts_checked.find(c => c.concept_id === conceptData.conceptId);
  if (existing) return { action: 'already_checked' };

  state.concepts_checked = [...state.concepts_checked, {
    concept_id: conceptData.conceptId,
    domain: conceptData.domain,
    status: conceptData.status,
    grade: conceptData.grade ? parseInt(conceptData.grade, 10) : null,
    phase: conceptData.phase,
    context: conceptData.context,
  }];
  state.last_updated = isoNow();

  writeJSON(sessionPath, state);
  return { action: 'added' };
}

function clear(sessionDir) {
  const sessionPath = getSessionPath(sessionDir);
  try {
    fs.unlinkSync(sessionPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { success: true };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  try {
    let result;
    switch (mode) {
      case 'create':
        result = create(args['session-dir'], args.feature, args.branch);
        break;
      case 'load':
        result = load(args['session-dir']);
        break;
      case 'update':
        result = update(args['session-dir'], {
          phase: args.phase,
          contextSnapshot: args['context-snapshot'],
          chosenOption: args['chosen-option'],
          architectureLoaded: args['architecture-loaded'],
        });
        break;
      case 'add-concept':
        result = addConcept(args['session-dir'], {
          conceptId: args['concept-id'],
          domain: args.domain,
          status: args.status,
          grade: args.grade,
          phase: args.phase,
          context: args.context,
        });
        break;
      case 'clear':
        result = clear(args['session-dir']);
        break;
      default:
        process.stderr.write(`Unknown mode: ${mode}. Use create, load, update, add-concept, or clear.\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { create, load, update, addConcept, clear };
```

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/session.test.js
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/session.js scripts/test/session.test.js
git commit -m "feat: add session state management script for design conversations"
```

---

## Task 7: Architecture Graph Script

**Files:**
- Create: `scripts/graph.js`
- Create: `scripts/test/graph.test.js`

- [ ] **Step 1: Write tests**

Create `scripts/test/graph.test.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir, archDir;
const scriptPath = path.resolve(__dirname, '..', 'graph.js');

function runGraph(args) {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-graph-'));
  archDir = path.join(tmpDir, 'architecture');
  fs.mkdirSync(archDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('graph.js create-component', () => {
  it('creates a component markdown file', () => {
    const result = runGraph([
      'create-component',
      '--id', 'auth-service',
      '--description', 'Handles JWT-based authentication',
      '--concepts', 'jwt,rbac,hashing',
      '--depends-on', 'api-gateway,user-service',
      '--depended-on-by', 'notification-service',
      '--key-files', 'src/services/auth/,src/middleware/authenticate.ts',
      '--patterns', 'Middleware auth chain, refresh token rotation',
      '--output-dir', path.join(archDir, 'components'),
    ]);
    assert.equal(result.success, true);

    const filePath = path.join(archDir, 'components', 'auth-service.md');
    assert.ok(fs.existsSync(filePath));

    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.includes('# Auth Service'));
    assert.ok(raw.includes('Handles JWT-based authentication'));
    assert.ok(raw.includes('`jwt`'));
    assert.ok(raw.includes('[[api-gateway]]'));
    assert.ok(raw.includes('[[user-service]]'));
    assert.ok(raw.includes('[[notification-service]]'));
    assert.ok(raw.includes('src/services/auth/'));
    assert.ok(raw.includes('Middleware auth chain'));
  });

  it('creates parent directories', () => {
    runGraph([
      'create-component',
      '--id', 'test-service',
      '--description', 'Test',
      '--output-dir', path.join(archDir, 'deep', 'nested', 'components'),
    ]);
    assert.ok(fs.existsSync(path.join(archDir, 'deep', 'nested', 'components', 'test-service.md')));
  });
});

describe('graph.js update-index', () => {
  it('builds index from existing component files', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });

    // Create two component files
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), [
      '# Auth Service', '', '## Description', 'Handles authentication',
      '', '## Concepts Involved', '- `jwt` (security)', '- `rbac` (security)',
    ].join('\n'));
    fs.writeFileSync(path.join(compDir, 'api-gateway.md'), [
      '# API Gateway', '', '## Description', 'Request routing and rate limiting',
      '', '## Concepts Involved', '- `rate_limiting` (backend)',
    ].join('\n'));

    const result = runGraph([
      'update-index',
      '--architecture-dir', archDir,
      '--project-name', 'Test API',
      '--branch', 'main',
      '--summary', 'REST API with auth and gateway',
    ]);
    assert.equal(result.success, true);

    const indexPath = path.join(archDir, '_index.md');
    assert.ok(fs.existsSync(indexPath));

    const raw = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(raw.includes('# Architecture Overview'));
    assert.ok(raw.includes('Test API'));
    assert.ok(raw.includes('main'));
    assert.ok(raw.includes('[[auth-service]]'));
    assert.ok(raw.includes('[[api-gateway]]'));
  });
});

describe('graph.js detect-changes', () => {
  it('detects no changes when scan dirs match components', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), '# Auth Service\n');

    const scanDir = path.join(tmpDir, 'src', 'services', 'auth');
    fs.mkdirSync(scanDir, { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'index.ts'), 'export {};');

    const result = runGraph([
      'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', path.join(tmpDir, 'src'),
    ]);
    assert.equal(result.structural_changes_detected, false);
  });

  it('detects new directories as potential components', () => {
    const compDir = path.join(archDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'auth-service.md'), '# Auth Service\n');

    const scanDir = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(scanDir, 'services', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(scanDir, 'services', 'notifications'), { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'services', 'notifications', 'index.ts'), 'export {};');

    const result = runGraph([
      'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', scanDir,
    ]);
    assert.equal(result.structural_changes_detected, true);
    assert.ok(result.new_directories.length > 0);
  });

  it('handles missing architecture dir gracefully', () => {
    const result = runGraph([
      'detect-changes',
      '--architecture-dir', path.join(tmpDir, 'nonexistent'),
      '--scan-dirs', tmpDir,
    ]);
    assert.equal(result.structural_changes_detected, false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/graph.test.js
```

Expected: FAIL (script doesn't exist).

- [ ] **Step 3: Implement graph.js**

Create `scripts/graph.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, isoNow, parseArgs, listMarkdownFiles } = require('./utils.js');

function createComponent(options) {
  const { id, description, concepts, dependsOn, dependedOnBy,
          keyFiles, patterns, outputDir } = options;

  ensureDir(outputDir);
  const title = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const lines = [`# ${title}`, ''];
  lines.push('## Description', description || '', '');

  if (concepts) {
    lines.push('## Concepts Involved');
    for (const c of concepts.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- \`${c}\``);
    }
    lines.push('');
  }

  if (dependsOn) {
    lines.push('## Depends On');
    for (const dep of dependsOn.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  if (dependedOnBy) {
    lines.push('## Depended On By');
    for (const dep of dependedOnBy.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  if (keyFiles) {
    lines.push('## Key Files');
    for (const f of keyFiles.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (patterns) {
    lines.push('## Patterns');
    for (const p of patterns.split(',').map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  const filePath = path.join(outputDir, `${id}.md`);
  fs.writeFileSync(filePath, lines.join('\n'));

  return { success: true, path: filePath };
}

function updateIndex(architectureDir, projectName, branch, summary) {
  const compDir = path.join(architectureDir, 'components');
  const compFiles = listMarkdownFiles(compDir);

  const components = compFiles.map(file => {
    const id = path.basename(file, '.md');
    const raw = fs.readFileSync(path.join(compDir, file), 'utf-8');

    const descMatch = raw.match(/## Description\n(.+)/);
    const description = descMatch ? descMatch[1].trim() : '';

    const conceptIds = [];
    const conceptSection = raw.match(/## Concepts Involved\n([\s\S]*?)(?=\n## |\n$|$)/);
    if (conceptSection) {
      const matches = conceptSection[1].matchAll(/`([^`]+)`/g);
      for (const m of matches) conceptIds.push(m[1]);
    }

    return { id, description, concepts: conceptIds };
  });

  const lines = [
    '# Architecture Overview', '',
    '## Project', projectName, '',
    '## Branch', branch, '',
    '## Last Updated', isoNow(), '',
    '## Summary', summary || '', '',
    '## Components', '',
    '| Component | Description | Key Concepts |',
    '|-----------|-------------|--------------|',
  ];

  for (const comp of components) {
    const conceptStr = comp.concepts.map(c => `\`${c}\``).join(', ');
    lines.push(`| [[${comp.id}]] | ${comp.description} | ${conceptStr} |`);
  }

  lines.push('');
  const indexPath = path.join(architectureDir, '_index.md');
  fs.writeFileSync(indexPath, lines.join('\n'));

  return { success: true, components: components.length };
}

function detectChanges(architectureDir, scanDirs) {
  const compDir = path.join(architectureDir, 'components');
  const compFiles = listMarkdownFiles(compDir);
  const knownComponents = compFiles.map(f => path.basename(f, '.md'));

  if (knownComponents.length === 0) {
    return { new_directories: [], structural_changes_detected: false, summary: 'No architecture to compare against' };
  }

  const newDirs = [];
  for (const scanDir of scanDirs.split(',').map(s => s.trim()).filter(Boolean)) {
    try {
      const entries = fs.readdirSync(scanDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Recurse one level into service-like directories
        const subPath = path.join(scanDir, entry.name);
        try {
          const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (!sub.isDirectory()) continue;
            const dirName = sub.name;
            const matchesComponent = knownComponents.some(c =>
              c.includes(dirName) || dirName.includes(c.replace(/-/g, ''))
            );
            if (!matchesComponent) {
              newDirs.push(path.join(subPath, dirName));
            }
          }
        } catch { /* ignore unreadable subdirs */ }
      }
    } catch { /* ignore unreadable scan dirs */ }
  }

  const detected = newDirs.length > 0;
  return {
    new_directories: newDirs,
    structural_changes_detected: detected,
    summary: detected
      ? `New director${newDirs.length === 1 ? 'y' : 'ies'}: ${newDirs.join(', ')}`
      : 'No structural changes detected',
  };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  try {
    let result;
    switch (mode) {
      case 'create-component':
        result = createComponent({
          id: args.id,
          description: args.description,
          concepts: args.concepts,
          dependsOn: args['depends-on'],
          dependedOnBy: args['depended-on-by'],
          keyFiles: args['key-files'],
          patterns: args.patterns,
          outputDir: args['output-dir'],
        });
        break;
      case 'update-index':
        result = updateIndex(
          args['architecture-dir'],
          args['project-name'],
          args.branch,
          args.summary,
        );
        break;
      case 'detect-changes':
        result = detectChanges(
          args['architecture-dir'],
          args['scan-dirs'],
        );
        break;
      default:
        process.stderr.write(`Unknown mode: ${mode}. Use create-component, update-index, or detect-changes.\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { createComponent, updateIndex, detectChanges };
```

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/graph.test.js
```

Expected: All PASS.

- [ ] **Step 5: Run all tests**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/graph.js scripts/test/graph.test.js
git commit -m "feat: add architecture graph management script"
```

---

## Task 8: professor-teach Skill

**Files:**
- Create: `skills/professor-teach/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/professor-teach/SKILL.md`:

```markdown
---
name: professor-teach
description: >
  Teach a single technical concept with analogy, example, and recall question.
  Used by other skills when a concept gap is detected during conversation.
  Do not invoke directly — invoked by /backend-architect and similar.
context: fork
agent: general-purpose
user-invocable: false
---

You are the Professor — teaching a single concept. You have been invoked by a design skill that detected a concept gap. Teach it concisely, grade the developer, and return a summary.

## Input

Read from `$ARGUMENTS`:
- First argument: concept ID (e.g., `cache_invalidation`)
- `--context` flag: task context (e.g., "designing a Redis caching layer for a notification API")

## Step 1: Identify the Concept

Parse the concept ID from arguments. Run a registry search to get metadata:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
  --query "{concept_id}" \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
```

If not in registry, proceed as a not-in-registry concept — you'll teach it and `update.js` will create it with `is_registry_concept: false`.

## Step 2: Explain the Concept

Provide all three in under 400 words total:

1. **Concrete analogy** (2-3 sentences) — compare to everyday life
2. **Real-world production example** — how it's used in production systems
3. **Practical use case tied to the task context** — "In your {context}, {concept} means..."

## Step 3: Recall Question

Ask one application question. Require reasoning, not regurgitation:
- "Given what we discussed about {concept}, what would happen if..."
- "Why would you choose X over Y in the context of..."
- "How would this change if {scenario}?"

**Wait for the developer's answer. Do not continue until they respond.**

## Step 4: Grade

Grade on the FSRS scale:
- **Again (1)**: wrong or no understanding
- **Hard (2)**: partially correct, key gap
- **Good (3)**: correct
- **Easy (4)**: precise, fast, deep understanding

## Step 5: Feedback

- Correct: short praise (1 sentence)
- Partial: fill the gap (2-3 sentences)
- Wrong: correction explaining the right answer (2-3 sentences)

## Step 6: Update Score

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{concept_id}" \
  --domain "{domain}" \
  --grade {1-4} \
  --is-registry-concept {true|false} \
  --difficulty-tier "{foundational|intermediate|advanced}" \
  --profile-dir ~/.claude/professor/concepts/ \
  --notes "{one-line task context}"
```

If the script fails, note it but still return the grade.

## Step 7: Return Summary

Your final message (returned to the calling skill) must be concise:

"Taught `{concept_id}` ({domain}). Developer scored {Grade Name} ({1-4}). Key takeaway: {one sentence about what they understood or need to explore further}."

## Rules

- Never write code. Teach concepts, not implementations.
- Keep total teaching under 400 words.
- Always tie examples to the provided task context.
- Grade honestly. Partial credit (Hard) exists. Don't inflate.
- If update script fails, return the grade anyway with a note.
- No unexplained jargon. Define terms inline when first used.
```

- [ ] **Step 2: Commit**

```bash
git add skills/professor-teach/
git commit -m "feat: add lightweight single-concept teaching skill"
```

---

## Task 9: analyze-architecture Skill

**Files:**
- Create: `skills/analyze-architecture/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/analyze-architecture/SKILL.md`:

```markdown
---
name: analyze-architecture
description: >
  Scan the current codebase and produce a high-level architecture graph
  stored as interlinked markdown files. Use when starting a new project
  analysis or when the architecture may have changed significantly.
disable-model-invocation: true
argument-hint: "[--update] [--branch name]"
---

You are an architecture analyst. Scan the current codebase and produce a high-level architecture graph as interlinked markdown files.

## Input

Read `$ARGUMENTS` for flags:
- No flags: full analysis from scratch
- `--update`: refresh existing architecture (re-scan, update changed, preserve unchanged)
- `--branch {name}`: generate a delta file comparing branch against stored base architecture

## Step 1: Gather Data (Parallel Subagents)

Dispatch two Explore subagents in parallel:

**File Scanner Agent:**
> Scan the codebase at the current working directory. Exclude: node_modules, .git, dist, build, coverage, __pycache__, .next, .nuxt, vendor.
>
> Return:
> 1. Directory tree (top 3 levels)
> 2. Contents of package manifests (package.json, requirements.txt, go.mod, Cargo.toml, etc.)
> 3. Contents of config files (docker-compose.yml, Dockerfile, tsconfig.json, etc.)
> 4. Contents of key entry points (src/index.ts, main.py, app.py, cmd/main.go, etc.)

**Dependency Analyzer Agent:**
> Analyze the codebase at the current working directory.
>
> Return:
> 1. All dependencies from package manifests (with versions)
> 2. Import patterns in entry points and key source files
> 3. External services referenced in config (database URLs, API endpoints, queue configs)
> 4. Framework identification (Express, FastAPI, Spring Boot, etc.)

## Step 2: Synthesize Architecture

Using both agents' results:

1. **Identify components** from directory structure + entry points. A component is a logical unit (service, module, library) with a clear responsibility. Read 3-5 files per candidate component to confirm.

2. **Determine relationships** from imports, config references, and shared data stores.

3. **Map concepts** to components based on tech stack and patterns. Use concept IDs from the registry where possible:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
     --query "{technology or pattern}" \
     --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
     --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
   ```

4. **Ask the developer when uncertain.** If architecture is ambiguous (monolith vs microservices, unclear component boundaries), ask rather than guess.

## Step 3: Write Architecture Files

For each component, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js create-component \
  --id "{component-id}" \
  --description "{1-2 line description}" \
  --concepts "{comma-separated concept_ids}" \
  --depends-on "{comma-separated component-ids}" \
  --depended-on-by "{comma-separated component-ids}" \
  --key-files "{comma-separated paths}" \
  --patterns "{comma-separated patterns}" \
  --output-dir docs/professor/architecture/components/
```

Then generate the index:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js update-index \
  --architecture-dir docs/professor/architecture/ \
  --project-name "{project name}" \
  --branch "{current branch}" \
  --summary "{2-3 sentence description}"
```

## Step 4: Write Supporting Files

**data-flow.md** — Create `docs/professor/architecture/data-flow.md` with Mermaid diagrams:
- Component dependency graph (graph LR)
- Key request flow sequence diagrams (sequenceDiagram) for 2-3 critical paths

**tech-stack.md** — Create `docs/professor/architecture/tech-stack.md` with:
- Runtime, framework, data stores, infrastructure
- Key dependencies table (package, version, purpose)

## Step 5: Handle Modes

**`--update` mode:**
1. Read existing `_index.md` and component files
2. Run `detect-changes` to find new directories:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js detect-changes \
     --architecture-dir docs/professor/architecture/ \
     --scan-dirs "src/,lib/,services/,cmd/,pkg/"
   ```
3. For new directories: analyze and create component files
4. For existing components: re-read key files, update if description or dependencies changed
5. Regenerate `_index.md`

**`--branch {name}` mode:**
1. Read the base architecture from `docs/professor/architecture/`
2. Compare against current branch state
3. Write delta to `docs/professor/branch-deltas/{branch-name}/delta.md`
4. Delta includes: new components, modified components, new dependencies, structural changes

## Accuracy Rules

- Package manifests are **ground truth** for tech stack. If `package.json` lists `express`, the project uses Express.
- Config files are **ground truth** for infrastructure. If `docker-compose.yml` lists `postgres`, the project uses PostgreSQL.
- Directory structure is **evidence, not proof.** Read files inside to confirm.
- Read 3-5 files per component to understand patterns. Not every file.
- **Ask the developer when uncertain.** Don't guess at ambiguous architecture.

## Output Summary

After writing all files, summarize:
- Number of components identified
- Tech stack highlights
- Any areas of uncertainty flagged
- Suggest reviewing the generated files and correcting any inaccuracies
```

- [ ] **Step 2: Commit**

```bash
git add skills/analyze-architecture/
git commit -m "feat: add architecture analysis skill with multi-file graph output"
```

---

## Task 10: detect-changes Hook Script

**Files:**
- Create: `scripts/detect-changes.js`

- [ ] **Step 1: Implement the hook script**

Create `scripts/detect-changes.js`:

```javascript
'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('./utils.js');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const architecturePath = args['architecture-path'];

  // Read hook input from stdin
  let input;
  try {
    input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    // No stdin or invalid JSON — not a hook invocation, exit silently
    process.exit(0);
  }

  const command = input?.tool_input?.command || '';

  // Check if this is a relevant git operation
  const gitPatterns = [
    /^git\s+push\b/,
    /^git\s+pull\b/,
    /^git\s+fetch\b/,
    /^git\s+merge\b/,
    /^gh\s+pr\s+merge\b/,
  ];

  const isGitOp = gitPatterns.some(p => p.test(command.trim()));
  if (!isGitOp) process.exit(0);

  // Check if architecture doc exists
  if (!architecturePath || !fs.existsSync(architecturePath)) {
    process.exit(0);
  }

  // Read the architecture index to find scan directories
  const indexContent = fs.readFileSync(architecturePath, 'utf-8');
  const branchMatch = indexContent.match(/## Branch\n(.+)/);
  const baseBranch = branchMatch ? branchMatch[1].trim() : 'main';

  // Only warn for base branch operations
  const isBaseBranch = command.includes(baseBranch) ||
    command.includes('origin/' + baseBranch) ||
    (!command.includes('origin/') && /^git\s+(pull|fetch|merge)\b/.test(command.trim()));

  if (!isBaseBranch) process.exit(0);

  // Run detect-changes via graph.js
  try {
    const graphScript = require.resolve('./graph.js');
    const archDir = require('node:path').dirname(architecturePath);
    const result = execFileSync('node', [
      graphScript, 'detect-changes',
      '--architecture-dir', archDir,
      '--scan-dirs', 'src/,lib/,services/,cmd/,pkg/',
    ], { encoding: 'utf-8', timeout: 10000 });

    const changes = JSON.parse(result);
    if (changes.structural_changes_detected) {
      process.stderr.write(
        `\nArchitecture may be outdated. ${changes.summary}. ` +
        'Run `/analyze-architecture --update` to refresh.\n'
      );
    }
  } catch {
    // Detection failed — exit silently, never block
  }

  process.exit(0);
}

main();
```

- [ ] **Step 2: Verify with manual tests**

```bash
# Simulate a git push (should attempt detection)
echo '{"tool_input":{"command":"git push origin main"}}' | node scripts/detect-changes.js --architecture-path docs/professor/architecture/_index.md

# Simulate a non-git command (should produce no output)
echo '{"tool_input":{"command":"npm test"}}' | node scripts/detect-changes.js --architecture-path docs/professor/architecture/_index.md
```

Both should exit 0. The first may print a warning if architecture files exist.

- [ ] **Step 3: Commit**

```bash
git add scripts/detect-changes.js
git commit -m "feat: add structural change detection for architecture hook"
```

---

## Task 11: backend-architect Skill

**Files:**
- Create: `skills/backend-architect/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/backend-architect/SKILL.md`:

```markdown
---
name: backend-architect
description: >
  Backend system design conversation with integrated concept teaching.
  Debates requirements, proposes designs, challenges assumptions, and
  teaches concepts when understanding gaps are detected. Produces a
  high-level design document. Use when planning a new backend feature.
disable-model-invocation: true
argument-hint: "[feature description] [--continue]"
---

You are a senior backend systems architect specializing in API design, database architecture, service communication, caching, authentication, background processing, and operational concerns. Never write code. Design systems, teach concepts, produce design documents.

When discussing architectural concerns, always name the specific technical patterns or concepts involved. Don't say "your database might struggle" — say "you'd need connection pooling and query optimization to handle this load." This ensures each concept can be checked against the developer's knowledge profile.

## Input

Read `$ARGUMENTS`:
- Feature description (free text)
- `--continue`: resume an interrupted session

## Resume Flow

If `--continue` is present:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js load --session-dir docs/professor/
```

If the result has session data (not `{"exists": false}`):
- Summarize: "We were designing {feature}. We've covered {phase}. The discussion was about {context_snapshot}."
- Skip to the recorded phase
- Previously checked concepts (in `concepts_checked`) are not re-checked

If no session exists, tell the developer and ask for a feature description.

## Phase 1: Context Loading

Check for architecture documentation:

```bash
ls docs/professor/architecture/_index.md 2>/dev/null
```

**If architecture doc exists:**
- Read `docs/professor/architecture/_index.md`
- Read relevant component files from `docs/professor/architecture/components/` based on the feature description

**If no architecture doc:**
- Do a lightweight codebase scan: read package manifest (package.json, requirements.txt, etc.), scan top-level directory structure, read 2-3 entry point files
- Tell the developer: "I don't have an architecture doc for this project. I've done a quick scan to understand the basics. For a more comprehensive analysis, you can run `/analyze-architecture` after this session."
- Continue with what you found + developer input

Create the session:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js create \
  --feature "{feature description}" \
  --branch "$(git branch --show-current)" \
  --session-dir docs/professor/
```

## Phase 2: Requirements Clarification

Ask clarifying questions one at a time. Prefer multiple-choice when possible.

Focus on: purpose, constraints, success criteria, scale requirements, timeline.

After each requirement is clarified, update session state:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js update \
  --session-dir docs/professor/ \
  --phase "requirements"
```

## Phase 3: Architecture Fit

Analyze how the feature fits the existing system:
- Which components are affected?
- What constraints exist?
- What risks has the developer not considered?

Present your analysis. Debate constructively — present your opinion, challenge assumptions, but accept the developer's reasoning when it's sound.

## Phase 4: Design Options

Propose 2-3 approaches with tradeoffs. Lead with your recommendation.

**Constructive debate pattern:**
1. Present opinion with reasoning
2. Present options within system constraints
3. Challenge if developer's choice has unaddressed risks — be specific ("if Redis goes down during deploy, writes fail silently unless you add a fallback")
4. Accept and record when developer's reasoning is sound

Record decisions:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js update \
  --session-dir docs/professor/ \
  --phase "design_options"
```

## Phase 5: Finalization

Present the complete design section by section. Ask "does this look right?" after each section. Revise based on feedback.

## Phase 6: Write Design Document

Write to `docs/professor/designs/{YYYY-MM-DD}-{2-3-word-shorthand}.md` with this structure:

```
# Design: {Feature Name}

## Date
{ISO timestamp}

## Status
Proposed

## Original Request
{Verbatim developer request}

## Architecture Context
{Current system summary. Which components affected. Constraints.}

## Requirements
### Functional
- {requirement}

### Non-Functional
- Scale: {expected load}
- Latency: {acceptable response time}
- Reliability: {uptime}
- Security: {concerns}

## Design
### Overview
{2-3 paragraph summary}

### Component Changes
- **{component}**: {changes and why}
- **{new component}** (new): {purpose}

### Data Flow
{Mermaid diagram}

### Key Decisions
| Decision | Chosen | Over | Reasoning |
|----------|--------|------|-----------|

### Edge Cases & Failure Modes
- {case}: {handling}

## Probing Instructions
- {weak area}: {what to explain during implementation}
- {strong area}: {proceed without scaffolding}

## Concepts Reviewed
- `{id}`: {status} — {summary}, grade: {1-4}

## Concepts to Explore During Implementation
- `{id}`: {why relevant but not covered}

## Migration & Rollback
- {steps}

## Observability
- {what to monitor, key metrics, alerting}
```

Update all FSRS scores for concepts taught during the session:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{id}" --domain "{domain}" --grade {1-4} \
  --is-registry-concept {true|false} --difficulty-tier "{tier}" \
  --profile-dir ~/.claude/professor/concepts/ \
  --notes "{feature context}"
```

## Phase 7: Cleanup

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js clear --session-dir docs/professor/
```

If the design adds new components, suggest: "The design adds new components. Run `/analyze-architecture --update` to refresh the architecture graph."

## Concept Checking (Throughout ALL Phases)

Whenever you introduce or rely on a technical concept during the conversation:

**1. Check session state first.**
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js load --session-dir docs/professor/
```
If the concept is in `concepts_checked`, reference the earlier discussion. Don't re-check.

**2. Run lookup.**
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
  --query "{concept}" \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
```
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js status \
  --concepts "{concept_id}" \
  --profile-dir ~/.claude/professor/concepts/ \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json
```

Use the `status` field directly. Do not re-implement thresholds.

**3. Act on result:**
- **skip** (known): continue designing, no teaching
- **review** (decaying): quick inline check — "Quick, why do we use X here?" Evaluate answer, record grade
- **teach_new** or **new** (weak/unknown): invoke `/professor-teach {concept_id} --context "{task context}"`. Grade returns from the subagent. Resume design.

**4. Record in session:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js add-concept \
  --session-dir docs/professor/ \
  --concept-id "{id}" --domain "{domain}" \
  --status "{taught|reviewed|known}" --grade {1-4|null} \
  --phase "{current phase}" --context "{brief context}"
```

**5. If lookup fails:** Warn the developer, continue without teaching. Don't block the design conversation.

## Developer Controls

Respect these at any time:
- **"Skip this concept"**: Record as skipped, move on
- **"Stop" / "End session"**: Save scores for concepts covered, write partial design doc, preserve session state for `--continue`

## Rules

- Never write code. Design systems, teach concepts, produce documents.
- One question at a time during requirements.
- Grade honestly when doing inline concept reviews.
- Session state must be updated at every phase transition.
- Accept developer's reasoning when sound. Record why.
- If any script fails, warn and continue. Scripts are secondary to the design conversation.
```

- [ ] **Step 2: Commit**

```bash
git add skills/backend-architect/
git commit -m "feat: add backend system design skill with integrated teaching"
```

---

## Task 12: Integration Testing & Plugin Registration

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Run all automated tests**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests PASS across all files (fsrs, utils, lookup, update, migrate-v2, session, graph).

- [ ] **Step 2: Update plugin.json**

Update `.claude-plugin/plugin.json` to reflect Phase 2:

```json
{
  "name": "claude-professor",
  "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, analyzes project architecture, and conducts system design conversations with integrated teaching.",
  "version": "2.0.0"
}
```

- [ ] **Step 3: Manual integration test — analyze-architecture**

Run on the claude-professor project itself:

```
/analyze-architecture
```

Verify:
- `docs/professor/architecture/_index.md` created with component table
- Component files in `docs/professor/architecture/components/`
- `data-flow.md` has Mermaid diagrams
- `tech-stack.md` reflects Node.js, no external dependencies

- [ ] **Step 4: Manual integration test — backend-architect**

Run a design session:

```
/backend-architect I want to add a concept difficulty auto-adjustment feature that analyzes grade patterns to suggest difficulty tier changes
```

Verify:
- Architecture doc is referenced
- Requirements clarified through questions
- Concept checks happen during conversation (lazy, not upfront)
- Teaching delegation works (professor-teach invoked when gap detected)
- Design document written to `docs/professor/designs/`
- Session state cleaned up after

- [ ] **Step 5: Manual integration test — resume flow**

Start a session and interrupt mid-conversation (say "Stop"):

```
/backend-architect --continue
```

Verify:
- Session state loaded
- Conversation resumes from where it left off
- Previously checked concepts not re-checked

- [ ] **Step 6: Commit plugin update**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: update plugin.json for Phase 2 release"
```

---

## Validation Checklist

After completing all tasks:

- [ ] Profile storage uses markdown with JSON frontmatter (no more JSON arrays)
- [ ] All Phase 1 tests still pass with new storage format
- [ ] `/professor` (MVP) still works unchanged (with updated profile path)
- [ ] `/professor-teach` teaches single concepts in forked context
- [ ] `/analyze-architecture` produces multi-file architecture graph
- [ ] Architecture component files use wiki-links for dependencies, identifiers for concepts
- [ ] `/backend-architect` conducts full design conversation with lazy concept checking
- [ ] Session state tracks progress throughout design conversation
- [ ] Teaching happens during ANY phase (not gated by phase)
- [ ] Duplicate concept checks are skipped within a session
- [ ] Design document is a single file suitable as HLD input to Superpowers
- [ ] `detect-changes.js` provides advisory warnings (never blocks)
- [ ] Architecture tracks base branch; delta generation works for feature branches
- [ ] `migrate-v2.js` converts Phase 1 profiles to Phase 2 format idempotently
