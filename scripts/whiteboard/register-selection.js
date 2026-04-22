'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, writeJSON, isoNow } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const DEFAULT_CONCERNS_PATH = path.resolve(__dirname, '..', '..', 'data', 'concerns.json');
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'data', 'concepts_registry.json');

/**
 * Implements `whiteboard.js register-selection` per spec §5.1.4.
 *
 * Validates the supplied concern selection (catalog + proposed) up-front and,
 * only if every entry passes, writes `phases.1.concerns` plus
 * `current_concern_index: 0` and appends a `concerns_selected` log event.
 *
 * @param {object} args - parsed CLI args
 * @returns {[object, number]} [envelope, exitCode]
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const rawJson = args['concerns-json'];
  if (!rawJson || rawJson === true) {
    return [envelopeError('blocking', 'Missing required argument: --concerns-json'), 2];
  }

  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch (err) {
    return [envelopeError('blocking', `Invalid --concerns-json: ${err.message}`), 2];
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.concerns)) {
    return [envelopeError('blocking', '--concerns-json must be {"concerns": [...]}'), 2];
  }
  if (payload.concerns.length === 0) {
    return [envelopeError('blocking', 'concerns array must be non-empty'), 2];
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

  if (state.current_phase !== 1) {
    return [
      envelopeError(
        'blocking',
        `register-selection only valid in phase 1 (current_phase=${state.current_phase}).`
      ),
      2,
    ];
  }
  const phase1 = (state.phases || {})[1] || (state.phases || {})['1'];
  if (!phase1 || phase1.status !== 'in_progress') {
    return [
      envelopeError(
        'blocking',
        `phase 1 must be in_progress (got status=${phase1 ? phase1.status : 'undefined'}).`
      ),
      2,
    ];
  }

  // Load concerns catalog + registry up-front (validate all inputs before any mutation).
  const concernsPath = args['concerns-path'] || DEFAULT_CONCERNS_PATH;
  const registryPath = args['registry-path'] || DEFAULT_REGISTRY_PATH;

  let catalogRaw;
  try {
    catalogRaw = readJSON(concernsPath);
  } catch (err) {
    return [envelopeError('fatal', `cannot read concerns catalog at ${concernsPath}: ${err.message}`), 1];
  }
  if (!catalogRaw) {
    return [envelopeError('blocking', `concerns catalog not found at ${concernsPath}`), 2];
  }
  const catalog = catalogRaw.concerns && typeof catalogRaw.concerns === 'object'
    ? catalogRaw.concerns
    : null;
  if (!catalog) {
    return [envelopeError('blocking', `concerns catalog at ${concernsPath} has no .concerns object`), 2];
  }

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

  // Validate every concern up-front. Collect the resolved `concerns` array
  // only after all checks pass — single-ownership requires no partial writes.
  const resolved = [];
  const seenIds = new Set();
  let catalogCount = 0;
  let proposedCount = 0;

  for (let i = 0; i < payload.concerns.length; i++) {
    const c = payload.concerns[i];
    if (!c || typeof c !== 'object') {
      return [envelopeError('blocking', `concerns[${i}] must be an object`), 2];
    }
    const id = c.id;
    const source = c.source;
    if (typeof id !== 'string' || !id) {
      return [envelopeError('blocking', `concerns[${i}].id must be a non-empty string`), 2];
    }
    if (source !== 'catalog' && source !== 'proposed') {
      return [envelopeError('blocking', `concerns[${i}].source must be "catalog" or "proposed" (got ${JSON.stringify(source)})`), 2];
    }
    if (seenIds.has(id)) {
      return [envelopeError('blocking', `concerns[${i}].id duplicate: ${id}`), 2];
    }
    seenIds.add(id);

    if (source === 'catalog') {
      const entry = catalog[id];
      if (!entry) {
        return [envelopeError('blocking', `catalog concern not found: ${id}`), 2];
      }
      const seeds = Array.isArray(entry.mapped_seeds) ? entry.mapped_seeds : [];
      resolved.push({ id, source: 'catalog', concepts: seeds });
      catalogCount++;
    } else {
      // proposed
      if (catalog[id]) {
        return [envelopeError('blocking', `proposed concern id collides with catalog: ${id}`), 2];
      }
      const seeds = c.mapped_seeds;
      if (!Array.isArray(seeds) || seeds.length === 0) {
        return [envelopeError('blocking', `proposed concern '${id}' requires non-empty mapped_seeds`), 2];
      }
      for (const s of seeds) {
        if (typeof s !== 'string' || !s) {
          return [envelopeError('blocking', `proposed concern '${id}' has invalid mapped_seed: ${JSON.stringify(s)}`), 2];
        }
        if (!registryIds.has(s)) {
          return [envelopeError('blocking', `proposed concern '${id}' references seed not in registry: ${s}`), 2];
        }
      }
      resolved.push({ id, source: 'proposed', concepts: seeds.slice() });
      proposedCount++;
    }
  }

  // All inputs valid — mutate state.
  const totalConcepts = resolved.reduce((acc, r) => acc + r.concepts.length, 0);
  const newPhase1 = {
    ...phase1,
    concerns: resolved,
    current_concern_index: 0,
  };
  const updated = {
    ...state,
    phases: { ...(state.phases || {}), 1: newPhase1 },
    updated_at: isoNow(),
  };

  try {
    writeJSON(statePath, updated);
  } catch (err) {
    return [envelopeError('blocking', `cannot write session state: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'concerns_selected',
      session_id: state.session_id,
      concerns: resolved.map(r => ({ id: r.id, source: r.source })),
      proposed_count: proposedCount,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [
    envelope({
      concerns_count: resolved.length,
      catalog_count: catalogCount,
      proposed_count: proposedCount,
      total_concepts: totalConcepts,
      warnings: [],
    }),
    0,
  ];
}

module.exports = (register) => register('register-selection', handler);
module.exports.handler = handler;
