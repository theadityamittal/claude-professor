const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs } = require('../utils.js');

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
