const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
} = require('../utils.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'professor-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readJSON', () => {
  it('reads and parses a valid JSON file', () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, JSON.stringify({ key: 'value' }));
    const result = readJSON(filePath);
    assert.deepEqual(result, { key: 'value' });
  });
  it('returns null for non-existent file', () => {
    assert.equal(readJSON(path.join(tmpDir, 'nope.json')), null);
  });
  it('throws on malformed JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{ broken json');
    assert.throws(() => readJSON(filePath));
  });
});

describe('writeJSON', () => {
  it('writes pretty-printed JSON', () => {
    const filePath = path.join(tmpDir, 'out.json');
    writeJSON(filePath, { hello: 'world' });
    const raw = fs.readFileSync(filePath, 'utf-8');
    assert.ok(raw.includes('\n'));
    assert.deepEqual(JSON.parse(raw), { hello: 'world' });
  });
  it('creates parent directories if needed', () => {
    const filePath = path.join(tmpDir, 'a', 'b', 'c', 'deep.json');
    writeJSON(filePath, [1, 2, 3]);
    assert.deepEqual(readJSON(filePath), [1, 2, 3]);
  });
});

describe('ensureDir', () => {
  it('creates directory recursively', () => {
    const dirPath = path.join(tmpDir, 'x', 'y', 'z');
    ensureDir(dirPath);
    assert.ok(fs.statSync(dirPath).isDirectory());
  });
  it('does nothing if directory exists', () => {
    ensureDir(tmpDir);
    assert.ok(fs.statSync(tmpDir).isDirectory());
  });
});

describe('isoNow', () => {
  it('returns a valid ISO date string', () => {
    const now = isoNow();
    assert.ok(!isNaN(Date.parse(now)), `Expected valid ISO date, got ${now}`);
  });
});

describe('daysBetween', () => {
  it('computes days between two dates', () => {
    const d = daysBetween('2026-04-01T00:00:00Z', '2026-04-06T00:00:00Z');
    assert.ok(Math.abs(d - 5) < 0.01);
  });
  it('returns 0 for same date', () => {
    assert.equal(daysBetween('2026-04-01T12:00:00Z', '2026-04-01T12:00:00Z'), 0);
  });
  it('handles fractional days', () => {
    const d = daysBetween('2026-04-01T00:00:00Z', '2026-04-01T12:00:00Z');
    assert.ok(Math.abs(d - 0.5) < 0.01);
  });
});

describe('parseArgs', () => {
  it('parses --key value pairs', () => {
    const args = parseArgs(['--name', 'test', '--count', '5']);
    assert.equal(args.name, 'test');
    assert.equal(args.count, '5');
  });
  it('handles flags without values', () => {
    const args = parseArgs(['--verbose', '--name', 'test']);
    assert.equal(args.verbose, true);
    assert.equal(args.name, 'test');
  });
  it('returns empty object for no args', () => {
    assert.deepEqual(parseArgs([]), {});
  });
});

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
