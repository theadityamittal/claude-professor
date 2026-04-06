# claude-professor Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that teaches developers the concepts behind their tasks using spaced repetition, before any code is written.

**Architecture:** Three components with clean boundaries: Professor Skill (teaching conversation), Knowledge Agent (concept identification via subagent), and Node.js Scripts (FSRS math, file I/O). Data flows: User -> Professor -> Agent -> Scripts -> Professor <-> User.

**Tech Stack:** Claude Code plugin system, Node.js (zero dependencies), FSRS-5 spaced repetition algorithm, JSON file storage.

**Spec:** `docs/superpowers/specs/2026-04-06-claude-professor-design.md` and `Instruction.md`

**FSRS Reference Implementation:** https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/model.rs

---

## File Structure

```
claude-professor/
├── .claude-plugin/
│   ├── plugin.json                    # Plugin manifest
│   └── marketplace.json               # Marketplace catalog
├── skills/
│   └── professor/
│       └── SKILL.md                   # Core teaching flow
├── agents/
│   └── knowledge-agent.md             # Solutions architect agent
├── scripts/
│   ├── fsrs.js                        # FSRS-5 algorithm (pure math)
│   ├── utils.js                       # File I/O, date math, arg parsing
│   ├── lookup.js                      # Concept search + mastery status
│   ├── update.js                      # Score writer
│   └── test/
│       ├── fsrs.test.js               # FSRS math tests
│       ├── utils.test.js              # Utility tests
│       ├── lookup.test.js             # Lookup tests
│       └── update.test.js             # Update tests
├── data/
│   ├── domains.json                   # Fixed domain taxonomy
│   ├── concepts_registry.json         # 150-200 starter concepts
│   └── preferred_sources.json         # Documentation URLs
├── config/
│   └── default_config.json            # Default settings
├── Instruction.md                     # Original spec (existing)
├── README.md                          # Public docs (existing)
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-06-claude-professor-design.md  # Validated design (existing)
```

**Runtime data (user's machine, created at first use):**
```
~/.claude/professor/
├── config.json                        # User config overrides
└── profile/
    ├── databases.json                 # Per-domain concept mastery
    ├── backend.json
    └── ...                            # Created as needed
```

---

## Task 1: Scaffolding

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `config/default_config.json`
- Create: `data/domains.json`
- Create: `data/preferred_sources.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p .claude-plugin skills/professor agents scripts/test data config
```

- [ ] **Step 2: Write plugin.json**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "claude-professor",
  "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, and produces enriched handoff documents.",
  "version": "1.0.0"
}
```

- [ ] **Step 3: Write marketplace.json**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-professor",
  "owner": {
    "name": "Aditya Mittal"
  },
  "plugins": [
    {
      "name": "claude-professor",
      "source": ".",
      "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, and produces enriched handoff documents."
    }
  ]
}
```

- [ ] **Step 4: Write default_config.json**

Create `config/default_config.json`:

```json
{
  "web_search_enabled": false,
  "preferred_sources": [],
  "handoff_directory": "docs/professor/",
  "profile_directory": "~/.claude/professor/profile/"
}
```

- [ ] **Step 5: Write domains.json**

Create `data/domains.json`:

```json
[
  {"id": "algorithms", "parent": null},
  {"id": "data_structures", "parent": null},
  {"id": "databases", "parent": null},
  {"id": "networking", "parent": null},
  {"id": "security", "parent": null},
  {"id": "cloud_infrastructure", "parent": null},
  {"id": "devops", "parent": null},
  {"id": "frontend", "parent": null},
  {"id": "backend", "parent": null},
  {"id": "ml_ai", "parent": null},
  {"id": "systems", "parent": null},
  {"id": "architecture", "parent": null},
  {"id": "testing", "parent": null},
  {"id": "concurrency", "parent": null},
  {"id": "languages", "parent": null},
  {"id": "tools", "parent": null},
  {"id": "custom", "parent": null}
]
```

- [ ] **Step 6: Write preferred_sources.json**

Create `data/preferred_sources.json`:

```json
[
  "docs.python.org",
  "developer.mozilla.org",
  "docs.aws.amazon.com",
  "cloud.google.com/docs",
  "learn.microsoft.com",
  "pytorch.org/docs",
  "tensorflow.org/api_docs",
  "docs.docker.com",
  "kubernetes.io/docs",
  "www.terraform.io/docs",
  "react.dev",
  "nextjs.org/docs",
  "docs.djangoproject.com",
  "docs.sqlalchemy.org",
  "redis.io/docs"
]
```

- [ ] **Step 7: Verify plugin loads**

```bash
claude plugin validate .
```

Expected: No errors. Plugin structure recognized.

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin/ config/ data/ skills/ agents/ scripts/
git commit -m "feat: scaffold plugin directory structure and static data files"
```

---

## Task 2: FSRS Module (fsrs.js)

**Files:**
- Create: `scripts/fsrs.js`
- Create: `scripts/test/fsrs.test.js`

### Formulas Reference (from fsrs-rs source)

```
DECAY = -0.5
FACTOR = 0.9^(1/DECAY) - 1 = 19/81

Retrievability:       R = (1 + FACTOR * t/S)^DECAY
Initial stability:    S0 = w[G-1]
Initial difficulty:   D0 = w4 - exp(w5 * (G-1)) + 1   (clamped 1-10)
Next difficulty:      deltaD = -w6 * (G-3)
                      D' = D + (10-D) * deltaD / 9
                      D_new = w7 * (D0(4) - D') + D'   (clamped 1-10)
Stability (success):  SInc = 1 + hard * easy * e^w8 * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1)
                      S' = S * SInc
