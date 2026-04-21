'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { envelope, envelopeError, readJSON, expandHome } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const LOOKUP_SCRIPT = path.resolve(__dirname, '..', 'lookup.js');
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');
const DEFAULT_PROFILE_DIR = expandHome('~/.claude/professor/concepts');

function fetchConceptState(conceptId, registryPath, profileDir) {
  const r = spawnSync(
    'node',
    [
      LOOKUP_SCRIPT,
      'concept-state',
      '--concept', conceptId,
      '--registry-path', registryPath,
      '--profile-dir', profileDir,
    ],
    { encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    throw new Error(
      `lookup.js concept-state ${conceptId} failed (exit=${r.status}): ${r.stderr || r.stdout}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    throw new Error(`lookup.js concept-state ${conceptId} stdout not JSON: ${err.message}`);
  }
  if (!parsed || parsed.status !== 'ok' || !parsed.data) {
    throw new Error(`lookup.js concept-state ${conceptId} bad envelope: ${r.stdout}`);
  }
  return parsed.data;
}

/**
 * Implements `whiteboard.js next-component` per spec §5.1.7.
 *
 * Read-only on state (only mutation: appending log event); does NOT advance
 * `current_component_index`. Flattens `concepts_seed + concepts_proposed.id`
 * into a single ordered concept list.
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
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
  if (phase !== 2 && phase !== 3) {
    return [
      envelopeError('blocking', `next-component only valid in phase 2 or 3 (current_phase=${phase}).`),
      2,
    ];
  }
  const phaseState = (state.phases || {})[phase] || (state.phases || {})[String(phase)];
  if (!phaseState) {
    return [envelopeError('blocking', `phase ${phase} not started`), 2];
  }
  const components = Array.isArray(phaseState.components) ? phaseState.components : [];
  if (components.length === 0) {
    return [
      envelopeError('blocking', 'no components scheduled — call register-components'),
      2,
    ];
  }

  const idx = phaseState.current_component_index;
  if (idx === null || idx === undefined || idx >= components.length) {
    return [envelope({ done: true, components_completed: components.length }), 0];
  }

  const comp = components[idx];
  const seedIds = Array.isArray(comp.concepts_seed) ? comp.concepts_seed : [];
  const proposedEntries = Array.isArray(comp.concepts_proposed) ? comp.concepts_proposed : [];
  const proposedIds = proposedEntries.map(p => p.id);
  const conceptIds = [...seedIds, ...proposedIds];

  const registryPath = args['registry-path'] || DEFAULT_REGISTRY_PATH;
  const profileDirRaw = args['profile-dir'] || DEFAULT_PROFILE_DIR;
  const profileDir = expandHome(profileDirRaw);

  const conceptResults = [];
  for (const cid of conceptIds) {
    let cs;
    try {
      cs = fetchConceptState(cid, registryPath, profileDir);
    } catch (err) {
      return [envelopeError('fatal', err.message), 1];
    }
    conceptResults.push({
      concept_id: cs.concept_id,
      registry_meta: cs.registry_meta,
      fsrs_status: cs.fsrs_status,
      profile_path: cs.profile_path,
    });
  }

  try {
    appendLog(sessionDir, {
      event: 'next_component',
      session_id: state.session_id,
      phase,
      component_id: comp.id,
      concepts: conceptIds.slice(),
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [
    envelope({
      done: false,
      component_id: comp.id,
      concepts: conceptResults,
    }),
    0,
  ];
}

module.exports = (register) => register('next-component', handler);
module.exports.handler = handler;
