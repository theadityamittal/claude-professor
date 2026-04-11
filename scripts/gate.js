'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSON, writeJSON, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');

const SESSION_FILE = '.session-state.json';
const LOG_FILE = '.session-log.jsonl';

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function getLogPath(sessionDir) {
  return path.join(sessionDir, LOG_FILE);
}

function schedule(sessionDir, phase, concepts) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const existing = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const updated = [...existing, ...concepts];

  const updatedState = { ...state, teaching_schedule: updated };
  writeJSON(sessionPath, updatedState);

  return { scheduled: concepts.length, total: updated.length };
}

function checkpoint(sessionDir, step) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const schedule = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const checkedIds = new Set(checked.map(c => c.concept_id));

  const assignedToStep = schedule.filter(c => c.step === step);
  const missing = assignedToStep
    .filter(c => !checkedIds.has(c.concept_id))
    .map(c => c.concept_id);

  let result;
  if (state.circuit_breaker === 'open') {
    result = 'degraded';
  } else if (missing.length > 0) {
    result = 'blocked';
  } else {
    result = 'passed';
  }

  const entry = { step, result, timestamp: isoNow() };
  const history = Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [];
  const updatedState = { ...state, checkpoint_history: [...history, entry] };
  writeJSON(sessionPath, updatedState);

  return { result, missing };
}

function log(sessionDir, entry) {
  const logPath = getLogPath(sessionDir);
  const line = JSON.stringify({ timestamp: isoNow(), ...entry }) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');

  return { logged: true };
}

function status(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) throw new Error('No active session');

  return {
    schedule: Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [],
    checkpoints: Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [],
    circuit: state.circuit_breaker || 'closed',
  };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function validateArgs(required, usage) {
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(JSON.stringify(envelopeError('blocking', `Missing required arguments: ${missing.join(', ')}`)) + '\n');
      process.stderr.write(`Usage: node gate.js ${usage}\n`);
      process.exit(1);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'schedule': {
        validateArgs(['session-dir', 'phase', 'concepts'], 'schedule --session-dir PATH --phase N --concepts JSON');
        const concepts = JSON.parse(args.concepts);
        result = schedule(args['session-dir'], parseInt(args.phase, 10), concepts);
        break;
      }
      case 'checkpoint':
        validateArgs(['session-dir', 'step'], 'checkpoint --session-dir PATH --step STEP_KEY');
        result = checkpoint(args['session-dir'], args.step);
        break;
      case 'log': {
        validateArgs(['session-dir', 'entry'], 'log --session-dir PATH --entry JSON');
        const entry = JSON.parse(args.entry);
        result = log(args['session-dir'], entry);
        break;
      }
      case 'status':
        validateArgs(['session-dir'], 'status --session-dir PATH');
        result = status(args['session-dir']);
        break;
      default:
        process.stderr.write(JSON.stringify(envelopeError('blocking', `Unknown mode: ${mode}. Use schedule, checkpoint, log, or status.`)) + '\n');
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { schedule, checkpoint, log, status };
