'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSON, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');

const SESSION_FILE = '.session-state.json';
const LOG_FILE = '.session-log.jsonl';
const VALID_STEPS = new Set([1, 2, 3, 4]);

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function getLogPath(sessionDir) {
  return path.join(sessionDir, LOG_FILE);
}

/**
 * Collect scheduled concept ids for a given phase from v5 state.
 * @param {object} phaseState - state.phases[step]
 * @param {number} step - 1 | 2 | 3 | 4
 * @returns {string[]}
 */
function scheduledConceptIds(phaseState, step) {
  if (!phaseState) return [];
  if (step === 1) {
    const concerns = Array.isArray(phaseState.concerns) ? phaseState.concerns : [];
    return concerns.flatMap(c => Array.isArray(c.concepts) ? c.concepts : []);
  }
  const components = Array.isArray(phaseState.components) ? phaseState.components : [];
  return components.flatMap(c => [
    ...(Array.isArray(c.concepts_seed) ? c.concepts_seed : []),
    ...(Array.isArray(c.concepts_proposed) ? c.concepts_proposed.map(p => p.id).filter(Boolean) : []),
  ]);
}

/**
 * Audit-only checkpoint. Does NOT mutate state.
 * Compares scheduled concepts for phase N against concepts_checked filtered by phase===N.
 *
 * @param {string} sessionDir
 * @param {number} step - 1 | 2 | 3 | 4
 * @returns {{ result: 'passed'|'blocked', missing: string[], scheduled_count: number, checked_count: number, timestamp: string }}
 */
function checkpoint(sessionDir, step) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) throw new Error('No active session: .session-state.json not found');

  const phases = state.phases || {};
  const phaseState = phases[String(step)];
  const scheduled = scheduledConceptIds(phaseState, step);

  const checkedEntries = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const checkedForPhase = checkedEntries.filter(c => c && c.phase === step);
  const checkedIds = new Set(checkedForPhase.map(c => c.concept_id));

  const missing = scheduled.filter(id => !checkedIds.has(id));
  const result = missing.length === 0 ? 'passed' : 'blocked';

  return {
    result,
    missing,
    scheduled_count: scheduled.length,
    checked_count: checkedForPhase.length,
    timestamp: isoNow(),
  };
}

function log(sessionDir, entry) {
  const logPath = getLogPath(sessionDir);
  const line = JSON.stringify({ timestamp: isoNow(), ...entry }) + '\n';
  fs.appendFileSync(logPath, line, 'utf-8');
  return { logged: true };
}

function status(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) throw new Error('No active session: .session-state.json not found');

  return {
    phases: state.phases || {},
    concepts_checked: Array.isArray(state.concepts_checked) ? state.concepts_checked : [],
  };
}

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function validateArgs(required, usage) {
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(JSON.stringify(envelopeError('blocking', `Missing required arguments: ${missing.join(', ')}. Usage: node gate.js ${usage}`)) + '\n');
      process.exit(1);
    }
  }

  function rejectUnknownFlags(allowed, subcommand) {
    const known = new Set(allowed);
    const unknown = Object.keys(args).filter(k => !known.has(k));
    if (unknown.length > 0) {
      process.stderr.write(JSON.stringify(envelopeError('blocking', `Unknown flag(s) for ${subcommand}: ${unknown.map(k => '--' + k).join(', ')}`)) + '\n');
      process.exit(1);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'checkpoint': {
        rejectUnknownFlags(['session-dir', 'step'], 'checkpoint');
        validateArgs(['session-dir', 'step'], 'checkpoint --session-dir PATH --step <1|2|3|4>');
        const step = parseInt(args.step, 10);
        if (!VALID_STEPS.has(step)) {
          process.stderr.write(JSON.stringify(envelopeError('blocking', `Invalid --step: ${args.step}. Must be one of 1, 2, 3, 4.`)) + '\n');
          process.exit(1);
        }
        result = checkpoint(args['session-dir'], step);
        break;
      }
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
      case 'schedule':
        process.stderr.write(JSON.stringify(envelopeError('blocking', 'Subcommand `schedule` is removed in v5. Use `whiteboard.js register-*` instead.')) + '\n');
        process.exit(1);
        break; // unreachable
      default:
        process.stderr.write(JSON.stringify(envelopeError('blocking', `Unknown subcommand: ${mode}. Use checkpoint, log, or status.`)) + '\n');
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { checkpoint, log, status, scheduledConceptIds };
