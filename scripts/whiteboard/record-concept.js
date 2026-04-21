'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

const VALID_ACTIONS = new Set(['taught', 'reviewed', 'known_baseline', 'skipped_not_due']);

/**
 * Implements `whiteboard.js record-concept` per spec §5.1.8.
 *
 * Validates phase/unit/concept/action/status pairing/grade up-front, only mutates
 * state once all checks pass.
 *
 * @param {object} args
 * @returns {[object, number]}
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const conceptId = args['concept-id'];
  if (!conceptId || conceptId === true) {
    return [envelopeError('blocking', 'Missing required argument: --concept-id'), 2];
  }
  const unitId = args['unit-id'];
  if (!unitId || unitId === true) {
    return [envelopeError('blocking', 'Missing required argument: --unit-id'), 2];
  }
  const action = args.action;
  if (!action || action === true) {
    return [envelopeError('blocking', 'Missing required argument: --action'), 2];
  }
  if (!VALID_ACTIONS.has(action)) {
    return [
      envelopeError('blocking', `Invalid --action '${action}'. Must be one of: ${[...VALID_ACTIONS].join(', ')}`),
      2,
    ];
  }
  const notes = args.notes;
  if (!notes || notes === true) {
    return [envelopeError('blocking', 'Missing required argument: --notes'), 2];
  }

  // Grade arg validation (presence + value); pairing-with-action enforced after action validated.
  let grade = null;
  const gradeRaw = args.grade;
  if (gradeRaw !== undefined && gradeRaw !== true) {
    const n = parseInt(gradeRaw, 10);
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      return [envelopeError('blocking', `Invalid --grade '${gradeRaw}'. Must be integer in [1,4].`), 2];
    }
    grade = n;
  } else if (gradeRaw === true) {
    return [envelopeError('blocking', 'Invalid --grade: missing value'), 2];
  }

  if ((action === 'taught' || action === 'reviewed') && grade === null) {
    return [envelopeError('blocking', `--grade is required for action '${action}'`), 2];
  }
  if (action === 'skipped_not_due' && grade !== null) {
    return [envelopeError('blocking', "grade not allowed for skipped_not_due"), 2];
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
  if (phase !== 1 && phase !== 2 && phase !== 3) {
    return [
      envelopeError('blocking', `record-concept requires current_phase ∈ {1,2,3} (got ${phase}).`),
      2,
    ];
  }
  const phaseState = (state.phases || {})[phase] || (state.phases || {})[String(phase)];
  if (!phaseState) {
    return [envelopeError('blocking', `phase ${phase} not started`), 2];
  }

  // Locate the current scheduled unit for this phase.
  let scheduledConcepts;
  let unitArrayKey;
  let unitIndex;
  if (phase === 1) {
    const concerns = Array.isArray(phaseState.concerns) ? phaseState.concerns : [];
    unitIndex = phaseState.current_concern_index;
    if (unitIndex === null || unitIndex === undefined || unitIndex >= concerns.length) {
      return [envelopeError('blocking', 'no current concern (current_concern_index out of range)'), 2];
    }
    const concern = concerns[unitIndex];
    if (concern.id !== unitId) {
      return [
        envelopeError('blocking', `unit_id '${unitId}' does not match current scheduled unit '${concern.id}'`),
        2,
      ];
    }
    scheduledConcepts = Array.isArray(concern.concepts) ? concern.concepts : [];
    unitArrayKey = 'concerns';
  } else {
    const components = Array.isArray(phaseState.components) ? phaseState.components : [];
    unitIndex = phaseState.current_component_index;
    if (unitIndex === null || unitIndex === undefined || unitIndex >= components.length) {
      return [envelopeError('blocking', 'no current component (current_component_index out of range)'), 2];
    }
    const comp = components[unitIndex];
    if (comp.id !== unitId) {
      return [
        envelopeError('blocking', `unit_id '${unitId}' does not match current scheduled unit '${comp.id}'`),
        2,
      ];
    }
    const seedIds = Array.isArray(comp.concepts_seed) ? comp.concepts_seed : [];
    const proposedIds = Array.isArray(comp.concepts_proposed) ? comp.concepts_proposed.map(p => p.id) : [];
    scheduledConcepts = [...seedIds, ...proposedIds];
    unitArrayKey = 'components';
  }

  if (!scheduledConcepts.includes(conceptId)) {
    return [
      envelopeError('blocking', `concept_id '${conceptId}' not scheduled in current unit '${unitId}'`),
      2,
    ];
  }

  // All validation passed — mutate.
  const checkedEntry = {
    concept_id: conceptId,
    concern_or_component: unitId,
    phase,
    grade,
    action,
    timestamp: isoNow(),
  };
  const existingChecked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const newConceptsChecked = [...existingChecked, checkedEntry];

  let newPhases = { ...(state.phases || {}) };
  if (phase === 2 || phase === 3) {
    const components = Array.isArray(phaseState.components) ? phaseState.components : [];
    const comp = components[unitIndex];
    const existingCompChecked = Array.isArray(comp.concepts_checked) ? comp.concepts_checked : [];
    const newComp = { ...comp, concepts_checked: [...existingCompChecked, conceptId] };
    const newComponents = components.slice();
    newComponents[unitIndex] = newComp;
    newPhases[phase] = { ...phaseState, components: newComponents };
  }

  const updated = {
    ...state,
    phases: newPhases,
    concepts_checked: newConceptsChecked,
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'professor_action',
      session_id: state.session_id,
      concept_id: conceptId,
      action,
      grade,
      notes,
      phase,
      unit_id: unitId,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ recorded: true }), 0];
}

module.exports = (register) => register('record-concept', handler);
module.exports.handler = handler;
