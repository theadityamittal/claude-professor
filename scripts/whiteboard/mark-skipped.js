'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const VALID_PHASES = new Set([1, 2, 3]);

/**
 * Implements `whiteboard.js mark-skipped` per spec §5.1.12.
 *
 * Used in the remediation flow when the user chose `skip`. Appends synthetic
 * entries to top-level `concepts_checked` (one per id) so the gate.js checkpoint
 * re-run treats them as covered, and emits a `remediation_choice` event.
 *
 * @param {object} args
 * @returns {[object, number]}
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }

  const phaseRaw = args.phase;
  if (phaseRaw === undefined || phaseRaw === true) {
    return [envelopeError('blocking', 'Missing required argument: --phase'), 2];
  }
  const phase = parseInt(phaseRaw, 10);
  if (!Number.isInteger(phase) || !VALID_PHASES.has(phase)) {
    return [envelopeError('blocking', `Invalid --phase '${phaseRaw}'. Must be one of 1, 2, 3.`), 2];
  }

  const idsRaw = args.ids;
  if (!idsRaw || idsRaw === true) {
    return [envelopeError('blocking', 'Missing required argument: --ids'), 2];
  }
  let ids;
  try {
    ids = JSON.parse(idsRaw);
  } catch (err) {
    return [envelopeError('blocking', `Invalid --ids JSON: ${err.message}`), 2];
  }
  if (!Array.isArray(ids)) {
    return [envelopeError('blocking', '--ids must be a JSON array'), 2];
  }
  if (ids.length === 0) {
    return [envelopeError('blocking', '--ids array must be non-empty'), 2];
  }
  for (const id of ids) {
    if (typeof id !== 'string' || id === '') {
      return [envelopeError('blocking', `--ids entries must be non-empty strings (got ${JSON.stringify(id)})`), 2];
    }
  }

  const reason = args.reason;
  if (!reason || reason === true) {
    return [envelopeError('blocking', 'Missing required argument: --reason'), 2];
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return [envelopeError('blocking', 'reason must be a non-empty string'), 2];
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

  // Build synthetic entries — one timestamp per call is fine.
  const ts = isoNow();
  const synthetics = ids.map(id => ({
    concept_id: id,
    phase,
    grade: null,
    action: 'skipped_remediation',
    reason,
    timestamp: ts,
  }));
  const existingChecked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const updated = {
    ...state,
    concepts_checked: [...existingChecked, ...synthetics],
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'remediation_choice',
      session_id: state.session_id,
      phase,
      choice: 'skip',
      affected: ids.slice(),
      reason,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ skipped_count: ids.length }), 0];
}

module.exports = (register) => register('mark-skipped', handler);
module.exports.handler = handler;
