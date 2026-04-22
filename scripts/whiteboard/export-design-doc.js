'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { envelope, envelopeError, readJSON, ensureDir } = require('../utils.js');
const { appendLog } = require('./_log.js');

const STATE_FILE = '.session-state.json';
const SCHEMA_VERSION = 5;
const SUPPORTED_TEMPLATES = new Set(['default']);

/**
 * Atomically write text content to a path (temp + rename), creating parent dirs.
 */
function atomicWriteText(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function renderPhase1(phase1) {
  const lines = [];
  lines.push(`## Phase 1 — Requirements (Concerns)\n`);
  const concerns = Array.isArray(phase1.concerns) ? phase1.concerns : [];
  const discussions = Array.isArray(phase1.discussions) ? phase1.discussions : [];
  if (concerns.length === 0) {
    lines.push(`_No concerns scheduled._\n`);
    return lines.join('');
  }
  for (const concern of concerns) {
    const src = concern.source || 'unknown';
    const statusTag = concern.status ? ` [${concern.status}]` : '';
    lines.push(`### ${concern.id} (${src})${statusTag}\n`);
    const unitDisc = discussions.filter(d => d && d.unit_id === concern.id);
    if (unitDisc.length === 0) {
      lines.push(`- _No discussions recorded._\n`);
    } else {
      for (const d of unitDisc) {
        lines.push(`- ${d.summary || '(no summary)'}\n`);
        if (Array.isArray(d.open_questions) && d.open_questions.length > 0) {
          lines.push(`  - Open questions:\n`);
          for (const q of d.open_questions) lines.push(`    - ${q}\n`);
        }
      }
    }
  }
  return lines.join('');
}

function renderComponentPhase(phaseNum, phaseState) {
  const lines = [];
  const heading = phaseNum === 2 ? 'High-Level Design (Components)' : 'Low-Level Design';
  lines.push(`## Phase ${phaseNum} — ${heading}\n`);
  const components = Array.isArray(phaseState.components) ? phaseState.components : [];
  const discussions = Array.isArray(phaseState.discussions) ? phaseState.discussions : [];
  if (components.length === 0) {
    lines.push(`_No components scheduled._\n`);
    return lines.join('');
  }
  for (const comp of components) {
    const statusTag = comp.status ? ` [${comp.status}]` : '';
    lines.push(`### ${comp.id}${statusTag}\n`);

    const seeds = Array.isArray(comp.concepts_seed) ? comp.concepts_seed : [];
    if (seeds.length > 0) {
      lines.push(`- Seeds: ${seeds.join(', ')}\n`);
    }

    const proposed = Array.isArray(comp.concepts_proposed) ? comp.concepts_proposed : [];
    if (proposed.length > 0) {
      lines.push(`- Proposed L2s:\n`);
      for (const p of proposed) {
        const parent = p.parent ? ` (parent: ${p.parent})` : '';
        lines.push(`  - ${p.id}${parent}\n`);
      }
    }

    const decisions = Array.isArray(comp.L2_decisions) ? comp.L2_decisions : [];
    if (decisions.length > 0) {
      lines.push(`- L2 decisions:\n`);
      for (const dec of decisions) {
        const parts = [];
        if (dec.id) parts.push(dec.id);
        if (dec.decision) parts.push(`→ ${dec.decision}`);
        if (dec.canonical_id && dec.canonical_id !== dec.id) parts.push(`(canonical: ${dec.canonical_id})`);
        lines.push(`  - ${parts.join(' ')}\n`);
      }
    }

    const unitDisc = discussions.filter(d => d && d.unit_id === comp.id);
    if (unitDisc.length > 0) {
      lines.push(`- Discussions:\n`);
      for (const d of unitDisc) {
        lines.push(`  - ${d.summary || '(no summary)'}\n`);
        if (Array.isArray(d.open_questions) && d.open_questions.length > 0) {
          lines.push(`    - Open questions:\n`);
          for (const q of d.open_questions) lines.push(`      - ${q}\n`);
        }
      }
    }
  }
  return lines.join('');
}

function renderCoverage(state) {
  const lines = [];
  lines.push(`## Concept Coverage\n`);
  const checked = Array.isArray(state.concepts_checked) ? state.concepts_checked : [];
  if (checked.length === 0) {
    lines.push(`_No concepts recorded._\n`);
    return lines.join('');
  }
  const byPhase = new Map();
  for (const c of checked) {
    const p = c && c.phase;
    if (!byPhase.has(p)) byPhase.set(p, []);
    byPhase.get(p).push(c);
  }
  const phaseKeys = [...byPhase.keys()].sort((a, b) => (a || 0) - (b || 0));
  for (const p of phaseKeys) {
    lines.push(`### Phase ${p}\n`);
    for (const c of byPhase.get(p)) {
      const parts = [c.concept_id || '(no id)'];
      if (c.action) parts.push(`action=${c.action}`);
      if (c.grade !== undefined && c.grade !== null) parts.push(`grade=${c.grade}`);
      if (c.concern_or_component) parts.push(`unit=${c.concern_or_component}`);
      lines.push(`- ${parts.join(' | ')}\n`);
    }
  }
  return lines.join('');
}

/**
 * Implements `whiteboard.js export-design-doc` per spec §5.1.14.
 *
 * Aggregates phase state into a markdown design document. Read-only on state;
 * appends a single `design_doc_exported` event to the session log.
 */
function handler(args) {
  const sessionDir = args['session-dir'];
  if (!sessionDir || sessionDir === true) {
    return [envelopeError('blocking', 'Missing required argument: --session-dir'), 2];
  }
  const output = args.output;
  if (!output || output === true) {
    return [envelopeError('blocking', 'Missing required argument: --output'), 2];
  }
  const template = args.template === undefined || args.template === true ? 'default' : args.template;
  if (!SUPPORTED_TEMPLATES.has(template)) {
    return [
      envelopeError('blocking', `unknown template '${template}'. Supported: ${[...SUPPORTED_TEMPLATES].join(', ')}`),
      2,
    ];
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

  const phases = state.phases || {};
  const p = (n) => phases[n] || phases[String(n)];
  const missing = [];
  if (!p(1)) missing.push(1);
  if (!p(2)) missing.push(2);
  if (!p(3)) missing.push(3);
  if (missing.length > 0) {
    return [
      envelopeError('blocking', `cannot export design doc: phases not started: ${missing.join(', ')}`),
      2,
    ];
  }

  // Build markdown.
  const sections = [];
  let sectionsWritten = 0;
  sections.push(`# ${state.task || '(untitled task)'}\n\n`);

  const phase1 = p(1);
  if (phase1) {
    sections.push(renderPhase1(phase1));
    sections.push('\n');
    sectionsWritten += 1;
  }
  const phase2 = p(2);
  if (phase2) {
    sections.push(renderComponentPhase(2, phase2));
    sections.push('\n');
    sectionsWritten += 1;
  }
  const phase3 = p(3);
  if (phase3) {
    sections.push(renderComponentPhase(3, phase3));
    sections.push('\n');
    sectionsWritten += 1;
  }

  // Coverage is always emitted (even if empty) as the fourth top-level section.
  sections.push(renderCoverage(state));
  sectionsWritten += 1;

  const content = sections.join('');

  try {
    atomicWriteText(output, content);
  } catch (err) {
    return [envelopeError('blocking', `cannot write design doc to ${output}: ${err.message}`), 2];
  }

  try {
    appendLog(sessionDir, {
      event: 'design_doc_exported',
      session_id: state.session_id,
      output_path: output,
    });
  } catch (err) {
    return [envelopeError('blocking', `cannot append to log: ${err.message}`), 2];
  }

  return [envelope({ output_path: output, sections_written: sectionsWritten }), 0];
}

module.exports = (register) => register('export-design-doc', handler);
module.exports.handler = handler;
