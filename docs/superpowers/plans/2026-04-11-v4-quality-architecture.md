# claude-professor v4.0.0 — Quality Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement v4.0.0 quality architecture — envelope standardization, gate.js, session.js enhancements, idempotency nonce, migration script, SKILL.md template rewrites, and test pyramid.

**Architecture:** Bottom-up: build infrastructure (utils.js envelope, gate.js, session.js, update.js) first, then envelope-wrap remaining scripts, add data migration, build test pyramid, and finally rewrite all consumer skills and agents.

**Tech Stack:** Node.js (node:test, node:assert, node:crypto), shell scripts (existing test infra), JSONL for session logs, JSON for session state, markdown+JSON frontmatter for concept files.

---

### Task 1: Envelope Helpers in utils.js

**Files:**
- Modify: `scripts/utils.js:105-108` (module.exports)
- Create: `tests/unit/test-envelope.js`

- [ ] **Step 1: Write failing tests for envelope helpers**

Create `tests/unit/test-envelope.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { envelope, envelopeError } = require('../../scripts/utils.js');

describe('envelope', () => {
  it('wraps data in ok status', () => {
    const result = envelope({ count: 3 });
    assert.deepStrictEqual(result, { status: 'ok', data: { count: 3 } });
  });

  it('wraps null data', () => {
    const result = envelope(null);
    assert.deepStrictEqual(result, { status: 'ok', data: null });
  });

  it('wraps empty object', () => {
    const result = envelope({});
    assert.deepStrictEqual(result, { status: 'ok', data: {} });
  });

  it('does not include error field', () => {
    const result = envelope({ x: 1 });
    assert.strictEqual('error' in result, false);
  });
});

describe('envelopeError', () => {
  it('wraps fatal error', () => {
    const result = envelopeError('fatal', 'No session state');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'fatal', message: 'No session state' },
    });
  });

  it('wraps blocking error', () => {
    const result = envelopeError('blocking', 'Checkpoint blocked');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'blocking', message: 'Checkpoint blocked' },
    });
  });

  it('wraps warning error', () => {
    const result = envelopeError('warning', 'Subagent failed');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'warning', message: 'Subagent failed' },
    });
  });

  it('does not include data field', () => {
    const result = envelopeError('fatal', 'err');
    assert.strictEqual('data' in result, false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/test-envelope.js`
Expected: FAIL — `envelope` and `envelopeError` are not exported from utils.js

- [ ] **Step 3: Implement envelope helpers**

Add to `scripts/utils.js` before `module.exports`:

```javascript
function envelope(data) {
  return { status: 'ok', data };
}

function envelopeError(level, message) {
  return { status: 'error', error: { level, message } };
}
```

Update `module.exports` in `scripts/utils.js`:

```javascript
module.exports = {
  readJSON, writeJSON, ensureDir, isoNow, daysBetween, parseArgs,
  readMarkdownWithFrontmatter, writeMarkdownFile, listMarkdownFiles, expandHome,
  envelope, envelopeError,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/test-envelope.js`
Expected: All 8 tests PASS

- [ ] **Step 5: Run existing tests to confirm no regression**

Run: `bash tests/cli/test-whiteboard.sh && bash tests/cli/test-analyze-architecture.sh`
Expected: All existing tests PASS (envelope helpers are additive, no changes to existing functions)

- [ ] **Step 6: Commit**

```bash
git add scripts/utils.js tests/unit/test-envelope.js
git commit -m "feat(v4): add envelope and envelopeError helpers to utils.js"
```

---

### Task 2: gate.js — schedule and checkpoint subcommands

**Files:**
- Create: `scripts/gate.js`
- Create: `tests/unit/test-gate.js`

- [ ] **Step 1: Write failing tests for schedule and checkpoint**

Create `tests/unit/test-gate.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function writeSessionState(dir, state) {
  fs.writeFileSync(
    path.join(dir, '.session-state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );
}

function readSessionState(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.session-state.json'), 'utf-8'));
}

function baseState() {
  return {
    version: 2,
    session_id: 'test-session-id',
    feature: 'test',
    branch: 'main',
    started: '2026-04-11T00:00:00.000Z',
    last_updated: '2026-04-11T00:00:00.000Z',
    phase: 'requirements',
    concepts_checked: [],
    teaching_schedule: [],
    checkpoint_history: [],
    circuit_breaker: 'closed',
  };
}

describe('schedule', () => {
  it('adds concepts to empty teaching_schedule', async () => {
    const { schedule } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const concepts = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    const result = schedule(testDir, 1, concepts);

    assert.strictEqual(result.scheduled, 1);
    assert.strictEqual(result.total, 1);

    const state = readSessionState(testDir);
    assert.strictEqual(state.teaching_schedule.length, 1);
    assert.strictEqual(state.teaching_schedule[0].concept_id, 'caching');
  });

  it('appends phase 2 concepts without replacing phase 1', async () => {
    const { schedule } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    writeSessionState(testDir, state);

    const concepts = [
      { concept_id: 'circuit_breaker', domain: 'reliability_observability', status: 'new', step: 'phase2_checkpoint1' },
    ];
    const result = schedule(testDir, 2, concepts);

    assert.strictEqual(result.scheduled, 1);
    assert.strictEqual(result.total, 2);

    const updated = readSessionState(testDir);
    assert.strictEqual(updated.teaching_schedule.length, 2);
    assert.strictEqual(updated.teaching_schedule[0].concept_id, 'caching');
    assert.strictEqual(updated.teaching_schedule[1].concept_id, 'circuit_breaker');
  });
});

describe('checkpoint', () => {
  it('returns passed when all scheduled concepts are in concepts_checked', async () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [
      { concept_id: 'caching', domain: 'databases', status: 'taught', grade: 3 },
    ];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'passed');
    assert.deepStrictEqual(result.missing, []);
  });

  it('returns blocked when scheduled concept is not taught', async () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'blocked');
    assert.deepStrictEqual(result.missing, ['caching']);
  });

  it('returns degraded when circuit breaker is open', async () => {
    const { checkpoint } = require('../../scripts/gate.js');
    const state = baseState();
    state.circuit_breaker = 'open';
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.concepts_checked = [];
    writeSessionState(testDir, state);

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'degraded');
  });

  it('returns passed when no concepts scheduled for step', async () => {
    const { checkpoint } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const result = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(result.result, 'passed');
    assert.deepStrictEqual(result.missing, []);
  });

  it('appends to checkpoint_history', async () => {
    const { checkpoint } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    checkpoint(testDir, 'phase1_checkpoint1');

    const state = readSessionState(testDir);
    assert.strictEqual(state.checkpoint_history.length, 1);
    assert.strictEqual(state.checkpoint_history[0].step, 'phase1_checkpoint1');
    assert.strictEqual(state.checkpoint_history[0].result, 'passed');
    assert.ok(state.checkpoint_history[0].timestamp);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/test-gate.js`
Expected: FAIL — `../../scripts/gate.js` does not exist

