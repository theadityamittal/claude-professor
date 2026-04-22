'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const VALID_PHASES = new Set([1, 2, 3, 4]);

/**
 * Build the empty per-phase shape per spec §5.1.3.
 */
function emptyPhaseState(phase) {
  if (phase === 1) {
    return { status: 'in_progress', concerns: [], current_concern_index: null, discussions: [] };
  }
  if (phase === 2 || phase === 3) {
    return { status: 'in_progress', components: [], current_component_index: null, discussions: [] };
  }
  // phase === 4
  return { status: 'in_progress' };
}

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

  // Reject if this phase already started.
  if (phases[phase] !== undefined) {
    return [envelopeError('blocking', `Phase ${phase} already started (status: ${phases[phase].status}).`), 2];
  }

  // Validate transition: phase 1 requires current_phase == null,
  // phase N (N>1) requires phases[N-1].status === 'complete'.
  const transitionedFrom = state.current_phase ?? null;
  if (phase === 1) {
    if (state.current_phase !== null && state.current_phase !== undefined) {
      return [
        envelopeError('blocking', `Phase 1 can only start when current_phase is null (got ${state.current_phase}).`),
        2,
      ];
    }
  } else {
    const prevPhase = phase - 1;
    const prevState = phases[prevPhase];
    if (!prevState) {
      return [envelopeError('blocking', `Cannot start phase ${phase}: phase ${prevPhase} has not been started.`), 2];
    }
    if (prevState.status !== 'complete') {
      return [
        envelopeError('blocking', `Cannot start phase ${phase}: phase ${prevPhase} status is '${prevState.status}', expected 'complete'.`),
        2,
      ];
    }
  }

  const newPhases = { ...phases, [phase]: emptyPhaseState(phase) };
  const updated = {
    ...state,
    current_phase: phase,
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
      event: 'phase_start',
      session_id: state.session_id,
      phase,
      transitioned_from: transitionedFrom,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ phase, transitioned_from: transitionedFrom }), 0];
}

module.exports = (register) => register('phase-start', handler);
module.exports.handler = handler;
