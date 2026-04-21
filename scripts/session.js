'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');

const SESSION_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const DEFAULT_CONCERNS_PATH = path.resolve(__dirname, '..', 'data', 'concerns.json');

// Fields on the v5 session state that can be updated via `update`.
// Anything outside this set is rejected with a blocking error.
const UPDATABLE_FIELDS = new Set([
  'current_phase',
  'concerns_catalog_version',
]);

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function computeConcernsCatalogVersion(concernsPath) {
  let buf;
  try {
    buf = fs.readFileSync(concernsPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`data/concerns.json not found at ${concernsPath}`);
      e.fatal = true;
      throw e;
    }
    throw err;
  }
  const hex = crypto.createHash('sha256').update(buf).digest('hex');
  return 'sha256:' + hex;
}

/**
 * Create a v5 session state file.
 * @param {string} sessionDir
 * @param {string} task - free-text task description
 * @param {string} [concernsPath] - path to data/concerns.json (default: repo-root)
 */
function create(sessionDir, task, concernsPath) {
  if (typeof task !== 'string' || task.trim() === '') {
    const e = new Error('--task is required and must be non-empty');
    e.blocking = true;
    throw e;
  }
  const cpath = concernsPath || DEFAULT_CONCERNS_PATH;
  const concernsCatalogVersion = computeConcernsCatalogVersion(cpath);

  ensureDir(sessionDir);
  const now = isoNow();
  const state = {
    schema_version: SCHEMA_VERSION,
    session_id: crypto.randomUUID(),
    task,
    started_at: now,
    updated_at: now,
    current_phase: null,
    concerns_catalog_version: concernsCatalogVersion,
    phases: {},
    concepts_checked: [],
  };
  writeJSON(getSessionPath(sessionDir), state);
  return { success: true, session_id: state.session_id, task };
}

/**
 * Load a v5 session state file. Rejects v4 (schema_version < 5) with blocking error.
 * @returns {{ exists: false } | object} the state or {exists: false} if absent
 */
function load(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) return { exists: false };
  if (state.schema_version !== SCHEMA_VERSION) {
    const e = new Error('v4 session detected; run session.js migrate-from-v4 or discard via whiteboard.js init-session --force-new');
    e.blocking = true;
    throw e;
  }
  return state;
}

/**
 * Update a single field on the v5 state. Rejects unknown fields.
 * @param {string} sessionDir
 * @param {string} field
 * @param {*} value
 */
function update(sessionDir, field, value) {
  if (!UPDATABLE_FIELDS.has(field)) {
    const e = new Error(`Unknown field '${field}'. Updatable v5 fields: ${[...UPDATABLE_FIELDS].join(', ')}`);
    e.blocking = true;
    throw e;
  }
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to update');
  if (state.schema_version !== SCHEMA_VERSION) {
    const e = new Error('v4 session detected; run session.js migrate-from-v4 or discard via whiteboard.js init-session --force-new');
    e.blocking = true;
    throw e;
  }

  let coerced = value;
  if (field === 'current_phase') {
    if (value === null || value === 'null' || value === undefined) {
      coerced = null;
    } else {
      const n = parseInt(value, 10);
      if (!Number.isInteger(n)) {
        const e = new Error(`--value for current_phase must be an integer or null, got '${value}'`);
        e.blocking = true;
        throw e;
      }
      coerced = n;
    }
  }

  const updated = {
    ...state,
    [field]: coerced,
    updated_at: isoNow(),
  };
  writeJSON(sessionPath, updated);
  return { success: true, field, value: coerced };
}

/**
 * Low-level append to top-level `concepts_checked`. Idempotent per `nonce`.
 *
 * @param {string} sessionDir
 * @param {{conceptId: string, phase?: string|number, grade?: string|number, nonce?: string, concernOrComponent?: string}} conceptData
 * @returns {{action: 'added'|'idempotent_skip'}}
 */