- [ ] **Step 3: Implement gate.js schedule and checkpoint**

Create `scripts/gate.js`:

```javascript
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSON, writeJSON, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');

const SESSION_FILE = '.session-state.json';
const LOG_FILE = '.session-log.jsonl';

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function getLogPath(sessionDir) {
  return path.join(sessionDir, LOG_FILE);
}

function schedule(sessionDir, phase, concepts) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const existing = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const updated = [...existing, ...concepts];

  state.teaching_schedule = updated;
  writeJSON(sessionPath, state);

  return { scheduled: concepts.length, total: updated.length };
}

function checkpoint(sessionDir, step) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const schedule = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const checkedIds = new Set(checked.map(c => c.concept_id));

  const assignedToStep = schedule.filter(c => c.step === step);
  const missing = assignedToStep
    .filter(c => !checkedIds.has(c.concept_id))
    .map(c => c.concept_id);

  let result;
  if (state.circuit_breaker === 'open') {
    result = 'degraded';
  } else if (missing.length > 0) {
    result = 'blocked';
  } else {
    result = 'passed';
  }

  const entry = { step, result, timestamp: isoNow() };
  const history = Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [];
  state.checkpoint_history = [...history, entry];
  writeJSON(sessionPath, state);

  return { result, missing };
}

function log(sessionDir, entry) {
  const logPath = getLogPath(sessionDir);
  const line = JSON.stringify({ timestamp: isoNow(), ...entry }) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');

  return { logged: true };
}

function status(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) throw new Error('No active session');

  return {
    schedule: Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [],
    checkpoints: Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [],
    circuit: state.circuit_breaker || 'closed',
  };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function validateArgs(required, usage) {
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(JSON.stringify(envelopeError('blocking', `Missing required arguments: ${missing.join(', ')}`)) + '\n');
      process.stderr.write(`Usage: node gate.js ${usage}\n`);
      process.exit(1);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'schedule': {
        validateArgs(['session-dir', 'phase', 'concepts'], 'schedule --session-dir PATH --phase N --concepts JSON');
        const concepts = JSON.parse(args.concepts);
        result = schedule(args['session-dir'], parseInt(args.phase, 10), concepts);
        break;
      }
      case 'checkpoint':
        validateArgs(['session-dir', 'step'], 'checkpoint --session-dir PATH --step STEP_KEY');
        result = checkpoint(args['session-dir'], args.step);
        break;
      case 'log': {
        validateArgs(['session-dir', 'entry'], 'log --session-dir PATH --entry JSON');
        const entry = JSON.parse(args.entry);
        result = log(args['session-dir'], entry);
        break;
      }
      case 'status':
        validateArgs(['session-dir'], 'status --session-dir PATH');
        result = status(args['session-dir']);
        break;
      default:
        process.stderr.write(JSON.stringify(envelopeError('blocking', `Unknown mode: ${mode}. Use schedule, checkpoint, log, or status.`)) + '\n');
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { schedule, checkpoint, log, status };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/test-gate.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gate.js tests/unit/test-gate.js
git commit -m "feat(v4): add gate.js with schedule and checkpoint subcommands"
```

---

### Task 3: gate.js — log and status subcommands

**Files:**
- Modify: `tests/unit/test-gate.js`
- (No changes to `scripts/gate.js` — already implemented in Task 2)

- [ ] **Step 1: Write failing tests for log and status**

Append to `tests/unit/test-gate.js`:

```javascript
describe('log', () => {
  it('appends JSONL entry to session log file', async () => {
    const { log } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    const entry = { event: 'checkpoint', step: 'phase1_checkpoint1', result: 'passed' };
    const result = log(testDir, entry);

    assert.strictEqual(result.logged, true);

    const logPath = path.join(testDir, '.session-log.jsonl');
    assert.ok(fs.existsSync(logPath));

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.ok(parsed.timestamp);
    assert.strictEqual(parsed.event, 'checkpoint');
    assert.strictEqual(parsed.step, 'phase1_checkpoint1');
  });

  it('appends multiple entries without overwriting', async () => {
    const { log } = require('../../scripts/gate.js');
    writeSessionState(testDir, baseState());

    log(testDir, { event: 'first' });
    log(testDir, { event: 'second' });

    const logPath = path.join(testDir, '.session-log.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[0]).event, 'first');
    assert.strictEqual(JSON.parse(lines[1]).event, 'second');
  });
});

describe('status', () => {
  it('returns schedule, checkpoints, and circuit state', async () => {
    const { status } = require('../../scripts/gate.js');
    const state = baseState();
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    state.checkpoint_history = [
      { step: 'phase1_checkpoint1', result: 'passed', timestamp: '2026-04-11T00:00:00.000Z' },
    ];
    writeSessionState(testDir, state);

    const result = status(testDir);

    assert.strictEqual(result.schedule.length, 1);
    assert.strictEqual(result.checkpoints.length, 1);
    assert.strictEqual(result.circuit, 'closed');
  });

  it('throws when no active session', async () => {
    const { status } = require('../../scripts/gate.js');

    assert.throws(() => status(testDir), /No active session/);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test tests/unit/test-gate.js`
Expected: All 11 tests PASS (log and status were implemented in Task 2, these tests validate them)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/test-gate.js
git commit -m "test(v4): add tests for gate.js log and status subcommands"
```

---

### Task 4: session.js — add session_id, gate.js fields, remove gate, add finish

**Files:**
- Modify: `scripts/session.js`
- Create: `tests/unit/test-finish.js`

- [ ] **Step 1: Write failing tests for finish and session_id**

Create `tests/unit/test-finish.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function readSessionState(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.session-state.json'), 'utf-8'));
}

describe('create with v4 fields', () => {
  it('generates a session_id', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.ok(state.session_id);
    assert.strictEqual(typeof state.session_id, 'string');
    assert.ok(state.session_id.length > 0);
  });

  it('initializes version 2', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.strictEqual(state.version, 2);
  });

  it('initializes gate.js-owned fields', () => {
    const { create } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    assert.deepStrictEqual(state.teaching_schedule, []);
    assert.deepStrictEqual(state.checkpoint_history, []);
    assert.strictEqual(state.circuit_breaker, 'closed');
  });
});