Stability (lapse):    S' = min(w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R)), S)
```

- [ ] **Step 1: Write failing tests for all FSRS functions**

Create `scripts/test/fsrs.test.js`:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRetrievability,
  computeNewStability,
  computeNewDifficulty,
  determineAction,
  getInitialStability,
  getInitialDifficulty,
  GRADES,
} = require('../fsrs.js');

describe('FSRS constants', () => {
  it('exports grade constants', () => {
    assert.equal(GRADES.AGAIN, 1);
    assert.equal(GRADES.HARD, 2);
    assert.equal(GRADES.GOOD, 3);
    assert.equal(GRADES.EASY, 4);
  });
});

describe('computeRetrievability', () => {
  it('returns 0.9 when elapsed days equals stability', () => {
    const r = computeRetrievability(10, 10);
    assert.ok(Math.abs(r - 0.9) < 0.001, `Expected ~0.9, got ${r}`);
  });

  it('returns 1.0 when elapsed days is 0', () => {
    const r = computeRetrievability(10, 0);
    assert.ok(Math.abs(r - 1.0) < 0.001, `Expected ~1.0, got ${r}`);
  });

  it('returns value between 0 and 1 for positive elapsed days', () => {
    const r = computeRetrievability(5, 20);
    assert.ok(r > 0 && r < 1, `Expected 0 < r < 1, got ${r}`);
  });

  it('decreases as elapsed days increase', () => {
    const r1 = computeRetrievability(10, 5);
    const r2 = computeRetrievability(10, 15);
    assert.ok(r1 > r2, `Expected r1 > r2, got ${r1} <= ${r2}`);
  });

  it('is higher for greater stability at same elapsed time', () => {
    const r1 = computeRetrievability(20, 10);
    const r2 = computeRetrievability(5, 10);
    assert.ok(r1 > r2, `Expected r1 > r2, got ${r1} <= ${r2}`);
  });
});

describe('getInitialStability', () => {
  it('returns w0 for Again', () => {
    const s = getInitialStability(GRADES.AGAIN);
    assert.ok(Math.abs(s - 0.212) < 0.001);
  });

  it('returns w1 for Hard', () => {
    const s = getInitialStability(GRADES.HARD);
    assert.ok(Math.abs(s - 1.2931) < 0.001);
  });

  it('returns w2 for Good', () => {
    const s = getInitialStability(GRADES.GOOD);
    assert.ok(Math.abs(s - 2.3065) < 0.001);
  });

  it('returns w3 for Easy', () => {
    const s = getInitialStability(GRADES.EASY);
    assert.ok(Math.abs(s - 8.2956) < 0.001);
  });

  it('increases with better grades', () => {
    const s1 = getInitialStability(GRADES.AGAIN);
    const s2 = getInitialStability(GRADES.HARD);
    const s3 = getInitialStability(GRADES.GOOD);
    const s4 = getInitialStability(GRADES.EASY);
    assert.ok(s1 < s2 && s2 < s3 && s3 < s4);
  });
});

describe('getInitialDifficulty', () => {
  it('returns highest difficulty for Again', () => {
    const d = getInitialDifficulty(GRADES.AGAIN);
    assert.ok(d > 5, `Expected > 5, got ${d}`);
  });

  it('returns lowest difficulty for Easy', () => {
    const d = getInitialDifficulty(GRADES.EASY);
    assert.ok(d >= 1, `Expected >= 1, got ${d}`);
  });

  it('is clamped between 1 and 10', () => {
    for (const g of [1, 2, 3, 4]) {
      const d = getInitialDifficulty(g);
      assert.ok(d >= 1 && d <= 10, `Grade ${g}: expected 1-10, got ${d}`);
    }
  });

  it('decreases with better grades', () => {
    const d1 = getInitialDifficulty(GRADES.AGAIN);
    const d2 = getInitialDifficulty(GRADES.HARD);
    const d3 = getInitialDifficulty(GRADES.GOOD);
    assert.ok(d1 > d2 && d2 > d3, `Expected d1 > d2 > d3, got ${d1}, ${d2}, ${d3}`);
  });
});

describe('computeNewDifficulty', () => {
  it('increases difficulty on Again', () => {
    const d = computeNewDifficulty(5.0, GRADES.AGAIN);
    assert.ok(d > 5.0, `Expected > 5.0, got ${d}`);
  });

  it('does not change difficulty on Good', () => {
    const d = computeNewDifficulty(5.0, GRADES.GOOD);
    assert.ok(Math.abs(d - 5.0) < 0.1, `Expected ~5.0, got ${d}`);
  });

  it('decreases difficulty on Easy', () => {
    const d = computeNewDifficulty(5.0, GRADES.EASY);
    assert.ok(d < 5.0, `Expected < 5.0, got ${d}`);
  });

  it('is always clamped between 1 and 10', () => {
    const d1 = computeNewDifficulty(1.0, GRADES.EASY);
    const d2 = computeNewDifficulty(10.0, GRADES.AGAIN);
    assert.ok(d1 >= 1 && d1 <= 10, `Expected 1-10, got ${d1}`);
    assert.ok(d2 >= 1 && d2 <= 10, `Expected 1-10, got ${d2}`);
  });

  it('dampens changes near boundary', () => {
    const change_mid = computeNewDifficulty(5.0, GRADES.AGAIN) - 5.0;
    const change_high = computeNewDifficulty(9.0, GRADES.AGAIN) - 9.0;
    assert.ok(change_mid > change_high,
      `Expected larger change at D=5 than D=9, got ${change_mid} vs ${change_high}`);
  });
});

describe('computeNewStability', () => {
  it('increases stability on Good', () => {
    const s = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    assert.ok(s > 5.0, `Expected > 5.0, got ${s}`);
  });

  it('increases stability on Hard (Hard is a passing grade)', () => {
    const s = computeNewStability(5.0, 5.0, GRADES.HARD, 0.5);
    assert.ok(s > 5.0, `Expected > 5.0, got ${s}`);
  });

  it('gives larger increase for Easy than Good', () => {
    const sGood = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    const sEasy = computeNewStability(5.0, 5.0, GRADES.EASY, 0.5);
    assert.ok(sEasy > sGood, `Expected Easy > Good, got ${sEasy} vs ${sGood}`);
  });

  it('gives smaller increase for Hard than Good', () => {
    const sHard = computeNewStability(5.0, 5.0, GRADES.HARD, 0.5);
    const sGood = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    assert.ok(sHard < sGood, `Expected Hard < Good, got ${sHard} vs ${sGood}`);
  });

  it('decreases stability on Again (lapse)', () => {
    const s = computeNewStability(10.0, 5.0, GRADES.AGAIN, 0.5);
    assert.ok(s < 10.0, `Expected < 10.0 (lapse), got ${s}`);
  });

  it('never increases stability on lapse', () => {
    const s = computeNewStability(1.0, 5.0, GRADES.AGAIN, 0.9);
    assert.ok(s <= 1.0, `Expected <= 1.0 on lapse, got ${s}`);
  });

  it('gives larger increase at low retrievability (desirable difficulty)', () => {
    const sLowR = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.3);
    const sHighR = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.8);
    assert.ok(sLowR > sHighR,
      `Expected larger increase at low R, got ${sLowR} vs ${sHighR}`);
  });
});

describe('determineAction', () => {
  it('returns teach_new for R < 0.3', () => {
    assert.equal(determineAction(0.0), 'teach_new');
    assert.equal(determineAction(0.29), 'teach_new');
  });

  it('returns review for 0.3 <= R <= 0.7', () => {
    assert.equal(determineAction(0.3), 'review');
    assert.equal(determineAction(0.5), 'review');
    assert.equal(determineAction(0.7), 'review');
  });

  it('returns skip for R > 0.7', () => {
    assert.equal(determineAction(0.71), 'skip');
    assert.equal(determineAction(1.0), 'skip');
  });

  it('returns teach_new for null (new concept)', () => {
    assert.equal(determineAction(null), 'teach_new');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/fsrs.test.js
```

