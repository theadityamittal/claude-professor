'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

/**
 * Implements `whiteboard.js record-discussion` per spec §5.1.9.
 *
 * Validates phase/unit/summary/open-questions up-front, then appends to
 * `phases.<current_phase>.discussions` and emits a `discussion_recorded` log.
 *
 * @param {object} args
 * @returns {[object, number]}
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const unitId = args['unit-id'];
  if (!unitId || unitId === true) {
    return [envelopeError('blocking', 'Missing required argument: --unit-id'), 2];
  }
  const summary = args.summary;
  if (!summary || summary === true) {
    return [envelopeError('blocking', 'Missing required argument: --summary'), 2];
  }
  if (typeof summary !== 'string' || summary.trim() === '') {
    return [envelopeError('blocking', 'summary must be a non-empty string'), 2];
  }

  let openQuestions = [];
  const oqRaw = args['open-questions'];
  if (oqRaw !== undefined && oqRaw !== true && oqRaw !== '') {
    try {
      const parsed = JSON.parse(oqRaw);
      if (!Array.isArray(parsed)) {
        return [envelopeError('blocking', '--open-questions must be a JSON array'), 2];
      }
      openQuestions = parsed;
    } catch (err) {
      return [envelopeError('blocking', `Invalid --open-questions JSON: ${err.message}`), 2];
    }
  } else if (oqRaw === true) {
    return [envelopeError('blocking', 'Invalid --open-questions: missing value'), 2];
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
      envelopeError('blocking', `record-discussion requires current_phase ∈ {1,2,3} (got ${phase}).`),
      2,
    ];
  }
  const phaseState = (state.phases || {})[phase] || (state.phases || {})[String(phase)];
  if (!phaseState) {
    return [envelopeError('blocking', `phase ${phase} not started`), 2];
  }

  // Validate unit matches the current scheduled unit.
  let currentUnitId;
  if (phase === 1) {
    const concerns = Array.isArray(phaseState.concerns) ? phaseState.concerns : [];
    const idx = phaseState.current_concern_index;
    if (idx === null || idx === undefined || idx >= concerns.length) {
      return [envelopeError('blocking', 'no current concern (current_concern_index out of range)'), 2];
    }
    currentUnitId = concerns[idx].id;
  } else {
    const components = Array.isArray(phaseState.components) ? phaseState.components : [];
    const idx = phaseState.current_component_index;
    if (idx === null || idx === undefined || idx >= components.length) {
      return [envelopeError('blocking', 'no current component (current_component_index out of range)'), 2];
    }
    currentUnitId = components[idx].id;
  }
  if (currentUnitId !== unitId) {
    return [
      envelopeError('blocking', `unit_id '${unitId}' does not match current scheduled unit '${currentUnitId}'`),
      2,
    ];
  }

  const discussionEntry = {
    unit_id: unitId,
    summary,
    open_questions: openQuestions,
    timestamp: isoNow(),
  };
  const existingDiscussions = Array.isArray(phaseState.discussions) ? phaseState.discussions : [];
  const newPhaseState = {
    ...phaseState,
    discussions: [...existingDiscussions, discussionEntry],
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
      event: 'discussion_recorded',
      session_id: state.session_id,
      unit_id: unitId,
      summary,
      open_questions: openQuestions,
      phase,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ recorded: true }), 0];
}

module.exports = (register) => register('record-discussion', handler);
module.exports.handler = handler;
