'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, ensureDir } = require('../utils.js');
const session = require('../session.js');
const { appendLog, deleteLog, logPath } = require('./_log.js');

const STATE_FILE = '.session-state.json';

/**
 * Implements `whiteboard.js init-session` per spec §5.1.1.
 * @param {object} args - parsed CLI args
 * @returns {[object, number]} [envelope, exitCode]
 */
function handler(args) {
  const task = args.task;
  const sessionDir = args['session-dir'];
  const forceNew = args['force-new'] === true;
  const concernsPath = args['concerns-path'];

  if (!task || task === true) {
    return [envelopeError('blocking', 'Missing required argument: --task'), 2];
  }
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }

  const statePath = path.join(sessionDir, STATE_FILE);
  const stateExists = fs.existsSync(statePath);

  if (stateExists && !forceNew) {
    return [
      envelopeError('blocking', 'Session state exists. Use --force-new to discard or call resume-session.'),
      2,
    ];
  }

  if (forceNew && stateExists) {
    try {
      fs.unlinkSync(statePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        return [envelopeError('blocking', `Cannot remove existing state file: ${err.message}`), 2];
      }
    }
    deleteLog(sessionDir);
  }

  // Ensure the session directory exists / is writable. Surface filesystem
  // errors as `blocking` so callers can recover (per spec §5.1.1).
  try {
    ensureDir(sessionDir);
  } catch (err) {
    return [envelopeError('blocking', `session-dir not writable: ${err.message}`), 2];
  }

  // Delegate state creation to session.js (single-ownership per task spec §2.5).
  let created;
  try {
    created = session.create(sessionDir, task, concernsPath);
  } catch (err) {
    if (err && err.fatal) return [envelopeError('fatal', err.message), 1];
    if (err && err.blocking) return [envelopeError('blocking', err.message), 2];
    // Permission/EROFS errors from writeJSON bubble up as plain Errors.
    if (err && (err.code === 'EACCES' || err.code === 'EROFS' || err.code === 'EPERM')) {
      return [envelopeError('blocking', `session-dir not writable: ${err.message}`), 2];
    }
    return [envelopeError('fatal', err && err.message ? err.message : String(err)), 1];
  }

  // Append session_start event to log. If log write fails, surface as blocking
  // (callers can fix dir perms and retry).
  try {
    appendLog(sessionDir, {
      event: 'session_start',
      session_id: created.session_id,
      task,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log at ${logPath(sessionDir)}: ${err.message}`), 2];
  }

  return [
    envelope({
      session_id: created.session_id,
      session_dir: sessionDir,
      task,
      schema_version: 5,
    }),
    0,
  ];
}

module.exports = (register) => register('init-session', handler);
module.exports.handler = handler;