Expected: All tests FAIL with "Cannot find module '../fsrs.js'"

- [ ] **Step 3: Implement fsrs.js**

Create `scripts/fsrs.js`:

```javascript
'use strict';

const GRADES = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
});

// FSRS-5 default parameters (from fsrs-rs)
const W = Object.freeze([
  0.212,    // w0:  initial stability for Again
  1.2931,   // w1:  initial stability for Hard
  2.3065,   // w2:  initial stability for Good
  8.2956,   // w3:  initial stability for Easy
  6.4133,   // w4:  initial difficulty offset
  0.8334,   // w5:  initial difficulty exponential factor
  3.0194,   // w6:  delta difficulty scaling
  0.001,    // w7:  mean reversion coefficient
  1.8722,   // w8:  SInc overall scale: e^w8
  0.1666,   // w9:  SInc stability decay: S^(-w9)
  0.796,    // w10: SInc retrievability: e^(w10*(1-R))
  1.4835,   // w11: lapse overall scale
  0.0614,   // w12: lapse difficulty exponent
  0.2629,   // w13: lapse stability exponent
  1.6483,   // w14: lapse retrievability factor
  0.6014,   // w15: hard penalty (< 1)
  1.8729,   // w16: easy bonus (> 1)
  0.5425,   // w17: short-term stability factor
  0.0912,   // w18: short-term stability exponent
]);

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81

const D_MIN = 1;
const D_MAX = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute retrievability (probability of recall).
 * R = (1 + FACTOR * t / S) ^ DECAY
 * When t = S, R = 0.9 (90%).
 */
function computeRetrievability(stability, elapsedDays) {
  if (elapsedDays <= 0) return 1.0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * Get initial stability for a first-encounter grade.
 * S0 = w[G - 1]
 */
function getInitialStability(grade) {
  return W[grade - 1];
}

/**
 * Get initial difficulty for a first-encounter grade.
 * D0 = w4 - exp(w5 * (G - 1)) + 1  (from fsrs-rs init_difficulty)
 */
function getInitialDifficulty(grade) {
  const d = W[4] - Math.exp(W[5] * (grade - 1)) + 1;
  return clamp(d, D_MIN, D_MAX);
}

/**
 * Compute new difficulty after a review.
 * Uses linear damping + mean reversion from fsrs-rs.
 */
function computeNewDifficulty(oldDifficulty, grade) {
  const deltaD = -W[6] * (grade - 3);
  const linearDamping = (10 - oldDifficulty) * deltaD / 9;
  const newD = oldDifficulty + linearDamping;

  // Mean reversion toward init_difficulty(4)
  const initD4 = getInitialDifficulty(GRADES.EASY);
  const meanReverted = W[7] * (initD4 - newD) + newD;

  return clamp(meanReverted, D_MIN, D_MAX);
}

/**
 * Compute new stability after a review.
 * Handles both success (G >= 2) and lapse (G == 1).
 */
function computeNewStability(oldStability, difficulty, grade, retrievability) {
  if (grade === GRADES.AGAIN) {
    // Lapse formula: S' = min(w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R)), S)
    const lapseS = W[11]
      * Math.pow(difficulty, -W[12])
      * (Math.pow(oldStability + 1, W[13]) - 1)
      * Math.exp(W[14] * (1 - retrievability));
    return Math.min(lapseS, oldStability);
  }

  // Success formula: S' = S * SInc
  const hardPenalty = (grade === GRADES.HARD) ? W[15] : 1.0;
  const easyBonus = (grade === GRADES.EASY) ? W[16] : 1.0;

  const sInc = 1
    + hardPenalty
    * easyBonus
    * Math.exp(W[8])
    * (11 - difficulty)
    * Math.pow(oldStability, -W[9])
    * (Math.exp(W[10] * (1 - retrievability)) - 1);

  return oldStability * sInc;
}

/**
 * Determine teaching action based on retrievability.
 */
function determineAction(retrievability) {
  if (retrievability === null || retrievability === undefined) return 'teach_new';
  if (retrievability < 0.3) return 'teach_new';
  if (retrievability > 0.7) return 'skip';
  return 'review';
}

module.exports = {
  GRADES,
  W,
  DECAY,
  FACTOR,
  computeRetrievability,
  getInitialStability,
  getInitialDifficulty,
  computeNewDifficulty,
  computeNewStability,
  determineAction,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/test/fsrs.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/fsrs.js scripts/test/fsrs.test.js
git commit -m "feat: implement FSRS-5 algorithm module with tests"
```

