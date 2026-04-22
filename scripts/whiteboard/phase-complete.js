'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const VALID_PHASES = new Set([1, 2, 3, 4]);

/**
 * Implements `whiteboard.js phase-complete` per spec §5.1.13.
 *
 * Validates every scheduled unit in the phase has status 'done', flips
 * phases[N].status to 'complete', and appends a `phase_complete` event.
 * Does NOT auto-advance `current_phase` — that's `phase-start`'s job.
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
    return [envelopeError('blocking', `Invalid --phase '${phaseRaw}'. Must be one of 1, 2, 3, 4.`), 2];
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

  const phases = state.phases || {};
  const phaseState = phases[phase] || phases[String(phase)];
  if (!phaseState) {
    return [envelopeError('blocking', `Phase ${phase} has not been started.`), 2];
  }
  if (phaseState.status !== 'in_progress') {
    return [
      envelopeError('blocking', `Phase ${phase} is not in_progress (status: ${phaseState.status}).`),
      2,
    ];
  }

  // Validate scheduled units are done (phases 1/2/3). Phase 4 has no nested units.
  if (phase === 1) {
    const concerns = Array.isArray(phaseState.concerns) ? phaseState.concerns : [];
    const incomplete = concerns.filter(c => c && c.status !== 'done').map(c => c.id);
    if (incomplete.length > 0) {
      return [
        envelopeError('blocking', `Cannot complete phase 1: concerns not done: ${incomplete.join(', ')}`),
        2,
      ];
    }
  } else if (phase === 2 || phase === 3) {
    const components = Array.isArray(phaseState.components) ? phaseState.components : [];
    const incomplete = components.filter(c => c && c.status !== 'done').map(c => c.id);
    if (incomplete.length > 0) {
      return [
        envelopeError('blocking', `Cannot complete phase ${phase}: components not done: ${incomplete.join(', ')}`),
        2,
      ];
    }
  }
  // Phase 4: no nested units; direct completion allowed.

  const newPhaseState = { ...phaseState, status: 'complete' };
  const newPhases = { ...phases, [phase]: newPhaseState };
  // Remove any stale string-keyed entry to keep the shape canonical.
  if (newPhases[String(phase)] && phase !== String(phase)) {
    delete newPhases[String(phase)];
    newPhases[phase] = newPhaseState;
  }

  const updated = {
    ...state,
    phases: newPhases,
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'phase_complete',
      session_id: state.session_id,
      phase,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ phase, completed: true }), 0];
}

module.exports = (register) => register('phase-complete', handler);
module.exports.handler = handler;
