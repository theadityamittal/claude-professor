'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');

const NOVEL_DECISIONS = new Set(['accept_novel', 'novel']);

/**
 * Implements `whiteboard.js register-components` per spec §5.1.5.
 *
 * Validates the full pre-scheduled component plan up-front and writes
 * `phases.<N>.components` with the complete structure plus
 * `current_component_index: 0`. Appends a `components_selected` log event.
 *
 * @param {object} args
 * @returns {[object, number]}
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const rawJson = args['components-json'];
  if (!rawJson || rawJson === true) {
    return [envelopeError('blocking', 'Missing required argument: --components-json'), 2];
  }

  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch (err) {
    return [envelopeError('blocking', `Invalid --components-json: ${err.message}`), 2];
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.components)) {
    return [envelopeError('blocking', '--components-json must be {"components": [...]}'), 2];
  }
  if (payload.components.length === 0) {
    return [envelopeError('blocking', 'components array must be non-empty'), 2];
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
      envelopeError('blocking', `register-components only valid in phase 2 or 3 (current_phase=${phase}).`),
      2,
    ];
  }
  const phaseState = (state.phases || {})[phase] || (state.phases || {})[String(phase)];
  if (!phaseState || phaseState.status !== 'in_progress') {
    return [
      envelopeError(
        'blocking',
        `phase ${phase} must be in_progress (got status=${phaseState ? phaseState.status : 'undefined'}).`
      ),
      2,
    ];
  }

  const registryPath = args['registry-path'] || DEFAULT_REGISTRY_PATH;
  let registry;
  try {
    registry = readJSON(registryPath);
  } catch (err) {
    return [envelopeError('fatal', `cannot read registry at ${registryPath}: ${err.message}`), 1];
  }
  if (!Array.isArray(registry)) {
    return [envelopeError('blocking', `registry at ${registryPath} must be a top-level array`), 2];
  }
  const registryIds = new Set(registry.map(r => r && r.concept_id).filter(Boolean));

  // Validate every component up-front.
  const resolved = [];
  const seenComponentIds = new Set();
  let totalConcepts = 0;
  let novelL2Count = 0;

  for (let i = 0; i < payload.components.length; i++) {
    const c = payload.components[i];
    if (!c || typeof c !== 'object') {
      return [envelopeError('blocking', `components[${i}] must be an object`), 2];
    }
    const id = c.id;
    if (typeof id !== 'string' || !id) {
      return [envelopeError('blocking', `components[${i}].id must be a non-empty string`), 2];
    }
    if (seenComponentIds.has(id)) {
      return [envelopeError('blocking', `components[${i}].id duplicate: ${id}`), 2];
    }
    seenComponentIds.add(id);

    const seeds = Array.isArray(c.concepts_seed) ? c.concepts_seed : [];
    const proposed = Array.isArray(c.concepts_proposed) ? c.concepts_proposed : [];
    const decisions = Array.isArray(c.L2_decisions) ? c.L2_decisions : [];

    // Validate seeds.
    for (const s of seeds) {
      if (typeof s !== 'string' || !s) {
        return [envelopeError('blocking', `component '${id}' has invalid concepts_seed entry: ${JSON.stringify(s)}`), 2];
      }
      if (!registryIds.has(s)) {
        return [envelopeError('blocking', `component '${id}' seed not in registry: ${s}`), 2];
      }
    }

    // Validate proposed.parent in registry.
    const proposedIds = [];
    for (const p of proposed) {
      if (!p || typeof p !== 'object') {
        return [envelopeError('blocking', `component '${id}' has invalid concepts_proposed entry: ${JSON.stringify(p)}`), 2];
      }
      if (typeof p.id !== 'string' || !p.id) {
        return [envelopeError('blocking', `component '${id}' concepts_proposed missing id`), 2];
      }
      if (typeof p.parent !== 'string' || !p.parent) {
        return [envelopeError('blocking', `component '${id}' concepts_proposed.${p.id} missing parent`), 2];
      }
      if (!registryIds.has(p.parent)) {
        return [
          envelopeError('blocking', `component '${id}' proposed '${p.id}' parent not in registry: ${p.parent}`),
          2,
        ];
      }
      proposedIds.push(p.id);
    }

    // Validate L2_decisions covers every proposed entry.
    const decisionByProposed = new Map();
    for (const d of decisions) {
      if (!d || typeof d !== 'object' || typeof d.proposed !== 'string') {
        return [envelopeError('blocking', `component '${id}' has invalid L2_decisions entry: ${JSON.stringify(d)}`), 2];
      }
      decisionByProposed.set(d.proposed, d);
    }
    for (const pid of proposedIds) {
      if (!decisionByProposed.has(pid)) {
        return [
          envelopeError('blocking', `component '${id}' L2_decisions missing entry for proposed: ${pid}`),
          2,
        ];
      }
    }
    // Every L2 decision proposed must reference a proposed entry.
    for (const d of decisions) {
      if (!proposedIds.includes(d.proposed)) {
        return [
          envelopeError('blocking', `component '${id}' L2_decisions references unknown proposed: ${d.proposed}`),
          2,
        ];
      }
      if (NOVEL_DECISIONS.has(d.decision)) novelL2Count++;
    }

    totalConcepts += seeds.length + proposedIds.length;
    resolved.push({
      id,
      concepts_seed: seeds.slice(),
      concepts_proposed: proposed.map(p => ({ ...p })),
      L2_decisions: decisions.map(d => ({ ...d })),
      concepts_checked: [],
      status: 'in_progress',
    });
  }

  // All inputs valid — mutate state.
  const newPhaseState = {
    ...phaseState,
    components: resolved,
    current_component_index: 0,
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
      event: 'components_selected',
      session_id: state.session_id,
      phase,
      components: resolved.map(r => r.id),
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [
    envelope({
      components_count: resolved.length,
      total_concepts: totalConcepts,
      novel_l2_count: novelL2Count,
    }),
    0,
  ];
}

module.exports = (register) => register('register-components', handler);
module.exports.handler = handler;
