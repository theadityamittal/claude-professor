'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON } = require('../utils.js');
const { appendLog, readLog, logPath } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;

const NARRATIVE_EVENT_TYPES = new Set([
  'discussion_recorded',
  'professor_action',
  'l2_decision',
  'remediation_choice',
]);

/**
 * Best-effort hint for what the skill should call next based on state shape.
 * Pure: derives from state alone, never mutates.
 */
function computeNextActionHint(state) {
  const phase = state.current_phase;
  if (phase === null || phase === undefined) return 'phase-start';
  if (phase === 'complete') return 'finish';
  const phaseState = (state.phases || {})[phase];
  if (!phaseState) return `phase-start --phase ${phase}`;
  if (phaseState.status === 'complete') return `phase-start --phase ${phase + 1}`;

  if (phase === 1) {
    if (!Array.isArray(phaseState.concerns) || phaseState.concerns.length === 0) {
      return 'register-selection';
    }
    const idx = phaseState.current_concern_index;
    if (idx === null || idx === undefined) return 'next-concern';
    if (idx >= phaseState.concerns.length) return 'phase-complete';
    return 'next-concern';
  }

  if (phase === 2 || phase === 3) {
    if (!Array.isArray(phaseState.components) || phaseState.components.length === 0) {
      return 'register-components';
    }
    const idx = phaseState.current_component_index;
    if (idx === null || idx === undefined) return 'next-component';
    if (idx >= phaseState.components.length) return 'phase-complete';
    return 'next-component';
  }

  if (phase === 4) {
    return 'export-design-doc';
  }

  return 'unknown';
}

/**
 * Compute a short progress string for the current cursor.
 */
function computeCurrentPosition(state) {
  const phase = state.current_phase;
  if (phase === null || phase === undefined) return 'no phase started';
  if (phase === 'complete') return 'session complete';
  const phaseState = (state.phases || {})[phase];
  if (!phaseState) return `phase ${phase} not started`;

  if (phase === 1) {
    const total = Array.isArray(phaseState.concerns) ? phaseState.concerns.length : 0;
    const idx = phaseState.current_concern_index;
    return `phase 1, concerns[${idx ?? 0}] of ${total}`;
  }
  if (phase === 2 || phase === 3) {
    const components = Array.isArray(phaseState.components) ? phaseState.components : [];
    const idx = phaseState.current_component_index ?? 0;
    const current = components[idx];
    const checkedLen = current && Array.isArray(current.concepts_checked) ? current.concepts_checked.length : 0;
    const totalConcepts = current && Array.isArray(current.concepts) ? current.concepts.length :
      (current && Array.isArray(current.concepts_seed)
        ? current.concepts_seed.length + (Array.isArray(current.concepts_proposed) ? current.concepts_proposed.length : 0)
        : 0);
    return `phase ${phase}, components[${idx}].concepts_checked.length=${checkedLen} of ${totalConcepts}`;
  }
  if (phase === 4) {
    return `phase 4, status=${phaseState.status || 'unknown'}`;
  }
  return `phase ${phase}`;
}

/**
 * Build a markdown narrative from filtered events (chronological).
 */
function buildNarrative(events) {
  const filtered = events.filter(e => e && NARRATIVE_EVENT_TYPES.has(e.event));
  if (filtered.length === 0) return '## Session narrative\n\n_(no narrative events recorded yet)_\n';

  // Group by phase if present on the event; fall back to "Unknown phase".
  const groups = new Map();
  for (const e of filtered) {
    const phase = (e.phase !== undefined && e.phase !== null) ? `Phase ${e.phase}` : 'Phase ?';
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(e);
  }

  const sections = [];
  for (const [phase, evs] of groups.entries()) {
    sections.push(`## ${phase}`);
    for (const e of evs) {
      const unit = e.concern_id || e.component_id || e.unit_id || '';
      const tag = unit ? `[${unit}] ` : '';
      let text = '';
      switch (e.event) {
        case 'discussion_recorded':
          text = e.summary || '(no summary)';
          break;
        case 'professor_action':
          text = `${e.action || 'action'}: ${e.notes || '(no notes)'}`;
          break;
        case 'l2_decision':
          text = `L2 decision (${e.decision || '?'}): ${e.reasoning || '(no reasoning)'}`;
          break;
        case 'remediation_choice':
          text = `remediation: ${e.choice || '?'}`;
          break;
        default:
          text = JSON.stringify(e);
      }
      sections.push(`- ${tag}${text}`);
    }
    sections.push('');
  }
  return sections.join('\n');
}

function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }

  const statePath = path.join(sessionDir, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    return [envelopeError('blocking', `No session state at ${statePath}. Use init-session to create a new session.`), 2];
  }

  let state;
  try {
    state = readJSON(statePath);
  } catch (err) {
    return [envelopeError('fatal', `corrupted session state JSON: ${err.message}`), 1];
  }
  if (!state) {
    return [envelopeError('blocking', `No session state at ${statePath}. Use init-session to create a new session.`), 2];
  }

  if (state.schema_version !== SCHEMA_VERSION) {
    return [
      envelopeError(
        'blocking',
        `schema_version ${state.schema_version} not supported (require ${SCHEMA_VERSION}). Discard via init-session --force-new or run session.js migrate-from-v4.`
      ),
      2,
    ];
  }

  const logResult = readLog(sessionDir);
  if (!logResult.exists) {
    return [envelopeError('blocking', `No session log at ${logPath(sessionDir)}.`), 2];
  }

  const narrative = buildNarrative(logResult.events);
  const currentPosition = computeCurrentPosition(state);
  const nextActionHint = computeNextActionHint(state);

  // Append session_resumed event before returning.
  try {
    appendLog(sessionDir, {
      event: 'session_resumed',
      session_id: state.session_id,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  const data = {
    session_id: state.session_id,
    current_phase: state.current_phase,
    current_position: currentPosition,
    task: state.task,
    started_at: state.started_at,
    narrative_summary: narrative,
    next_action_hint: nextActionHint,
  };
  if (logResult.warnings.length > 0) data.log_warnings = logResult.warnings;

  return [envelope(data), 0];
}

module.exports = (register) => register('resume-session', handler);
module.exports.handler = handler;
module.exports._internals = { buildNarrative, computeNextActionHint, computeCurrentPosition };