---

## Task 3: Utilities (utils.js)

**Files:**
- Create: `scripts/utils.js`
- Create: `scripts/test/utils.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/utils.test.js`:

```javascript
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
    const result = readJSON(path.join(tmpDir, 'nope.json'));
    assert.equal(result, null);
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
    assert.ok(raw.includes('\n'), 'Expected pretty-printed output');
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
    assert.ok(Math.abs(d - 5) < 0.01, `Expected ~5, got ${d}`);
  });

  it('returns 0 for same date', () => {
    const d = daysBetween('2026-04-01T12:00:00Z', '2026-04-01T12:00:00Z');
    assert.equal(d, 0);
  });

  it('handles fractional days', () => {
    const d = daysBetween('2026-04-01T00:00:00Z', '2026-04-01T12:00:00Z');
    assert.ok(Math.abs(d - 0.5) < 0.01, `Expected ~0.5, got ${d}`);
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
    const args = parseArgs([]);
    assert.deepEqual(args, {});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/utils.test.js
```

Expected: FAIL with "Cannot find module '../utils.js'"

- [ ] **Step 3: Implement utils.js**

Create `scripts/utils.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

function daysBetween(date1, date2) {
  const ms = new Date(date2).getTime() - new Date(date1).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

module.exports = { readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/test/utils.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/utils.js scripts/test/utils.test.js
git commit -m "feat: implement utility module with tests"
```

---

## Task 4: Lookup Script (lookup.js)

**Files:**
- Create: `scripts/lookup.js`
- Create: `scripts/test/lookup.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/lookup.test.js`:

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

let tmpDir;
let profileDir;
const scriptPath = path.resolve(__dirname, '..', 'lookup.js');
const registryPath = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');
const domainsPath = path.resolve(__dirname, '..', '..', 'data', 'domains.json');

// Minimal test registry for search tests
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

  // Write test registry
  fs.writeFileSync(
    path.join(tmpDir, 'registry.json'),
    JSON.stringify(testRegistry)
  );
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
    assert.ok(ids.includes('redis'), 'Expected redis in results');
    assert.ok(ids.includes('caching_strategies'), 'Expected caching_strategies in results');
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
    // Write a profile with a known concept
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
    fs.writeFileSync(
      path.join(profileDir, 'databases.json'),
      JSON.stringify(profileData)
    );

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/lookup.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement lookup.js**

Create `scripts/lookup.js`:

```javascript
'use strict';

const path = require('node:path');
const { readJSON, ensureDir, parseArgs, daysBetween, isoNow } = require('./utils.js');
const { computeRetrievability, determineAction } = require('./fsrs.js');

function search(registryPath, domainsPath, query) {
  const registry = readJSON(registryPath) || [];
  const domains = readJSON(domainsPath) || [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allDomainIds = domains.map(d => d.id);

  const matchedConcepts = registry.filter(concept => {
    return words.some(word =>
      concept.id.toLowerCase().includes(word) ||
      concept.domain.toLowerCase().includes(word)
    );
  });

  const matchedDomains = [...new Set([
    ...matchedConcepts.map(c => c.domain),
    ...allDomainIds.filter(d => words.some(w => d.includes(w))),
  ])];

  return {
    matched_concepts: matchedConcepts,
    matched_domains: matchedDomains,
    all_domains: allDomainIds,
  };
}

function status(conceptIds, profileDir, domainsPath, registryPath) {
  ensureDir(profileDir);
  const registry = readJSON(registryPath) || [];
  const now = isoNow();

  const concepts = conceptIds.map(conceptId => {
    // Find domain from registry first
    const registryEntry = registry.find(c => c.id === conceptId);
    let domain = registryEntry ? registryEntry.domain : null;

    // If not in registry, scan profile files
    if (!domain) {
      const domains = readJSON(domainsPath) || [];
      for (const d of domains) {
        const profilePath = path.join(profileDir, `${d.id}.json`);
        const profile = readJSON(profilePath);
        if (profile && profile.some(c => c.concept_id === conceptId)) {
          domain = d.id;
          break;
        }
      }
    }

    if (!domain) {
      return {
        concept_id: conceptId,
        domain: null,
        status: 'new',
        retrievability: null,
        stability: null,
        difficulty: null,
        grade_history: [],
        last_reviewed: null,
        days_since_review: null,
        documentation_url: null,
      };
    }

    // Load domain profile
    const profilePath = path.join(profileDir, `${domain}.json`);
    const profile = readJSON(profilePath) || [];
    const entry = profile.find(c => c.concept_id === conceptId);

    if (!entry) {
      return {
        concept_id: conceptId,
        domain,
        status: 'new',
        retrievability: null,
        stability: null,
        difficulty: null,
        grade_history: [],
        last_reviewed: null,
        days_since_review: null,
        documentation_url: null,
      };
    }

    const elapsed = daysBetween(entry.last_reviewed, now);
    const retrievability = computeRetrievability(entry.fsrs_stability, elapsed);
    const action = determineAction(retrievability);

    return {
      concept_id: conceptId,
      domain,
      status: action,
      retrievability: Math.round(retrievability * 1000) / 1000,
      stability: entry.fsrs_stability,
      difficulty: entry.fsrs_difficulty,
      grade_history: entry.review_history.map(r => r.grade),
      last_reviewed: entry.last_reviewed,
      days_since_review: Math.round(elapsed * 10) / 10,
      documentation_url: entry.documentation_url || null,
    };
  });

  return { concepts };
}

// CLI entry point
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const mode = process.argv[2];

  try {
    if (mode === 'search') {
      const result = search(args['registry-path'], args['domains-path'], args.query);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else if (mode === 'status') {
      const conceptIds = args.concepts.split(',').map(s => s.trim());
      const result = status(conceptIds, args['profile-dir'], args['domains-path'], args['registry-path']);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stderr.write(`Unknown mode: ${mode}. Use "search" or "status".\n`);
      process.exit(1);
    }
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { search, status };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/test/lookup.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lookup.js scripts/test/lookup.test.js
git commit -m "feat: implement concept lookup script with search and status modes"
```