function addConcept(sessionDir, conceptData) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');
  if (state.schema_version !== SCHEMA_VERSION) {
    const e = new Error('v4 session detected; run session.js migrate-from-v4 or discard via whiteboard.js init-session --force-new');
    e.blocking = true;
    throw e;
  }

  const existingChecked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];

  // Nonce idempotency — preserved from v4.0.0.
  if (conceptData.nonce) {
    const duplicate = existingChecked.find(c => c && c.nonce === conceptData.nonce);
    if (duplicate) return { action: 'idempotent_skip', concept_id: duplicate.concept_id };
  }

  const entry = {
    concept_id: conceptData.conceptId,
    phase: conceptData.phase !== undefined ? parseInt(conceptData.phase, 10) : null,
    grade: conceptData.grade !== undefined && conceptData.grade !== null ? parseInt(conceptData.grade, 10) : null,
    timestamp: isoNow(),
  };
  if (conceptData.concernOrComponent) entry.concern_or_component = conceptData.concernOrComponent;
  if (conceptData.nonce) entry.nonce = conceptData.nonce;

  const updated = {
    ...state,
    concepts_checked: [...existingChecked, entry],
    updated_at: isoNow(),
  };
  writeJSON(sessionPath, updated);
  return { action: 'added', concept_id: entry.concept_id };
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

/**
 * Finish a v5 session. Sets `current_phase` to 'complete' sentinel and reports
 * summary warnings. v5 removed circuit_breaker / teaching_schedule / checkpoint_history,
 * so warnings are driven from `phases` + `concepts_checked` only.
 */
function finish(sessionDir) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to finish');
  if (state.schema_version !== SCHEMA_VERSION) {
    const e = new Error('v4 session detected; run session.js migrate-from-v4 or discard via whiteboard.js init-session --force-new');
    e.blocking = true;
    throw e;
  }

  const warnings = [];
  const phases = state.phases || {};
  for (const [phaseKey, phaseState] of Object.entries(phases)) {
    if (phaseState && phaseState.status && phaseState.status !== 'complete') {
      warnings.push(`phase ${phaseKey} ended in status '${phaseState.status}' (not complete)`);
    }
  }

  const updated = {
    ...state,
    current_phase: 'complete',
    updated_at: isoNow(),
  };
  writeJSON(sessionPath, updated);
  return { verified: true, warnings };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function writeBlocking(message) {
    process.stderr.write(JSON.stringify(envelopeError('blocking', message)) + '\n');
    process.exit(2);
  }

  function writeFatal(message) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', message)) + '\n');
    process.exit(1);
  }

  function validateArgs(required, usage) {
    const missing = required.filter(k => args[k] === undefined || args[k] === '');
    if (missing.length > 0) {
      writeBlocking(`Missing required arguments: ${missing.join(', ')}. Usage: node session.js ${usage}`);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'create': {
        // Explicitly reject removed v4 flags upfront.
        if ('feature' in args || 'branch' in args) {
          writeBlocking('--feature/--branch are removed in v5; use --task "<free-text>"');
        }
        if (args.task === undefined || args.task === '' || args.task === true) {
          writeBlocking('Missing required argument: --task. Usage: node session.js create --task "<text>" --session-dir PATH [--concerns-path PATH]');
        }
        validateArgs(['session-dir'], 'create --task "<text>" --session-dir PATH [--concerns-path PATH]');
        result = create(args['session-dir'], args.task, args['concerns-path']);
        break;
      }
      case 'load':
        validateArgs(['session-dir'], 'load --session-dir PATH');
        result = load(args['session-dir']);
        break;
      case 'update': {
        validateArgs(['session-dir', 'field'], 'update --session-dir PATH --field NAME --value VAL');
        if (!('value' in args)) {
          writeBlocking('Missing required argument: --value');
        }
        result = update(args['session-dir'], args.field, args.value);
        break;
      }
      case 'add-concept':
        validateArgs(['session-dir', 'concept-id'], 'add-concept --session-dir PATH --concept-id ID [--phase N] [--grade G] [--nonce N]');
        result = addConcept(args['session-dir'], {
          conceptId: args['concept-id'],
          phase: args.phase,
          grade: args.grade,
          nonce: args.nonce,
          concernOrComponent: args['concern-or-component'],
        });
        break;
      case 'clear':
        validateArgs(['session-dir'], 'clear --session-dir PATH');
        result = clear(args['session-dir']);
        break;
      case 'finish':
        validateArgs(['session-dir'], 'finish --session-dir PATH');
        result = finish(args['session-dir']);
        break;
      default:
        writeBlocking(`Unknown subcommand: ${mode}. Use create, load, update, add-concept, finish, or clear.`);
    }
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    if (err && err.blocking) {
      writeBlocking(err.message);
    } else if (err && err.fatal) {
      writeFatal(err.message);
    } else {
      writeFatal(err && err.message ? err.message : String(err));
    }
  }
}

module.exports = { create, load, update, addConcept, finish, clear, computeConcernsCatalogVersion };
