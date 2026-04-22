'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE = '.session-log.jsonl';

function logPath(sessionDir) {
  return path.join(sessionDir, LOG_FILE);
}

/**
 * Append a single event line to .session-log.jsonl.
 * Adds a `timestamp` field if not provided. POSIX-atomic for short lines (<PIPE_BUF).
 *
 * @param {string} sessionDir
 * @param {object} event
 */
function appendLog(sessionDir, event) {
  const enriched = { timestamp: new Date().toISOString(), ...event };
  // Re-set timestamp last so caller cannot accidentally pin it (unless explicit).
  if (!event.timestamp) enriched.timestamp = new Date().toISOString();
  fs.appendFileSync(logPath(sessionDir), JSON.stringify(enriched) + '\n', 'utf-8');
}

/**
 * Read .session-log.jsonl and parse each line as JSON.
 * Skips malformed lines (returns warnings array alongside events).
 *
 * @param {string} sessionDir
 * @returns {{events: object[], warnings: string[], exists: boolean}}
 */
function readLog(sessionDir) {
  const p = logPath(sessionDir);
  if (!fs.existsSync(p)) return { events: [], warnings: [], exists: false };
  const raw = fs.readFileSync(p, 'utf-8');
  const events = [];
  const warnings = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      warnings.push(`line ${i + 1}: malformed JSON skipped (${err.message})`);
    }
  }
  return { events, warnings, exists: true };
}

function deleteLog(sessionDir) {
  try {
    fs.unlinkSync(logPath(sessionDir));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { appendLog, readLog, deleteLog, logPath, LOG_FILE };
