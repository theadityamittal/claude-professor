'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, parseArgs, envelope, envelopeError } = require('./utils.js');

const SESSION_FILE = '.session-state.json';

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function create(sessionDir, feature, branch) {
  ensureDir(sessionDir);
  const state = {
    version: 2,
    session_id: crypto.randomUUID(),
    feature,
    branch,
    started: isoNow(),
    last_updated: isoNow(),
    phase: 'context_loading',
    architecture_loaded: false,
    architecture_components_read: [],
    requirements: { functional: [], non_functional: {} },
    concepts_checked: [],
    decisions: [],
    design_options_proposed: [],
    chosen_option: null,
    context_snapshot: null,
    teaching_schedule: [],
    checkpoint_history: [],
    circuit_breaker: 'closed',
  };
  writeJSON(getSessionPath(sessionDir), state);
  return { success: true, session_id: state.session_id, feature, branch };
}

function load(sessionDir) {
  const state = readJSON(getSessionPath(sessionDir));
  if (!state) return { exists: false };
  return state;
}

function update(sessionDir, updates) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to update');

  const updatedState = {
    ...state,
    ...(updates.phase && { phase: updates.phase }),
    ...(updates.contextSnapshot && { context_snapshot: updates.contextSnapshot }),
    ...(updates.chosenOption && { chosen_option: updates.chosenOption }),
    ...(updates.architectureLoaded && { architecture_loaded: updates.architectureLoaded === 'true' }),
    last_updated: isoNow(),
  };

  writeJSON(sessionPath, updatedState);
  return { success: true };
}

function addConcept(sessionDir, conceptData) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session');

  const existing = state.concepts_checked.find(c => c.concept_id === conceptData.conceptId);
  if (existing) return { action: 'already_checked' };

  state.concepts_checked = [...state.concepts_checked, {
    concept_id: conceptData.conceptId,
    domain: conceptData.domain,
    status: conceptData.status,
    grade: conceptData.grade ? parseInt(conceptData.grade, 10) : null,
    phase: conceptData.phase,
    context: conceptData.context,
  }];
  state.last_updated = isoNow();

  writeJSON(sessionPath, state);
  return { action: 'added' };
}

function clear(sessionDir) {
  const sessionPath = getSessionPath(sessionDir);
  try {
    fs.unlinkSync(sessionPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { success: true };
}

function finish(sessionDir) {
  const sessionPath = getSessionPath(sessionDir);
  const state = readJSON(sessionPath);
  if (!state) throw new Error('No active session to finish');

  const warnings = [];

  const schedule = Array.isArray(state.teaching_schedule) ? state.teaching_schedule : [];
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  const checkedIds = new Set(checked.map(c => c.concept_id));
  const untaught = schedule.filter(c => !checkedIds.has(c.concept_id));
  if (untaught.length > 0) {
    warnings.push(`${untaught.length} concepts scheduled but not taught: ${untaught.map(c => c.concept_id).join(', ')}`);
  }

  const history = Array.isArray(state.checkpoint_history) ? state.checkpoint_history : [];
  const blockedSteps = new Set(
    history.filter(h => h.result === 'blocked').map(h => h.step)
  );
  const passedSteps = new Set(
    history.filter(h => h.result === 'passed').map(h => h.step)
  );
  const unresolvedCount = [...blockedSteps].filter(s => !passedSteps.has(s)).length;
  if (unresolvedCount > 0) {
    warnings.push(`${unresolvedCount} checkpoints never resolved`);
  }

  if (state.circuit_breaker === 'open') {
    warnings.push('Session completed with open circuit breaker');
  }

  const updatedState = {
    ...state,
    phase: 'complete',
    last_updated: isoNow(),
  };
  writeJSON(sessionPath, updatedState);

  return { verified: true, warnings };
}


if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  function validateArgs(required, usage) {
    const missing = required.filter(k => !args[k]);
    if (missing.length > 0) {
      process.stderr.write(`Missing required arguments: ${missing.join(', ')}\n`);
      process.stderr.write(`Usage: node session.js ${usage}\n`);
      process.exit(1);
    }
  }

  try {
    let result;
    switch (mode) {
      case 'create':
        validateArgs(['session-dir', 'feature', 'branch'], 'create --session-dir PATH --feature NAME --branch NAME');
        result = create(args['session-dir'], args.feature, args.branch);
        break;
      case 'load':
        validateArgs(['session-dir'], 'load --session-dir PATH');
        result = load(args['session-dir']);
        break;
      case 'update':
        validateArgs(['session-dir'], 'update --session-dir PATH [--phase PHASE] [--context-snapshot TEXT]');
        result = update(args['session-dir'], {
          phase: args.phase,
          contextSnapshot: args['context-snapshot'],
          chosenOption: args['chosen-option'],
          architectureLoaded: args['architecture-loaded'],
        });
        break;
      case 'add-concept':
        validateArgs(['session-dir', 'concept-id'], 'add-concept --session-dir PATH --concept-id ID [--domain D] [--status S] [--grade G]');
        result = addConcept(args['session-dir'], {
          conceptId: args['concept-id'],
          domain: args.domain,
          status: args.status,
          grade: args.grade,
          phase: args.phase,
          context: args.context,
        });
        break;
      case 'clear':
        validateArgs(['session-dir'], 'clear --session-dir PATH');
        result = clear(args['session-dir']);
        break;
      case 'finish':
        validateArgs(['session-dir'], 'finish --session-dir PATH');
        result = finish(args['session-dir']);
        break;
      default:
        process.stderr.write(`Unknown mode: ${mode}. Use create, load, update, add-concept, finish, or clear.\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(envelope(result), null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err.message)) + '\n');
    process.exit(1);
  }
}

module.exports = { create, load, update, addConcept, finish, clear };
