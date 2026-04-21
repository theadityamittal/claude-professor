'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

/**
 * Implements `whiteboard.js mark-concern-done` per spec §5.1.10.
 *
 * Validates all concepts in the current concern have been recorded in top-level
 * `concepts_checked` with `phase:1` before marking the concern done and
 * incrementing `current_concern_index`.
 *
 * @param {object} args
 * @returns {[object, number]}
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const id = args.id;
  if (!id || id === true) {
    return [envelopeError('blocking', 'Missing required argument: --id'), 2];
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
      envelopeError('blocking', `mark-concern-done only valid in phase 1 (current_phase=${state.current_phase}).`),
      2,
    ];
  }
  const phase1 = (state.phases || {})[1] || (state.phases || {})['1'];
  if (!phase1) {
    return [envelopeError('blocking', 'phase 1 not started'), 2];
  }

  const concerns = Array.isArray(phase1.concerns) ? phase1.concerns : [];
  const idx = phase1.current_concern_index;
  if (idx === null || idx === undefined || idx >= concerns.length) {
    return [envelopeError('blocking', 'no current concern (current_concern_index out of range)'), 2];
  }
  const concern = concerns[idx];
  if (concern.id !== id) {
    return [
      envelopeError('blocking', `id '${id}' does not match current scheduled concern '${concern.id}'`),
      2,
    ];
  }

  const required = Array.isArray(concern.concepts) ? concern.concepts : [];
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const recordedIds = new Set(
    checked
      .filter(c => c && c.phase === 1)
      .map(c => c.concept_id)
  );
  const missing = required.filter(c => !recordedIds.has(c));
  if (missing.length > 0) {
    return [
      envelopeError('blocking', `concepts not yet recorded: ${missing.join(', ')}`),
      2,
    ];
  }

  // Mutate.
  const newConcern = { ...concern, status: 'done' };
  const newConcerns = concerns.slice();
  newConcerns[idx] = newConcern;
  const newPhase1 = {
    ...phase1,
    concerns: newConcerns,
    current_concern_index: idx + 1,
  };
  const updated = {
    ...state,
    phases: { ...(state.phases || {}), 1: newPhase1 },
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'concern_done',
      session_id: state.session_id,
      id,
      phase: 1,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ marked_done: id, next_index: idx + 1 }), 0];
}

module.exports = (register) => register('mark-concern-done', handler);
module.exports.handler = handler;
