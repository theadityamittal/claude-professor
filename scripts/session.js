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

  if (updates.phase) state.phase = updates.phase;
  if (updates.contextSnapshot) state.context_snapshot = updates.contextSnapshot;
  if (updates.chosenOption) state.chosen_option = updates.chosenOption;
  if (updates.architectureLoaded) state.architecture_loaded = updates.architectureLoaded === 'true';
  state.last_updated = isoNow();

  writeJSON(sessionPath, state);
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

if (require.main === module) {
  const mode = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  try {
    let result;
    switch (mode) {
      case 'create':
        result = create(args['session-dir'], args.feature, args.branch);
        break;
      case 'load':
        result = load(args['session-dir']);
        break;
      case 'update':
        result = update(args['session-dir'], {
          phase: args.phase,
          contextSnapshot: args['context-snapshot'],
          chosenOption: args['chosen-option'],
          architectureLoaded: args['architecture-loaded'],
        });
        break;
      case 'add-concept':
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
        result = clear(args['session-dir']);
        break;
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

module.exports = { create, load, update, addConcept, clear };