---

## Task 5: Update Script (update.js)

**Files:**
- Create: `scripts/update.js`
- Create: `scripts/test/update.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/update.test.js`:

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

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
  profileDir = path.join(tmpDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('update.js', () => {
  it('creates new concept in new domain file', () => {
    const result = runUpdate([
      '--concept', 'cache_aside_pattern',
      '--domain', 'databases',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.success, true);
    assert.equal(result.action, 'created');
    assert.equal(result.concept_id, 'cache_aside_pattern');
    assert.ok(result.new_stability > 0);

    // Verify file was written
    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'databases.json'), 'utf-8'
    ));
    assert.equal(profile.length, 1);
    assert.equal(profile[0].concept_id, 'cache_aside_pattern');
    assert.equal(profile[0].review_history.length, 1);
    assert.equal(profile[0].review_history[0].grade, 3);
  });

  it('updates existing concept with new grade', () => {
    // Create initial entry
    runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);

    // Update with new grade
    const result = runUpdate([
      '--concept', 'redis',
      '--domain', 'databases',
      '--grade', '4',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);
    assert.equal(result.action, 'updated');

    // Verify review_history appended
    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'databases.json'), 'utf-8'
    ));
    assert.equal(profile[0].review_history.length, 2);
    assert.equal(profile[0].review_history[1].grade, 4);
  });

  it('uses initial stability for first encounter', () => {
    const result = runUpdate([
      '--concept', 'test_concept',
      '--domain', 'testing',
      '--grade', '3',
      '--is-registry-concept', 'false',
      '--difficulty-tier', 'foundational',
      '--profile-dir', profileDir,
    ]);
    // Good (3) should give initial stability of w2 = 2.3065
    assert.ok(Math.abs(result.new_stability - 2.3065) < 0.01,
      `Expected ~2.3065, got ${result.new_stability}`);
  });

  it('lapse never increases stability', () => {
    // Create with good grade (high stability)
    runUpdate([
      '--concept', 'test_lapse',
      '--domain', 'testing',
      '--grade', '4',
      '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);

    const profile1 = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'testing.json'), 'utf-8'
    ));
    const stabilityBefore = profile1[0].fsrs_stability;

    // Lapse
    const result = runUpdate([
      '--concept', 'test_lapse',
      '--domain', 'testing',
      '--grade', '1',
      '--is-registry-concept', 'false',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);
    assert.ok(result.new_stability <= stabilityBefore,
      `Lapse should not increase stability: ${result.new_stability} > ${stabilityBefore}`);
  });

  it('preserves documentation_url and notes', () => {
    runUpdate([
      '--concept', 'noted',
      '--domain', 'backend',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
      '--documentation-url', 'https://example.com/docs',
      '--notes', 'Test note',
    ]);

    // Update without url/notes — should preserve
    runUpdate([
      '--concept', 'noted',
      '--domain', 'backend',
      '--grade', '3',
      '--is-registry-concept', 'true',
      '--difficulty-tier', 'intermediate',
      '--profile-dir', profileDir,
    ]);

    const profile = JSON.parse(fs.readFileSync(
      path.join(profileDir, 'backend.json'), 'utf-8'
    ));
    assert.equal(profile[0].documentation_url, 'https://example.com/docs');
    assert.equal(profile[0].notes, 'Test note');
  });

  it('exits with code 1 on missing required args', () => {
    assert.throws(() => {
      execFileSync('node', [scriptPath, '--concept', 'test'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
    }, (err) => err.status === 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/update.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement update.js**

Create `scripts/update.js`:

```javascript
'use strict';

const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs } = require('./utils.js');
const {
  computeNewStability,
  computeNewDifficulty,
  computeRetrievability,
  getInitialStability,
  getInitialDifficulty,
} = require('./fsrs.js');

function update(options) {
  const {
    concept,
    domain,
    grade,
    isRegistryConcept,
    difficultyTier,
    profileDir,
    documentationUrl,
    notes,
  } = options;

  ensureDir(profileDir);
  const filePath = path.join(profileDir, `${domain}.json`);
  const profile = readJSON(filePath) || [];
  const gradeNum = parseInt(grade, 10);
  const now = isoNow();

  const existingIdx = profile.findIndex(c => c.concept_id === concept);

  if (existingIdx === -1) {
    // New concept — use initial values
    const newStability = getInitialStability(gradeNum);
    const newDifficulty = getInitialDifficulty(gradeNum);

    const entry = {
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
      notes: notes || null,
    };

    profile.push(entry);
    writeJSON(filePath, profile);

    return {
      success: true,
      concept_id: concept,
      domain,
      new_stability: Math.round(newStability * 10000) / 10000,
      new_difficulty: Math.round(newDifficulty * 1000) / 1000,
      action: 'created',
    };
  }

  // Existing concept — compute FSRS updates
  const entry = profile[existingIdx];
  const elapsed = daysBetween(entry.last_reviewed, now);
  const retrievability = computeRetrievability(entry.fsrs_stability, Math.max(elapsed, 0.001));

  const newStability = computeNewStability(
    entry.fsrs_stability,
    entry.fsrs_difficulty,
    gradeNum,
    retrievability
  );
  const newDifficulty = computeNewDifficulty(entry.fsrs_difficulty, gradeNum);

  entry.last_reviewed = now;
  entry.review_history.push({ date: now, grade: gradeNum });
  entry.fsrs_stability = Math.round(newStability * 10000) / 10000;
  entry.fsrs_difficulty = Math.round(newDifficulty * 1000) / 1000;

  // Only overwrite url/notes if provided
  if (documentationUrl) entry.documentation_url = documentationUrl;
  if (notes) entry.notes = notes;

  profile[existingIdx] = entry;
  writeJSON(filePath, profile);

  return {
    success: true,
    concept_id: concept,
    domain,
    new_stability: entry.fsrs_stability,
    new_difficulty: entry.fsrs_difficulty,
    action: 'updated',
  };
}

// CLI entry point
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  const required = ['concept', 'domain', 'grade', 'profile-dir'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
    process.stderr.write('Usage: node update.js --concept ID --domain DOMAIN --grade 1-4 --profile-dir PATH\n');
    process.exit(1);
  }

  try {
    const result = update({
      concept: args.concept,
      domain: args.domain,
      grade: args.grade,
      isRegistryConcept: args['is-registry-concept'] || 'false',
      difficultyTier: args['difficulty-tier'] || 'intermediate',
      profileDir: args['profile-dir'],
      documentationUrl: args['documentation-url'],
      notes: args.notes,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { update };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test scripts/test/update.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Run all script tests together**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests across all 4 files PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/update.js scripts/test/update.test.js
git commit -m "feat: implement score update script with FSRS computation"
```

---

## Task 6: Concept Registry

**Files:**
- Create: `data/concepts_registry.json`

This is a content generation task. Generate concepts domain-by-domain using Claude, then validate.

- [ ] **Step 1: Generate concepts for each domain**

Generate 150-200 concepts across all 17 domains. Target distribution weighted toward high-usage domains:

| Domain | Target Count | Priority |
|--------|-------------|----------|
| databases | 15-20 | High |
| backend | 15-20 | High |
| algorithms | 10-15 | High |
| cloud_infrastructure | 10-15 | High |
| security | 10-15 | High |
| architecture | 10-15 | High |
| frontend | 10-12 | Medium |
| networking | 8-10 | Medium |
| concurrency | 8-10 | Medium |
| data_structures | 8-10 | Medium |
| ml_ai | 8-10 | Medium |
| devops | 8-10 | Medium |
| testing | 6-8 | Medium |
| systems | 6-8 | Low |
| languages | 5-7 | Low |
| tools | 5-7 | Low |
| custom | 0 | N/A |

Each concept entry:
```json
{"id": "lowercase_snake_case", "domain": "from_domains_json", "difficulty": "foundational|intermediate|advanced"}
```

Rules:
- `id`: lowercase_snake_case, max 3 words, most canonical/widely-recognized name
- `domain`: must exist in `data/domains.json`
- `difficulty`: foundational (everyone should know), intermediate (mid-level+), advanced (senior/specialist)
- No duplicates
- Append-only (never rename or remove)

Example seed concepts to include:

```json
[
  {"id": "binary_search", "domain": "algorithms", "difficulty": "foundational"},
  {"id": "hash_map", "domain": "data_structures", "difficulty": "foundational"},
  {"id": "connection_pooling", "domain": "databases", "difficulty": "intermediate"},
  {"id": "sql_injection", "domain": "security", "difficulty": "foundational"},
  {"id": "cache_invalidation", "domain": "databases", "difficulty": "advanced"},
  {"id": "dependency_injection", "domain": "architecture", "difficulty": "intermediate"},
  {"id": "event_loop", "domain": "concurrency", "difficulty": "intermediate"},
  {"id": "virtual_dom", "domain": "frontend", "difficulty": "intermediate"},
  {"id": "load_balancing", "domain": "cloud_infrastructure", "difficulty": "intermediate"},
  {"id": "gradient_descent", "domain": "ml_ai", "difficulty": "foundational"}
]
```

Generate the full list domain-by-domain, review each batch, and combine into `data/concepts_registry.json`.

- [ ] **Step 2: Validate the registry**

Write a quick validation script and run it:

```bash
node -e "
const registry = require('./data/concepts_registry.json');
const domains = require('./data/domains.json');
const domainIds = new Set(domains.map(d => d.id));
const ids = new Set();
let errors = 0;

for (const c of registry) {
  if (ids.has(c.id)) { console.error('DUPLICATE: ' + c.id); errors++; }
  ids.add(c.id);
  if (!domainIds.has(c.domain)) { console.error('BAD DOMAIN: ' + c.id + ' -> ' + c.domain); errors++; }
  if (!['foundational','intermediate','advanced'].includes(c.difficulty)) { console.error('BAD DIFFICULTY: ' + c.id); errors++; }
  if (c.id !== c.id.toLowerCase()) { console.error('NOT LOWERCASE: ' + c.id); errors++; }
  if (c.id.split('_').length > 3) { console.error('TOO MANY WORDS: ' + c.id); errors++; }
}
console.log('Total concepts: ' + registry.length);
console.log('Errors: ' + errors);
if (errors > 0) process.exit(1);
"
```

Expected: Total concepts 150-200, Errors: 0.

- [ ] **Step 3: Commit**

```bash
git add data/concepts_registry.json
git commit -m "feat: add concept registry with N starter concepts across 17 domains"
```

---

## Task 7: Knowledge Agent

**Files:**
- Create: `agents/knowledge-agent.md`

- [ ] **Step 1: Write the knowledge agent prompt**

Create `agents/knowledge-agent.md`:

````markdown
---
name: knowledge-agent
description: >
  Solutions architect agent that analyzes development tasks,
  identifies relevant technical concepts from the concept
  registry, and retrieves the developer's mastery status.
  Returns a structured briefing for the professor.
tools: Read, Bash
model: sonnet
---

You are a senior solutions architect and system design expert. Your job is to analyze a development task and identify ALL technical concepts the developer needs to understand — not just the obvious ones, but foundational prerequisites and adjacent concerns.

## Process

When given a task description:

1. **Read the concept registry** at `${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json` and the domain list at `${CLAUDE_PLUGIN_ROOT}/data/domains.json`.

2. **Think like a solutions architect:** What concepts does this task involve? What prerequisite knowledge is assumed? What could go wrong if the developer doesn't understand a particular concept? What adjacent concepts would a senior engineer think about?

3. **Search the registry for matching concepts.** Run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
  --query "{task description}" \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
```
Use the results as candidates, then apply your architectural judgment to select the truly relevant ones and add any the keyword search missed from the full registry.

4. **Get the developer's mastery status** for each identified concept. Run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js status \
  --concepts "{comma-separated concept IDs}" \
  --profile-dir ~/.claude/professor/profile/ \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json
```

5. **For concepts not in the registry**, suggest a new concept with:
   - An ID following the naming convention: `lowercase_snake_case`, max 3 words, most canonical name
   - A domain from the fixed domain list (NEVER invent a new domain — use `custom` if nothing fits)
   - A difficulty tier: `foundational`, `intermediate`, or `advanced`

6. **Cap at 20 concepts total** across all categories. If the task involves more, select the 20 most critical and list the rest in `overflow`. Order concepts within each category by priority (most important first).

7. **Return the briefing** as a JSON block in this exact format:

```json
{
  "task_summary": "Brief architectural summary of the task",
  "domains_involved": ["domain1", "domain2"],
  "concepts": {
    "teach_new": [
      {
        "id": "concept_id",
        "domain": "domain",
        "difficulty": "intermediate",
        "reason": "Why this concept matters for this task"
      }
    ],
    "review": [
      {
        "id": "concept_id",
        "domain": "domain",
        "last_reviewed": "ISO date",
        "retrievability": 0.45,
        "grade_history": [3, 2, 3],
        "reason": "Why reviewing this now is important"
      }
    ],
    "skip": [
      {
        "id": "concept_id",
        "domain": "domain",
        "retrievability": 0.92,
        "reason": "Developer knows this well"
      }
    ],
    "not_in_registry": [
      {
        "suggested_id": "new_concept_id",
        "suggested_domain": "domain",
        "suggested_difficulty": "intermediate",
        "reason": "Why this concept is relevant and isn't in the registry"
      }
    ]
  },
  "overflow": [
    {
      "id": "concept_id",
      "domain": "domain",
      "reason": "Why it's relevant but lower priority"
    }
  ]
}
```

## Constraints

- Only use domains from the domain list. NEVER create new domains.
- Prefer registry concepts. Only suggest new concepts for genuinely novel topics.
- Follow the concept naming convention strictly.
- If the lookup script fails, include the error in your response so the professor can handle it.
- The `overflow` array is empty unless you identified more than 20 concepts.
- `teach_new` and `not_in_registry` concepts count toward the 20-concept cap. `skip` concepts also count (the professor still acknowledges them).
````

- [ ] **Step 2: Verify agent file is valid**

```bash
head -10 agents/knowledge-agent.md
```

Expected: YAML frontmatter with name, description, tools, model fields.

- [ ] **Step 3: Commit**

```bash
git add agents/knowledge-agent.md
git commit -m "feat: add knowledge agent for concept identification"
```

---

## Task 8: Professor Skill

**Files:**
- Create: `skills/professor/SKILL.md`

- [ ] **Step 1: Write the professor skill**

Create `skills/professor/SKILL.md`:

````markdown
---
name: professor
description: >
  Teaching and learning layer for AI-assisted development.
  Identifies concepts in a task, checks developer's knowledge
  using spaced repetition, teaches adaptively, and produces a
  handoff document. Use when the developer wants to understand
  concepts before building.
---

You are a professor. You teach technical concepts in simple terms with concrete analogies, real-world examples, and practical use cases. You never write code. You teach concepts, not implementations.

## Input

The developer has invoked `/professor` with a task description. Your job is to:
1. Make sure they understand the relevant concepts
2. Track their knowledge using spaced repetition
3. Produce a handoff document for their planning/coding tools

## Step 1: Acknowledge the Task

Briefly confirm what the developer wants to build. One sentence.

## Step 2: Spawn Knowledge Agent

Dispatch the `knowledge-agent` subagent with the developer's task description. Wait for the structured briefing JSON.

If the agent fails or the briefing is malformed, tell the developer: "I had trouble analyzing the task. I'll teach based on what I can identify from the description." Then proceed using your own judgment to identify concepts.

## Step 3: Process the Briefing

Parse the briefing into four categories: `teach_new`, `review`, `skip`, `not_in_registry`.

Count the total concepts (excluding overflow). If there are more than 20, something went wrong — use only the first 20.

## Step 4: Teach New Concepts

For each concept in `teach_new` and `not_in_registry` (in the order provided by the agent):

1. **Explain** the concept with:
   - A concrete **analogy** comparing it to everyday life
   - A **real-world example** showing where this is used in production
   - A **practical use case** relevant to the developer's current task

2. **Ask one recall question** that requires the developer to apply what they just learned.
   - NOT "did you understand?" or "does that make sense?"
   - INSTEAD: "Given what we just discussed about X, what would happen if Y?" or "How would X apply in scenario Z?"

3. **Wait** for the developer's answer.

4. **Evaluate** the answer and assign a grade:
   - **Again (1):** Wrong or no understanding demonstrated
   - **Hard (2):** Partially correct, key gaps in the explanation
   - **Good (3):** Correct, reasonable explanation
   - **Easy (4):** Precise, fast, demonstrates deep understanding

5. Give brief feedback: if correct, praise briefly. If partially correct, fill in the gap. If wrong, explain what was missed and give the correct answer.

6. Proceed to the next concept.

## Step 5: Review Decaying Concepts

For each concept in `review`:

1. Present a **flashcard-style question**: "Quick — why do we use X instead of Y?" or "What problem does X solve?"

2. Wait for the answer.

3. Brief evaluation with the same grading scale.

4. Proceed.

## Step 6: Acknowledge Known Concepts

For each concept in `skip`:

One sentence: "We're using [concept] here — you know this well, moving on."

No question. No grade.

## Step 7: MCQ Pop Quiz

After all concepts are covered, run a multiple-choice quiz on every concept from `teach_new`, `review`, and `not_in_registry`.

For each concept:

1. Generate an MCQ with **4 plausible options** plus **"Explain again"** as the 5th option.
   - Make distractors plausible but clearly wrong if you understand the concept.
   - Only one option should be correct.

2. Wait for the developer's selection.

3. If **correct answer** selected: record grade Good (3). Brief confirmation. Next question.

4. If **wrong answer** selected: record grade Again (1). Brief correction explaining why the correct answer is right. Next question.

5. If **"Explain again"** selected: record grade Again (1). Re-explain the concept with a different angle, then ask one inline recall question. Evaluate their answer (this is a teaching moment, not scored). Move to the next MCQ. Maximum one re-explanation per concept.

## Step 8: Update Scores

For each concept that was taught or reviewed (not skipped):

1. Determine the **final grade**: the **lower** of the recall question grade and the MCQ grade.
   - Example: recall=Good(3), MCQ=Again(1) → final=Again(1)
   - If a concept only had one interaction (review concepts), use that grade.

2. Run the update script:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{concept_id}" \
  --domain "{domain}" \
  --grade {1-4} \
  --is-registry-concept {true|false} \
  --difficulty-tier "{foundational|intermediate|advanced}" \
  --profile-dir ~/.claude/professor/profile/ \
  --notes "{brief context about how the concept relates to the current task}"
```

3. If the script fails: warn the developer ("Score tracking hit an error for [concept]. Your learning won't be affected, but this concept may not be tracked correctly.") and continue.

## Step 9: Write Handoff Document

Create a handoff document at `{handoff_directory}/{YYYY-MM-DD}-{2-3-word-shorthand}.md`.

Read the default config to find the handoff directory:
```bash
node -e "const c = require('${CLAUDE_PLUGIN_ROOT}/config/default_config.json'); console.log(c.handoff_directory)"
```

Write the document in this format:

```markdown
# Professor Handoff: {Feature Name}
## Date: {ISO timestamp}

## Original Request
{Verbatim developer request}

## Expanded Implementation Prompt
{Enriched version of the request. Include architectural decisions
made during the teaching conversation, key technical choices
with reasoning, and specific implementation guidance.
This is what downstream tools should use as their primary input.}

## Probing Instructions
{Guidance for downstream planning/implementation tools.
Based on the developer's demonstrated understanding gaps.}

- {Area where developer needs more depth}: {What to show
  examples of, what edge cases to highlight}
- {Area where developer is solid}: {No extra depth needed}

## Concepts Reviewed
- {concept_id}: new — {what was taught, final grade}
- {concept_id}: reviewed — {flashcard result, final grade}
- {concept_id}: known — skipped

## Key Decisions Made
- {Decision}: {Chosen approach} because {reasoning}
```

If any concepts were in the `overflow` list from the briefing, add a section:

```markdown
## Concepts to Explore During Implementation
- {concept_id}: {why it's relevant, explore during planning}
```

## Important Rules

- **Never write code.** You teach concepts, not implementations.
- **Never skip the quiz.** Even if the developer seems confident, the MCQ tests recognition and feeds FSRS.
- **One concept at a time.** Don't batch explanations.
- **Wait for answers.** Never answer your own questions.
- **Be concise.** Analogies and examples should be 2-3 sentences each, not paragraphs.
- **Grade honestly.** Partial credit exists (Hard). Don't inflate to Good just because the developer tried.
````

- [ ] **Step 2: Verify skill file is valid**

```bash
head -10 skills/professor/SKILL.md
```

Expected: YAML frontmatter with name and description.

- [ ] **Step 3: Commit**

```bash
git add skills/professor/SKILL.md
git commit -m "feat: add professor skill with adaptive teaching flow and FSRS grading"
```

---

## Task 9: Integration Testing

**Files:**
- None created (manual testing)

- [ ] **Step 1: Run all automated tests**

```bash
node --test scripts/test/*.test.js
```

Expected: All tests PASS.

- [ ] **Step 2: Validate plugin structure**

```bash
claude plugin validate .
```

Expected: No errors.

- [ ] **Step 3: Install plugin locally**

```bash
claude plugin marketplace add .
claude plugin install claude-professor@claude-professor
```

Expected: Plugin installs without errors.

- [ ] **Step 4: Test the teaching flow**

Run in Claude Code:
```
/professor I want to add Redis caching to my API to handle 10k concurrent users
```

Verify:
- [ ] Knowledge agent spawns and returns a briefing
- [ ] Professor teaches new concepts with analogies, examples, use cases
- [ ] Professor asks recall questions and waits for answers
- [ ] Professor grades answers appropriately
- [ ] MCQ quiz runs at the end
- [ ] Scores are saved to `~/.claude/professor/profile/`
- [ ] Handoff document is written to `docs/professor/`

- [ ] **Step 5: Test profile persistence**

Run a second `/professor` session with a related task:
```
/professor I want to add a message queue for background jobs
```

Verify:
- [ ] Previously learned concepts (e.g., connection_pooling) are now in "skip" or "review" category, not "teach_new"
- [ ] Teaching adapts based on the profile

- [ ] **Step 6: Test error scenarios**

Test graceful degradation:
- [ ] Delete `~/.claude/professor/profile/` directory, run `/professor` — should create it and treat all concepts as new
- [ ] Corrupt a domain JSON file (write invalid JSON), run `/professor` — should warn and fall back to LLM
- [ ] Verify handoff document is always produced regardless of script errors

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: complete Phase 1 integration testing"
```

---

## Validation Checklist

After completing all tasks, verify against the spec:

- [ ] FSRS-5 formulas match fsrs-rs (retrievability, stability success/lapse, difficulty init/update)
- [ ] Grades are discrete 1-4 (Again/Hard/Good/Easy), never continuous
- [ ] All script paths use `${CLAUDE_PLUGIN_ROOT}`
- [ ] Profile data uses `grade` integers in review_history, `fsrs_difficulty` range 1-10
- [ ] Knowledge agent caps at 20 concepts with overflow
- [ ] "Explain again" grades as Again(1), recall after re-explanation is not scored
- [ ] Final grade per concept = lower of recall + MCQ grades
- [ ] No setup/placement-test skill — cold start is by design
- [ ] Handoff document always produced
- [ ] Error handling: exit 1 for data errors, exit 2 for permissions, LLM fallback for script failures