describe('finish', () => {
  it('sets phase to complete and returns verified true with no warnings', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const result = finish(testDir);

    assert.strictEqual(result.verified, true);
    assert.deepStrictEqual(result.warnings, []);

    const state = readSessionState(testDir);
    assert.strictEqual(state.phase, 'complete');
  });

  it('warns when scheduled concepts are not taught', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    // Simulate gate.js writing a schedule directly
    const state = readSessionState(testDir);
    state.teaching_schedule = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ];
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.strictEqual(result.verified, true);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some(w => w.includes('1 concepts scheduled but not taught')));
  });

  it('warns when checkpoints are unresolved', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.checkpoint_history = [
      { step: 'phase1_checkpoint1', result: 'blocked', timestamp: '2026-04-11T00:00:00.000Z' },
    ];
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.ok(result.warnings.some(w => w.includes('1 checkpoints never resolved')));
  });

  it('warns when circuit breaker is open', () => {
    const { create, finish } = require('../../scripts/session.js');
    create(testDir, 'test feature', 'main');

    const state = readSessionState(testDir);
    state.circuit_breaker = 'open';
    fs.writeFileSync(
      path.join(testDir, '.session-state.json'),
      JSON.stringify(state, null, 2) + '\n'
    );

    const result = finish(testDir);

    assert.ok(result.warnings.some(w => w.includes('open circuit breaker')));
  });

  it('throws when no active session', () => {
    const { finish } = require('../../scripts/session.js');

    assert.throws(() => finish(testDir), /No active session/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/test-finish.js`
Expected: FAIL — `finish` is not exported, `session_id` not generated, gate.js fields missing

- [ ] **Step 3: Update session.js**

In `scripts/session.js`, add crypto import at the top:

```javascript
const crypto = require('node:crypto');
```

Replace the `create` function:

```javascript
function create(sessionDir, feature, branch) {
  ensureDir(sessionDir);
  const state = {
    version: 2,
    session_id: crypto.randomUUID(),
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
    teaching_schedule: [],
    checkpoint_history: [],
    circuit_breaker: 'closed',
  };
  writeJSON(getSessionPath(sessionDir), state);
  return { success: true, session_id: state.session_id, feature, branch };
}
```

Add the `finish` function after `clear`:

```javascript
function finish(sessionDir) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to finish');

  const warnings = [];

  const schedule = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const checkedIds = new Set(checked.map(c => c.concept_id));
  const untaught = schedule.filter(c => !checkedIds.has(c.concept_id));
  if (untaught.length > 0) {
    warnings.push(`${untaught.length} concepts scheduled but not taught: ${untaught.map(c => c.concept_id).join(', ')}`);
  }

  const history = Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [];
  const blockedSteps = new Set(
    history.filter(h => h.result === 'blocked').map(h => h.step)
  );
  const passedSteps = new Set(
    history.filter(h => h.result === 'passed').map(h => h.step)
  );
  const unresolvedCount = [...blockedSteps].filter(s => !passedSteps.has(s)).length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} checkpoints never resolved`);
  }

  if (state.circuit_breaker === 'open') {
    warnings.push('Session completed with open circuit breaker');
  }

  const updatedState = {
    ...state,
    phase: 'complete',
    last_updated: isoNow(),
  };
  writeJSON(sessionPath, updatedState);

  return { verified: true, warnings };
}
```

Remove the `gate` function entirely (lines 91-124 in current file).

Update the CLI switch in `if (require.main === module)`:

- Remove the `case 'gate':` block
- Add the `case 'finish':` block:

```javascript
      case 'finish':
        validateArgs(['session-dir'], 'finish --session-dir PATH');
        result = finish(args['session-dir']);
        break;
```

- Update the default error message to: `'Unknown mode: ${mode}. Use create, load, update, add-concept, finish, or clear.\n'`

Update `module.exports`:

```javascript
module.exports = { create, load, update, addConcept, finish, clear };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/test-finish.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Run existing tests to confirm no regression**

Run: `bash tests/cli/test-whiteboard.sh`
Expected: PASS (test doesn't exercise gate subcommand)

- [ ] **Step 6: Commit**

```bash
git add scripts/session.js tests/unit/test-finish.js
git commit -m "feat(v4): add session_id, gate.js fields, finish subcommand; remove gate from session.js"
```

---

### Task 5: update.js — Idempotency Nonce

**Files:**
- Modify: `scripts/update.js`
- Create: `tests/unit/test-nonce.js`

- [ ] **Step 1: Write failing tests for nonce behavior**

Create `tests/unit/test-nonce.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonce-test-'));
  fs.mkdirSync(path.join(testDir, 'testing'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('nonce idempotency', () => {
  it('writes nonce to frontmatter on first grade', () => {
    const { update } = require('../../scripts/update.js');

    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    assert.strictEqual(result.action, 'created');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.operation_nonce, 'session123-test_concept');
    assert.strictEqual(file.frontmatter.schema_version, 4);
  });

  it('returns idempotent_skip when nonce matches', () => {
    const { update } = require('../../scripts/update.js');

    // First write
    update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    // Retry with same nonce
    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    assert.strictEqual(result.action, 'idempotent_skip');

    // Verify single review_history entry
    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.review_history.length, 1);
  });

  it('proceeds with update when nonce does not match', () => {
    const { update } = require('../../scripts/update.js');

    // First write
    update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session123-test_concept',
    });

    // Different nonce (new session)
    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '4',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
      nonce: 'session456-test_concept',
    });

    assert.strictEqual(result.action, 'updated');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.review_history.length, 2);
    assert.strictEqual(file.frontmatter.operation_nonce, 'session456-test_concept');
  });

  it('works without nonce (backward compatible)', () => {
    const { update } = require('../../scripts/update.js');

    const result = update({
      concept: 'test_concept',
      domain: 'testing',
      grade: '3',
      isSeedConcept: false,
      difficultyTier: 'intermediate',
      profileDir: testDir,
    });

    assert.strictEqual(result.action, 'created');

    const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');
    const file = readMarkdownWithFrontmatter(path.join(testDir, 'testing', 'test_concept.md'));
    assert.strictEqual(file.frontmatter.operation_nonce, null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/test-nonce.js`
Expected: FAIL — nonce field not recognized, `idempotent_skip` not returned

- [ ] **Step 3: Implement nonce in update.js**

In `scripts/update.js`, modify the `update` function. Add `nonce` to the destructured options:

```javascript
function update(options) {
  const {
    concept, domain, grade,
    isRegistryConcept, isSeedConcept, difficultyTier,
    profileDir, documentationUrl, notes,
    level, parentConcept, aliases, scopeNote, relatedConcepts,
    createParent, addAlias, body, nonce,
  } = options;
```

After the `--body path` block and before the `--- grade-based create / update path ---` comment, add the nonce check for existing files:

```javascript
  // --- nonce idempotency check (grade path only) ---
  if (nonce !== undefined && existing) {
    if (existing.frontmatter.operation_nonce === nonce) {
      return {
        success: true,
        concept_id: concept,
        domain,
        action: 'idempotent_skip',
      };
    }
  }
```

In the `if (!existing)` block (new concept creation, grade path), add `schema_version` and `operation_nonce` to the frontmatter:

```javascript
    const frontmatter = {
      concept_id: concept,
      domain,
      schema_version: 4,
      operation_nonce: nonce || null,
      level: level !== undefined ? parseInt(level, 10) : 1,
      // ... rest unchanged
    };
```

In the existing concept update path (after computing new stability/difficulty), add nonce to the updated frontmatter:

```javascript
  const updatedFrontmatter = {
    ...entry,
    schema_version: entry.schema_version || 4,
    operation_nonce: nonce || entry.operation_nonce || null,
    last_reviewed: now,
    // ... rest unchanged
  };
```

In the CLI section, add `nonce` to the options passed to `update()`:

```javascript
    const result = update({
      // ... existing fields ...
      nonce: args.nonce,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/test-nonce.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Run existing tests to confirm no regression**

Run: `bash tests/cli/test-whiteboard.sh && bash tests/cli/test-analyze-architecture.sh`
Expected: PASS (nonce is optional, all existing paths unaffected)

- [ ] **Step 6: Commit**

```bash
git add scripts/update.js tests/unit/test-nonce.js
git commit -m "feat(v4): add idempotency nonce to update.js for double-grade prevention"
```

---

### Task 6: Envelope wrapping for session.js, update.js, lookup.js, graph.js

**Files:**
- Modify: `scripts/session.js`
- Modify: `scripts/update.js`
- Modify: `scripts/lookup.js`
- Modify: `scripts/graph.js`

- [ ] **Step 1: Wrap session.js CLI output in envelope**

In `scripts/session.js`, add `envelope` and `envelopeError` to the imports:

```javascript
const { readJSON, writeJSON, ensureDir, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');
```

In the `if (require.main === module)` block, change the success output line from:

```javascript
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
```

to:

```javascript
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
```

Change the catch block from:

```javascript
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
```

to:

```javascript
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
```

- [ ] **Step 2: Wrap update.js CLI output in envelope**

In `scripts/update.js`, add the import:

```javascript
const { ensureDir, isoNow, daysBetween, parseArgs,
        readMarkdownWithFrontmatter, writeMarkdownFile, expandHome,
        envelope, envelopeError } = require('./utils.js');
```

In the CLI section, change the success output:

```javascript
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
```

Change both catch blocks (EACCES and general) to use `envelopeError`:

```javascript
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify(envelopeError('blocking', err.message)) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
```

- [ ] **Step 3: Wrap lookup.js CLI output in envelope**

In `scripts/lookup.js`, add the import:

```javascript
const { readJSON, ensureDir, parseArgs, daysBetween, isoNow, readMarkdownWithFrontmatter, listMarkdownFiles, expandHome, envelope, envelopeError } = require('./utils.js');
```

In the CLI section, replace all three `process.stdout.write(JSON.stringify(result,` lines with:

```javascript
      process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
```

Change both catch blocks to use `envelopeError`:

```javascript
  } catch (err) {
    if (err.code === 'EACCES') {
      process.stderr.write(JSON.stringify(envelopeError('blocking', err.message)) + '\n');
      process.exit(2);
    }
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
```

- [ ] **Step 4: Wrap graph.js CLI output in envelope**

In `scripts/graph.js`, add the import:

```javascript
const { ensureDir, isoNow, parseArgs, listMarkdownFiles, envelope, envelopeError } = require('./utils.js');
```

In the CLI section, change the success output:

```javascript
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
```

Change the catch block:

```javascript
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
```

- [ ] **Step 5: Run all existing tests**

Run: `bash tests/cli/test-whiteboard.sh && bash tests/cli/test-analyze-architecture.sh`
Expected: Some tests may FAIL because they parse raw JSON output without the envelope wrapper. Note which tests fail.

- [ ] **Step 6: Fix existing tests for envelope**

In `tests/cli/test-whiteboard.sh`, Test 4 runs `lookup.js reconcile` and discards output to `/dev/null`, so it should still pass.

In `tests/cli/test-analyze-architecture.sh`, Test 2 (graph.js scan) parses raw output. Update the node inline parsing to unwrap the envelope:

Change Test 2:
```bash
SCAN_OUTPUT=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 50 2>/dev/null)
if echo "$SCAN_OUTPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; process.exit(d.files&&Array.isArray(d.files)?0:1)" 2>/dev/null; then
```

Change Test 4:
```bash
EXCLUDED=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 200 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; \
    const bad=d.files.filter(f=>f.path.includes('node_modules')||f.path.includes('.git/')); \
    console.log(bad.length)")
```

Change Test 5:
```bash
MANIFEST_FIRST=$(node "$PLUGIN_DIR/scripts/graph.js" scan --dir "$PLUGIN_DIR" --budget 5 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data; \
    const types=d.files.map(f=>f.type); \
```

Change Test 6 (lookup.js search):
```bash
SEARCH_OUTPUT=$(node "$PLUGIN_DIR/scripts/lookup.js" search \
  --query "pipe filter" \
  --registry-path "$FIXTURE_REGISTRY" \
  --domains-path "$PLUGIN_DIR/data/domains.json" 2>/dev/null)
HAS_VERBOSE=$(echo "$SEARCH_OUTPUT" | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).data;
  const concepts=d.matched_concepts||[];
```

- [ ] **Step 7: Run all tests to confirm green**

Run: `bash tests/cli/test-whiteboard.sh && bash tests/cli/test-analyze-architecture.sh && node --test tests/unit/test-envelope.js && node --test tests/unit/test-gate.js && node --test tests/unit/test-finish.js && node --test tests/unit/test-nonce.js`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/session.js scripts/update.js scripts/lookup.js scripts/graph.js tests/cli/test-analyze-architecture.sh
git commit -m "feat(v4): wrap all script CLI output in {status, data, error} envelope"
```

---

### Task 7: migrate-v4.js

**Files:**
- Create: `scripts/migrate-v4.js`
- Create: `tests/unit/test-migrate.js`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/test-migrate.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeMarkdownFile, readMarkdownWithFrontmatter } = require('../../scripts/utils.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
  fs.mkdirSync(path.join(testDir, 'databases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('adds schema_version and operation_nonce to v3 files', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases', fsrs_stability: 1.5 },
      '\n# Caching\n'
    );

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.skipped, 0);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.frontmatter.schema_version, 4);
    assert.strictEqual(file.frontmatter.operation_nonce, null);
    assert.strictEqual(file.frontmatter.concept_id, 'caching');
  });

  it('skips files already at schema_version 4', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases', schema_version: 4, operation_nonce: null },
      '\n# Caching\n'
    );

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 0);
    assert.strictEqual(result.skipped, 1);
  });

  it('dry-run does not write files', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      '\n# Caching\n'
    );

    const result = migrate(testDir, true);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.dry_run, true);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.frontmatter.schema_version, undefined);
  });

  it('preserves existing body content', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');
    const body = '\n# Caching\n\n## Notes\nImportant concept.\n';

    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      body
    );

    migrate(testDir, false);

    const file = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file.body, body);
  });

  it('continues on per-file error', () => {
    const { migrate } = require('../../scripts/migrate-v4.js');

    // Write a valid file
    writeMarkdownFile(
      path.join(testDir, 'databases', 'caching.md'),
      { concept_id: 'caching', domain: 'databases' },
      '\n# Caching\n'
    );

    // Write an invalid file (not valid frontmatter)
    fs.writeFileSync(path.join(testDir, 'databases', 'broken.md'), 'not valid frontmatter', 'utf-8');

    const result = migrate(testDir, false);

    assert.strictEqual(result.migrated, 1);
    assert.strictEqual(result.errors, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/test-migrate.js`
Expected: FAIL — `../../scripts/migrate-v4.js` does not exist

- [ ] **Step 3: Implement migrate-v4.js**

Create `scripts/migrate-v4.js`:

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, readMarkdownWithFrontmatter, writeMarkdownFile, expandHome, envelope, envelopeError } = require('./utils.js');

function migrate(profileDir, dryRun) {
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  let domainDirs;
  try {
    domainDirs = fs.readdirSync(profileDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') return { migrated, skipped, errors, dry_run: dryRun };
    throw err;
  }

  for (const domainName of domainDirs) {
    const domainPath = path.join(profileDir, domainName);
    let files;
    try {
      files = fs.readdirSync(domainPath).filter(f => f.endsWith('.md'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(domainPath, file);
      try {
        const existing = readMarkdownWithFrontmatter(filePath);
        if (!existing) {
          errors++;
          continue;
        }

        if (existing.frontmatter.schema_version >= 4) {
          skipped++;
          continue;
        }

        if (dryRun) {
          migrated++;
          continue;
        }

        const updatedFrontmatter = {
          ...existing.frontmatter,
          schema_version: 4,
          operation_nonce: existing.frontmatter.operation_nonce || null,
        };

        writeMarkdownFile(filePath, updatedFrontmatter, existing.body);
        migrated++;
      } catch {
        errors++;
      }
    }
  }

  return { migrated, skipped, errors, dry_run: dryRun };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (!args['profile-dir']) {
    process.stderr.write(JSON.stringify(envelopeError('blocking', 'Missing required argument: --profile-dir')) + '\n');
    process.stderr.write('Usage: node migrate-v4.js --profile-dir PATH [--dry-run]\n');
    process.exit(1);
  }

  try {
    const dryRun = args['dry-run'] === true;
    const result = migrate(expandHome(args['profile-dir']), dryRun);
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { migrate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/test-migrate.js`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-v4.js tests/unit/test-migrate.js
git commit -m "feat(v4): add migrate-v4.js for batch v3-to-v4 concept file migration"
```

---

### Task 8: Contract Tests

**Files:**
- Create: `tests/contract/test-session-contract.js`
- Create: `tests/contract/test-gate-contract.js`
- Create: `tests/contract/test-update-contract.js`
- Create: `tests/contract/test-lookup-contract.js`
- Create: `tests/contract/test-graph-contract.js`

- [ ] **Step 1: Write session.js contract test**

Create `tests/contract/test-session-contract.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'session.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-session-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

function runExpectFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.fail('Expected command to fail');
  } catch (err) {
    return JSON.parse(err.stderr);
  }
}

describe('session.js contract', () => {
  it('create returns envelope with status ok and data', () => {
    const output = run(['create', '--session-dir', testDir, '--feature', 'test', '--branch', 'main']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(output.data);
    assert.strictEqual(output.data.success, true);
    assert.ok(output.data.session_id);
    assert.strictEqual('error' in output, false);
  });

  it('finish returns envelope with verified and warnings', () => {
    run(['create', '--session-dir', testDir, '--feature', 'test', '--branch', 'main']);
    const output = run(['finish', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.verified, true);
    assert.ok(Array.isArray(output.data.warnings));
    assert.strictEqual('error' in output, false);
  });

  it('error returns envelope with status error and error object', () => {
    const output = runExpectFail(['finish', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'error');
    assert.ok(output.error);
    assert.ok(output.error.level);
    assert.ok(output.error.message);
    assert.strictEqual('data' in output, false);
  });
});
```

- [ ] **Step 2: Write gate.js contract test**

Create `tests/contract/test-gate-contract.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SESSION_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'session.js');
const GATE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'gate.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-gate-'));
  // Create a session first
  execFileSync('node', [SESSION_SCRIPT, 'create', '--session-dir', testDir, '--feature', 'test', '--branch', 'main'], { encoding: 'utf-8' });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [GATE_SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

function runExpectFail(args) {
  try {
    execFileSync('node', [GATE_SCRIPT, ...args], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    assert.fail('Expected command to fail');
  } catch (err) {
    return JSON.parse(err.stderr);
  }
}

describe('gate.js contract', () => {
  it('schedule returns envelope with scheduled count', () => {
    const concepts = JSON.stringify([{ concept_id: 'x', domain: 'y', status: 'new', step: 'phase1_checkpoint1' }]);
    const output = run(['schedule', '--session-dir', testDir, '--phase', '1', '--concepts', concepts]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(typeof output.data.scheduled, 'number');
    assert.strictEqual(typeof output.data.total, 'number');
    assert.strictEqual('error' in output, false);
  });

  it('checkpoint returns envelope with result and missing', () => {
    const output = run(['checkpoint', '--session-dir', testDir, '--step', 'phase1_checkpoint1']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(['passed', 'blocked', 'degraded'].includes(output.data.result));
    assert.ok(Array.isArray(output.data.missing));
    assert.strictEqual('error' in output, false);
  });

  it('log returns envelope with logged true', () => {
    const entry = JSON.stringify({ event: 'test' });
    const output = run(['log', '--session-dir', testDir, '--entry', entry]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.logged, true);
  });

  it('status returns envelope with schedule, checkpoints, circuit', () => {
    const output = run(['status', '--session-dir', testDir]);
    assert.strictEqual(output.status, 'ok');
    assert.ok(Array.isArray(output.data.schedule));
    assert.ok(Array.isArray(output.data.checkpoints));
    assert.ok(['closed', 'open', 'half-open'].includes(output.data.circuit));
  });

  it('error returns envelope with error object', () => {
    const badDir = path.join(testDir, 'nonexistent');
    const output = runExpectFail(['status', '--session-dir', badDir]);
    assert.strictEqual(output.status, 'error');
    assert.ok(output.error.level);
    assert.ok(output.error.message);
    assert.strictEqual('data' in output, false);
  });
});
```

- [ ] **Step 3: Write update.js contract test**

Create `tests/contract/test-update-contract.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update.js');
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-update-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('update.js contract', () => {
  it('create returns envelope with action created', () => {
    const output = run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir,
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'created');
    assert.strictEqual(output.data.success, true);
    assert.strictEqual('error' in output, false);
  });

  it('nonce skip returns envelope with action idempotent_skip', () => {
    run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    const output = run([
      '--concept', 'test_concept', '--domain', 'testing', '--grade', '3',
      '--is-seed-concept', 'false', '--profile-dir', testDir, '--nonce', 'abc-test_concept',
    ]);
    assert.strictEqual(output.status, 'ok');
    assert.strictEqual(output.data.action, 'idempotent_skip');
  });
});
```

- [ ] **Step 4: Write lookup.js and graph.js contract tests**

Create `tests/contract/test-lookup-contract.js`:

```javascript
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
```

Create `tests/contract/test-graph-contract.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'graph.js');
const PLUGIN_DIR = path.join(__dirname, '..', '..');

function run(args) {
  const result = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8' });
  return JSON.parse(result);
}

describe('graph.js contract', () => {
  it('scan returns envelope with files array', () => {
    const output = run(['scan', '--dir', PLUGIN_DIR, '--budget', '10']);
    assert.strictEqual(output.status, 'ok');
    assert.ok(Array.isArray(output.data.files));
    assert.ok(typeof output.data.total_files === 'number');
    assert.strictEqual('error' in output, false);
  });
});
```

- [ ] **Step 5: Run all contract tests**

Run: `node --test tests/contract/test-session-contract.js && node --test tests/contract/test-gate-contract.js && node --test tests/contract/test-update-contract.js && node --test tests/contract/test-lookup-contract.js && node --test tests/contract/test-graph-contract.js`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add tests/contract/
git commit -m "test(v4): add contract tests for all scripts — envelope conformance validation"
```

---

### Task 9: Integration Chain Tests

**Files:**
- Create: `tests/integration/test-chain-schedule.js`
- Create: `tests/integration/test-chain-nonce.js`
- Create: `tests/integration/test-chain-lifecycle.js`

- [ ] **Step 1: Write Chain 1 — Teaching schedule lifecycle**

Create `tests/integration/test-chain-schedule.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { create, addConcept } = require('../../scripts/session.js');
const { schedule, checkpoint } = require('../../scripts/gate.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-schedule-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 1: Teaching schedule lifecycle', () => {
  it('full flow: create → schedule → blocked → teach → passed', () => {
    // Step 1: Create session
    const session = create(testDir, 'test feature', 'main');
    assert.ok(session.session_id);

    // Step 2: Schedule concepts for phase 1
    const concepts = [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
      { concept_id: 'indexing', domain: 'databases', status: 'review', step: 'phase1_checkpoint1' },
    ];
    const schedResult = schedule(testDir, 1, concepts);
    assert.strictEqual(schedResult.scheduled, 2);

    // Step 3: Checkpoint before teaching — should be blocked
    const blocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(blocked.result, 'blocked');
    assert.deepStrictEqual(blocked.missing, ['caching', 'indexing']);

    // Step 4: Teach one concept
    addConcept(testDir, {
      conceptId: 'caching',
      domain: 'databases',
      status: 'taught',
      grade: '3',
      phase: 'requirements',
      context: 'test',
    });

    // Step 5: Checkpoint — still blocked (indexing missing)
    const stillBlocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(stillBlocked.result, 'blocked');
    assert.deepStrictEqual(stillBlocked.missing, ['indexing']);

    // Step 6: Teach second concept
    addConcept(testDir, {
      conceptId: 'indexing',
      domain: 'databases',
      status: 'taught',
      grade: '4',
      phase: 'requirements',
      context: 'test',
    });

    // Step 7: Checkpoint — should pass
    const passed = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(passed.result, 'passed');
    assert.deepStrictEqual(passed.missing, []);
  });
});
```

- [ ] **Step 2: Write Chain 2 — Idempotency nonce**

Create `tests/integration/test-chain-nonce.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { update } = require('../../scripts/update.js');
const { readMarkdownWithFrontmatter } = require('../../scripts/utils.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-nonce-'));
  fs.mkdirSync(path.join(testDir, 'databases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 2: Idempotency nonce', () => {
  it('first write creates, retry skips, different session updates', () => {
    const nonce1 = 'session-abc-caching';

    // First write — creates concept
    const created = update({
      concept: 'caching', domain: 'databases', grade: '3',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce1,
    });
    assert.strictEqual(created.action, 'created');

    // Retry with same nonce — idempotent skip
    const skipped = update({
      concept: 'caching', domain: 'databases', grade: '3',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce1,
    });
    assert.strictEqual(skipped.action, 'idempotent_skip');

    // Verify single review entry
    const file1 = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file1.frontmatter.review_history.length, 1);

    // Different session — new nonce, should update
    const nonce2 = 'session-def-caching';
    const updated = update({
      concept: 'caching', domain: 'databases', grade: '4',
      isSeedConcept: false, difficultyTier: 'intermediate',
      profileDir: testDir, nonce: nonce2,
    });
    assert.strictEqual(updated.action, 'updated');

    // Verify two review entries
    const file2 = readMarkdownWithFrontmatter(path.join(testDir, 'databases', 'caching.md'));
    assert.strictEqual(file2.frontmatter.review_history.length, 2);
    assert.strictEqual(file2.frontmatter.operation_nonce, nonce2);
  });
});
```

- [ ] **Step 3: Write Chain 3 — Full session lifecycle**

Create `tests/integration/test-chain-lifecycle.js`:

```javascript
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { create, addConcept, update: sessionUpdate, finish, clear } = require('../../scripts/session.js');
const { schedule, checkpoint, log } = require('../../scripts/gate.js');

let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-lifecycle-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('Chain 3: Full session lifecycle', () => {
  it('create → schedule → checkpoint → teach → log → finish → verify', () => {
    // Create session
    const session = create(testDir, 'lifecycle test', 'main');
    assert.ok(session.session_id);

    // Schedule phase 1 concepts
    schedule(testDir, 1, [
      { concept_id: 'caching', domain: 'databases', status: 'new', step: 'phase1_checkpoint1' },
    ]);

    // Checkpoint — blocked
    const blocked = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(blocked.result, 'blocked');

    // Teach concept
    addConcept(testDir, {
      conceptId: 'caching', domain: 'databases', status: 'taught',
      grade: '3', phase: 'requirements', context: 'lifecycle test',
    });

    // Checkpoint — passed
    const passed = checkpoint(testDir, 'phase1_checkpoint1');
    assert.strictEqual(passed.result, 'passed');

    // Log events
    log(testDir, { event: 'checkpoint', step: 'phase1_checkpoint1', result: 'passed' });
    log(testDir, { event: 'phase_transition', from: 'requirements', to: 'hld' });

    // Update phase
    sessionUpdate(testDir, { phase: 'hld' });

    // Log finish event (log-first ordering)
    log(testDir, { event: 'session_finish', phase: 'complete' });

    // Finish session
    const finishResult = finish(testDir);
    assert.strictEqual(finishResult.verified, true);
    assert.deepStrictEqual(finishResult.warnings, []);

    // Verify session-log.jsonl
    const logPath = path.join(testDir, '.session-log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[0]).event, 'checkpoint');
    assert.strictEqual(JSON.parse(lines[1]).event, 'phase_transition');
    assert.strictEqual(JSON.parse(lines[2]).event, 'session_finish');

    // Clear preserves log
    clear(testDir);
    assert.strictEqual(fs.existsSync(path.join(testDir, '.session-state.json')), false);
    assert.strictEqual(fs.existsSync(logPath), true);
  });
});
```

- [ ] **Step 4: Run all integration tests**

Run: `node --test tests/integration/test-chain-schedule.js && node --test tests/integration/test-chain-nonce.js && node --test tests/integration/test-chain-lifecycle.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test(v4): add integration chain tests — schedule lifecycle, nonce, full lifecycle"
```

---

### Task 10: Rewrite whiteboard SKILL.md to v4 template

**Files:**
- Modify: `skills/whiteboard/SKILL.md`

- [ ] **Step 1: Read current whiteboard SKILL.md and protocol files**

Read: `skills/whiteboard/SKILL.md`, `skills/whiteboard/protocols/concept-check.md`, `skills/whiteboard/protocols/critique.md`, `skills/whiteboard/templates/design-doc.md`

Confirm all content is understood before rewriting.

- [ ] **Step 2: Rewrite whiteboard SKILL.md with v4 template**

Replace the full contents of `skills/whiteboard/SKILL.md` with the v4 version. Key changes:

**Frontmatter** — add inputs, outputs, failure_modes, lifecycle:

```yaml
---
name: whiteboard
description: >
  Domain-agnostic solutions architect with integrated concept teaching.
  Conducts design conversations for new features or greenfield projects.
  Proposes designs, debates tradeoffs, teaches concepts when gaps are
  detected, and produces design documents. Use when planning any
  technical feature or system.
disable-model-invocation: true
argument-hint: "[feature/project description] [--continue]"
model: sonnet
inputs:
  - feature_description: "free text"
  - continue: "boolean, optional"
outputs:
  - design_document: "docs/professor/designs/{date}-{shorthand}.md"
  - session_log: "docs/professor/.session-log.jsonl"
failure_modes:
  - concept_agent_timeout: "warn, continue without tracking"
  - professor_teach_failure: "warn, skip concept, log gap"
  - gate_js_crash: "warn, continue without enforcement"
  - session_js_crash: "fatal, stop"
lifecycle:
  phases: [context_loading, requirements, hld, lld, deliverable]
  checkpoints:
    phase1_checkpoint1: "L1 concepts resolved and scheduled before requirement discussion"
    phase2_checkpoint1: "L2 concepts resolved and scheduled before design proposals"
    phase3_checkpoint1: "L2 concepts resolved and scheduled per component"
---
```

**Phase 0** — unchanged except `create` now returns `session_id`:

Replace the create command to note the session_id:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js create \
  --feature "{feature description}" \
  --branch "$(git branch --show-current)" \
  --session-dir docs/professor/
```

Note the `session_id` from the response `data.session_id` — it is needed for professor-teach invocations.

**Phase 1.4-1.5** — replace `session.js gate` with gate.js schedule+checkpoint:

After concept-agent returns resolved concepts, instead of calling `session.js gate`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.js schedule \
  --session-dir docs/professor/ \
  --phase 1 \
  --concepts '[{"concept_id":"...","domain":"...","status":"...","step":"phase1_checkpoint1"}]'
```

Before requirement discussion (replacing the old `session.js gate --require concepts`):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.js checkpoint \
  --session-dir docs/professor/ \
  --step phase1_checkpoint1
```

If checkpoint returns `blocked`: teach missing concepts via professor-teach, then re-check.
If checkpoint returns `degraded`: warn developer, continue without enforcement.

**Phase 1.5 professor-teach invocation** — add `--session-id`:

```
Use the Agent tool:
- description: "Teach {concept_id}"
- prompt: "/claude-professor:professor-teach {concept_id} --context \"{feature context}\" --status {status} --domain {domain} --session-id \"{session_id}\""
```

**Phase 1.6** — add gate.js log at phase transition:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.js log \
  --session-dir docs/professor/ \
  --entry '{"event":"phase_transition","from":"requirements","to":"hld"}'
```

**Phase 2.1** — replace `session.js gate` with gate.js checkpoint:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.js checkpoint \
  --session-dir docs/professor/ \
  --step phase2_checkpoint1
```

**Phase 3** — add gate.js schedule+checkpoint per component.

**Phase 4.2** — add nonce to FSRS update calls:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{id}" --domain "{domain}" --grade {1-4} \
  --nonce "{session_id}-{concept_id}" \
  --is-seed-concept {true|false} --difficulty-tier "{tier}" \
  --profile-dir ~/.claude/professor/concepts/ \
  --notes "{feature context}"
```

**Phase 4.3-4.4** — add gate.js log before finish (log-first ordering):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.js log \
  --session-dir docs/professor/ \
  --entry '{"event":"session_finish","phase":"complete"}'

node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js finish --session-dir docs/professor/

node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js clear --session-dir docs/professor/
```

**Session Management section** — update operations list to `create, load, update, add-concept, finish, clear` (remove `gate`).

**Add Degradation section** at end:

```markdown
## Degradation Modes

### concept-agent timeout
Warn developer: "I couldn't resolve concepts — continuing without tracking." Proceed without teaching schedule. Log the gap via gate.js log.

### professor-teach failure
Warn developer: "I couldn't teach {concept} — skipping." Record concept as skipped in session state. Log the gap. Verify phase flags it via session.js finish warnings.

### gate.js crash
Warn developer: "Checkpoint enforcement unavailable — continuing without gates." Proceed with design conversation. All gate.js calls become no-ops for the remainder of the session.

### session.js crash
Fatal. Session state is the foundation. Stop the session and inform the developer: "Session state is corrupted — cannot continue. Start a new session."
```

- [ ] **Step 3: Verify skill loads**

Run: `head -30 skills/whiteboard/SKILL.md`
Expected: Frontmatter with inputs, outputs, failure_modes, lifecycle present

- [ ] **Step 4: Commit**

```bash
git add skills/whiteboard/SKILL.md
git commit -m "feat(v4): rewrite whiteboard SKILL.md to v4 template with gate.js integration"
```

---

### Task 11: Rewrite professor-teach SKILL.md

**Files:**
- Modify: `skills/professor-teach/SKILL.md`

- [ ] **Step 1: Read current professor-teach SKILL.md**

Read: `skills/professor-teach/SKILL.md`

- [ ] **Step 2: Rewrite professor-teach SKILL.md**

Key changes:

**Frontmatter** — add v4 template fields:

```yaml
---
name: professor-teach
description: >
  Teach a single technical concept with analogy, example, and recall question.
  Used by other skills when a concept gap is detected during conversation.
  Do not invoke directly — invoked by /whiteboard and similar.
context: fork
agent: general-purpose
user-invocable: false
model: sonnet
argument-hint: "{concept_id} [--context \"...\"] [--status new|encountered_via_child|teach_new|review] [--domain \"...\"] [--session-id \"...\"]"
inputs:
  - concept_id: "snake_case concept identifier"
  - context: "task context string"
  - status: "FSRS status: new|encountered_via_child|teach_new|review"
  - domain: "concept domain"
  - session_id: "session UUID for nonce construction"
outputs:
  - analogy: "~100 words concrete comparison"
  - production_example: "~150 words real-world usage"
  - task_connection: "~100 words connecting to developer's context"
  - recall_question: "application question tied to task"
  - grade: "FSRS grade 1-4"
  - notes: "rich markdown written to concept file"
failure_modes:
  - update_script_failure: "warn, return grade anyway"
  - body_write_failure: "warn, return grade anyway"
---
```

**New argument: `--session-id`** — parse from `$ARGUMENTS`.

**Step 2 (Explain)** — add explicit section headers:

```markdown
## Step 2: Explain the Concept

Provide all four elements:

### Analogy (~100 words)
Concrete, visual comparison to everyday life. Make it specific and visual, not abstract.

### Real-World Production Example (~150 words)
How it's used in production systems, with concrete details (company scale, failure mode, or architectural choice).

### Task Connection (~100 words)
"In your {context}, {concept} means..." Connect directly to what the developer is building.

### Recall Question
One application question that requires the developer to apply the concept to their specific context, not recite a definition.
```

**Adaptive re-teaching** — add before Step 2:

```markdown
## Step 1.5: Read Prior Notes (re-teach/review only)

If status is `teach_new` or `review`, read existing concept file:

```bash
cat ~/.claude/professor/concepts/{domain}/{concept_id}.md
```

If prior notes exist:
- Use a DIFFERENT analogy than what appears in the Key Points section
- Target any weaknesses noted (e.g., "struggled with X")
- Acknowledge prior exposure: "Last time you found {aspect} tricky. Let's see how that sits now."
```

**Step 6 (Update Score)** — add nonce:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js \
  --concept "{concept_id}" \
  --domain "{domain}" \
  --grade {1-4} \
  --nonce "{session_id}-{concept_id}" \
  --is-registry-concept {true|false} \
  --difficulty-tier "{foundational|intermediate|advanced}" \
  --profile-dir ~/.claude/professor/concepts/ \
  --notes "{one-line task context}"
```

If `--session-id` was not provided, omit `--nonce` (backward compatible with non-v4 callers).

**Degradation section** at end:

```markdown
## Degradation Modes

### update_script_failure
If update.js fails when writing the grade, note it in the return summary: "Grade write failed — score not persisted." Still return the grade to the calling skill.

### body_write_failure
If update.js --body fails when writing notes, note it: "Notes write failed — teaching notes not persisted." Still return the grade.
```

- [ ] **Step 3: Commit**

```bash
git add skills/professor-teach/SKILL.md
git commit -m "feat(v4): rewrite professor-teach with structured output contract, --session-id, and adaptive re-teaching"
```

---

### Task 12: Update concept-agent for envelope parsing

**Files:**
- Modify: `agents/concept-agent.md`

- [ ] **Step 1: Read current concept-agent.md**

Read: `agents/concept-agent.md`

- [ ] **Step 2: Update concept-agent.md for envelope**

In every section where concept-agent parses script output, add envelope unwrapping instructions.

**Resolution Flow — Step 1 (Exact ID Match):** After the bash command, add:

```markdown
Parse the envelope: the result is in the `data` field of the JSON output (e.g., `output.data.match_type`). If `output.status` is `"error"`, treat as a script failure and follow the Self-Healing Retry Protocol.
```

Apply the same pattern to Step 2 (Alias Match), Step 3 (Semantic Match — `list-concepts`), Step 4 (Genuinely New — `update.js`), and Compute Status (`lookup.js status`).

**Self-Healing Retry Protocol — Runtime Errors:** Update the error detection:

```markdown
### Runtime Errors (output `status` is `"error"` with an `error` object, or a stack trace)
```

No changes to the resolution flow logic, output format, or rules.

- [ ] **Step 3: Commit**

```bash
git add agents/concept-agent.md
git commit -m "feat(v4): update concept-agent to parse envelope from script output"
```

---

### Task 13: Update deprecated skills and analyze-architecture for v4

**Files:**
- Modify: `skills/analyze-architecture/SKILL.md`
- Modify: `skills/backend-architect/SKILL.md`
- Modify: `skills/professor/SKILL.md`

- [ ] **Step 1: Update analyze-architecture SKILL.md**

Add v4 frontmatter (inputs, outputs, failure_modes). This skill has no teaching schedule (no concept checking), so lifecycle/checkpoints are omitted. Add degradation section at end.

Key changes to body: all `graph.js` and `lookup.js` calls now return envelope. Update the subagent prompts to instruct agents to parse `output.data` from the envelope.

In Stage 1, Stage 2, Stage 3, and Stage 4 subagent prompts, add after each script command:

```
The script returns JSON wrapped in `{status, data, error}`. Parse the `data` field for results.
```

- [ ] **Step 2: Update deprecated skills**

`skills/backend-architect/SKILL.md` and `skills/professor/SKILL.md` are already deprecated. Add a note that they are not updated for v4 envelope format:

Add after the existing deprecation notice:

```markdown
> **v4 Note:** This deprecated skill does not use the v4 envelope format. Script outputs have changed in v4.0.0 — do not use this skill with v4 scripts.
```

- [ ] **Step 3: Commit**

```bash
git add skills/analyze-architecture/SKILL.md skills/backend-architect/SKILL.md skills/professor/SKILL.md
git commit -m "feat(v4): update analyze-architecture for envelope; mark deprecated skills as v4-incompatible"
```

---

### Task 14: Version bump and final verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Bump version to 4.0.0**

In `.claude-plugin/plugin.json`, change:

```json
{
  "name": "claude-professor",
  "description": "Learning layer for AI-assisted development. Teaches concepts before you build, tracks knowledge with spaced repetition, analyzes project architecture, and conducts system design conversations with integrated teaching.",
  "version": "4.0.0"
}
```

- [ ] **Step 2: Run full test suite**

Run:
```bash
node --test tests/unit/test-envelope.js && \
node --test tests/unit/test-gate.js && \
node --test tests/unit/test-finish.js && \
node --test tests/unit/test-nonce.js && \
node --test tests/unit/test-migrate.js && \
node --test tests/contract/test-session-contract.js && \
node --test tests/contract/test-gate-contract.js && \
node --test tests/contract/test-update-contract.js && \
node --test tests/contract/test-lookup-contract.js && \
node --test tests/contract/test-graph-contract.js && \
node --test tests/integration/test-chain-schedule.js && \
node --test tests/integration/test-chain-nonce.js && \
node --test tests/integration/test-chain-lifecycle.js && \
bash tests/cli/test-whiteboard.sh && \
bash tests/cli/test-analyze-architecture.sh
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: bump version to 4.0.0"
```

- [ ] **Step 4: Verify file inventory**

Run: `git diff --stat main` (or `git log --oneline` since task 1)

Verify all files from the spec's File Inventory are accounted for:
- New: `scripts/gate.js`, `scripts/migrate-v4.js`, `tests/unit/*`, `tests/contract/*`, `tests/integration/*`
- Modified: `scripts/utils.js`, `scripts/session.js`, `scripts/update.js`, `scripts/lookup.js`, `scripts/graph.js`, all 5 `SKILL.md` files, `agents/concept-agent.md`, `.claude-plugin/plugin.json`
