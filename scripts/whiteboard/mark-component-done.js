'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

/**
 * Implements `whiteboard.js mark-component-done` per spec §5.1.11.
 *
 * Validates all concepts (seed + proposed) in the current component have been
 * recorded in top-level `concepts_checked` with matching phase before marking
 * the component done and incrementing `current_component_index`.
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

  const phase = state.current_phase;
  if (phase !== 2 && phase !== 3) {
    return [
      envelopeError('blocking', `mark-component-done only valid in phase 2 or 3 (current_phase=${phase}).`),
      2,
    ];
  }
  const phaseState = (state.phases || {})[phase] || (state.phases || {})[String(phase)];
  if (!phaseState) {
    return [envelopeError('blocking', `phase ${phase} not started`), 2];
  }

  const components = Array.isArray(phaseState.components) ? phaseState.components : [];
  const idx = phaseState.current_component_index;
  if (idx === null || idx === undefined || idx >= components.length) {
    return [envelopeError('blocking', 'no current component (current_component_index out of range)'), 2];
  }
  const comp = components[idx];
  if (comp.id !== id) {
    return [
      envelopeError('blocking', `id '${id}' does not match current scheduled component '${comp.id}'`),
      2,
    ];
  }

  const seedIds = Array.isArray(comp.concepts_seed) ? comp.concepts_seed : [];
  const proposedIds = Array.isArray(comp.concepts_proposed) ? comp.concepts_proposed.map(p => p.id) : [];
  const required = [...seedIds, ...proposedIds];

  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const recordedIds = new Set(
    checked
      .filter(c => c && c.phase === phase)
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
  const newComp = { ...comp, status: 'done' };
  const newComponents = components.slice();
  newComponents[idx] = newComp;
  const newPhaseState = {
    ...phaseState,
    components: newComponents,
    current_component_index: idx + 1,
  };
  const updated = {
    ...state,
    phases: { ...(state.phases || {}), [phase]: newPhaseState },
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'component_done',
      session_id: state.session_id,
      id,
      phase,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ marked_done: id, next_index: idx + 1 }), 0];
}

module.exports = (register) => register('mark-component-done', handler);
module.exports.handler = handler;
