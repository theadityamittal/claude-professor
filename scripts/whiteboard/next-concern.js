'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { envelope, envelopeError, readJSON, expandHome } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const LOOKUP_SCRIPT = path.resolve(__dirname, '..', 'lookup.js');
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');
const DEFAULT_PROFILE_DIR = expandHome('~/.claude/professor/concepts');

/**
 * Invoke `lookup.js concept-state` for a concept and return parsed envelope.data.
 * Throws an Error with .message on lookup failure (the caller surfaces as fatal).
 */
function fetchConceptState(conceptId, registryPath, profileDir) {
  const r = spawnSync(
    'node',
    [
      LOOKUP_SCRIPT,
      'concept-state',
      '--concept', conceptId,
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ],
    { encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    throw new Error(
      `lookup.js concept-state ${conceptId} failed (exit=${r.status}): ${r.stderr || r.stdout}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    throw new Error(`lookup.js concept-state ${conceptId} stdout not JSON: ${err.message}`);
  }
  if (!parsed || parsed.status !== 'ok' || !parsed.data) {
    throw new Error(`lookup.js concept-state ${conceptId} bad envelope: ${r.stdout}`);
  }
  return parsed.data;
}

/**
 * Implements `whiteboard.js next-concern` per spec §5.1.6.
 *
 * Read-only on state (only mutation is appending the log event); does NOT
 * advance `current_concern_index` — that is `mark-concern-done`'s job.
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }

  const statePath = path.join(sessionDir, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    return [envelopeError('blocking', `No session state at ${statePath}. Run init-session first.`), 2];
  }
  let state;
  try {
    state = readJSON(statePath);
  } catch (err) {
    return [envelopeError('fatal', `corrupted session state JSON: ${err.message}`), 1];
  }
  if (!state) {
    return [envelopeError('blocking', `No session state at ${statePath}. Run init-session first.`), 2];
  }
  if (state.schema_version !== SCHEMA_VERSION) {
    return [envelopeError('blocking', `schema_version ${state.schema_version} not supported (require ${SCHEMA_VERSION}).`), 2];
  }

  if (state.current_phase !== 1) {
    return [
      envelopeError('blocking', `next-concern only valid in phase 1 (current_phase=${state.current_phase}).`),
      2,
    ];
  }
  const phase1 = (state.phases || {})[1] || (state.phases || {})['1'];
  if (!phase1) {
    return [envelopeError('blocking', 'phase 1 not started'), 2];
  }
  const concerns = Array.isArray(phase1.concerns) ? phase1.concerns : [];
  if (concerns.length === 0) {
    return [
      envelopeError('blocking', 'no concerns scheduled — call register-selection'),
      2,
    ];
  }

  const idx = phase1.current_concern_index;
  if (idx === null || idx === undefined || idx >= concerns.length) {
    // Done case — no event appended per spec.
    return [envelope({ done: true, concerns_completed: concerns.length }), 0];
  }

  const concern = concerns[idx];
  const conceptIds = Array.isArray(concern.concepts) ? concern.concepts : [];

  const registryPath = args['registry-path'] || DEFAULT_REGISTRY_PATH;
  const profileDirRaw = args['profile-dir'] || DEFAULT_PROFILE_DIR;
  const profileDir = expandHome(profileDirRaw);

  const conceptResults = [];
  for (const cid of conceptIds) {
    let cs;
    try {
      cs = fetchConceptState(cid, registryPath, profileDir);
    } catch (err) {
      return [envelopeError('fatal', err.message), 1];
    }
    conceptResults.push({
      concept_id: cs.concept_id,
      registry_meta: cs.registry_meta,
      fsrs_status: cs.fsrs_status,
      profile_path: cs.profile_path,
    });
  }

  // Append next_concern event (only mutation to state).
  try {
    appendLog(sessionDir, {
      event: 'next_concern',
      session_id: state.session_id,
      concern_id: concern.id,
      concepts: conceptIds.slice(),
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [
    envelope({
      done: false,
      concern_id: concern.id,
      source: concern.source,
      concepts: conceptResults,
    }),
    0,
  ];
}

module.exports = (register) => register('next-concern', handler);
module.exports.handler = handler;
