'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJSON, writeJSON, ensureDir, isoNow, parseArgs } = require('./utils.js');

const SESSION_FILE = '.session-state.json';

function getSessionPath(sessionDir) {
  return path.join(sessionDir, SESSION_FILE);
}

function create(sessionDir, feature, branch) {
  ensureDir(sessionDir);
  const state = {
    version: 1,
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
  };
  writeJSON(getSessionPath(sessionDir), state);
  return { success: true, feature, branch };
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

function gate(sessionDir, require) {
  if (require !== 'concepts') {
    process.stderr.write(`Unknown --require value: "${require}". Supported: concepts\n`);
    process.exit(1);
  }

  const state = readJSON(getSessionPath(sessionDir));

  if (!state) {
    process.stdout.write(JSON.stringify({
      gate: 'open',
      warning: 'no active session found',
    }, null, 2) + '\n');
    return;
  }

  if (state.concepts_checked.length === 0) {
    process.stdout.write(JSON.stringify({
      gate: 'blocked',
      reason: 'concepts_checked is empty — run concept-agent before proceeding',
    }, null, 2) + '\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ gate: 'open' }, null, 2) + '\n');
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
      case 'gate':
        validateArgs(['session-dir', 'require'], 'gate --session-dir PATH --require concepts');
        gate(args['session-dir'], args.require);
        return;
      default:
        process.stderr.write(`Unknown mode: ${mode}. Use create, load, update, add-concept, or clear.\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

module.exports = { create, load, update, addConcept, clear, gate };
