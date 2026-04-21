'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON } = require('../utils.js');
const { appendLog, deleteLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

function deleteState(sessionDir) {
  try {
    fs.unlinkSync(path.join(sessionDir, STATE_FILE));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Implements `whiteboard.js finish` per spec §5.1.15.
 *
 * Validates phase 4 completion (or --abort escape hatch), optionally appends
 * `session_finish` event (only when keeping the log), then deletes session files.
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const keepLog = args['keep-log'] === true;
  const abort = args.abort === true;

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
  const phase4 = phases[4] || phases['4'];
  const phase4Complete = phase4 && phase4.status === 'complete';

  if (!phase4Complete && !abort) {
    return [
      envelopeError(
        'blocking',
        'session not complete (phases[4].status != "complete"); pass --abort to exit early without finishing properly'
      ),
      2,
    ];
  }

  const outcome = abort && !phase4Complete ? 'aborted' : 'completed';

  // Only append session_finish when we're keeping the log; otherwise it would
  // be deleted along with the rest and the append would be wasted I/O.
  if (keepLog) {
    try {
      appendLog(sessionDir, {
        event: 'session_finish',
        session_id: state.session_id,
        outcome,
      });
    } catch (err) {
      return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
    }
  }

  // Delete state file unconditionally; delete log only if not keeping it.
  try {
    deleteState(sessionDir);
  } catch (err) {
    return [envelopeError('blocking', `cannot delete session state: ${err.message}`), 2];
  }
  if (!keepLog) {
    try {
      deleteLog(sessionDir);
    } catch (err) {
      return [envelopeError('blocking', `cannot delete session log: ${err.message}`), 2];
    }
  }

  return [envelope({ outcome, kept_log: keepLog }), 0];
}

module.exports = (register) => register('finish', handler);
module.exports.handler = handler;
