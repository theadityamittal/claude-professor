#!/usr/bin/env node
'use strict';

/**
 * scripts/whiteboard.js — subcommand router for the v5 whiteboard skill.
 *
 * Each subcommand lives in its own module under `scripts/whiteboard/<name>.js`
 * and exports a registration function `(register) => register('name', handler)`.
 * Handlers return `[envelope|errorEnvelope, exitCode]` tuples.
 *
 * Spec: docs/professor/designs/2026-04-20-v5-whiteboard-redesign.md §5.1
 */

const { parseArgs, envelopeError } = require('./utils.js');

const HANDLERS = {};

function register(name, fn) {
  if (HANDLERS[name]) throw new Error(`whiteboard: duplicate subcommand '${name}'`);
  HANDLERS[name] = fn;
}

// Foundation commands (T-SCRIPT-5 batch 1).
require('./whiteboard/init-session')(register);
require('./whiteboard/resume-session')(register);
require('./whiteboard/phase-start')(register);

// Schedulers (T-SCRIPT-5 batch 2).
require('./whiteboard/register-selection')(register);
require('./whiteboard/register-components')(register);

// Iterators (T-SCRIPT-5 batch 2).
require('./whiteboard/next-concern')(register);
require('./whiteboard/next-component')(register);

// Recorders (T-SCRIPT-5 batch 3).
require('./whiteboard/record-concept')(register);
require('./whiteboard/record-discussion')(register);

// Unit closers + remediation (T-SCRIPT-5 batch 3).
require('./whiteboard/mark-concern-done')(register);
require('./whiteboard/mark-component-done')(register);
require('./whiteboard/mark-skipped')(register);

// Phase/session closers (T-SCRIPT-5 batch 4).
require('./whiteboard/phase-complete')(register);
require('./whiteboard/export-design-doc')(register);
require('./whiteboard/finish')(register);

function main(argv) {
  const sub = argv[0];
  if (!sub) {
    return [
      envelopeError('blocking', `Missing subcommand. Available: ${Object.keys(HANDLERS).sort().join(', ')}`),
      2,
    ];
  }
  if (!HANDLERS[sub]) {
    return [
      envelopeError(
        'blocking',
        `unknown subcommand: ${sub}. Available: ${Object.keys(HANDLERS).sort().join(', ')}`
      ),
      2,
    ];
  }
  const args = parseArgs(argv.slice(1));
  return HANDLERS[sub](args);
}

if (require.main === module) {
  let result;
  try {
    result = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(JSON.stringify(envelopeError('fatal', err && err.message ? err.message : String(err))) + '\n');
    process.exit(1);
  }
  const [out, code] = result;
  if (code === 0) process.stdout.write(JSON.stringify(out) + '\n');
  else process.stderr.write(JSON.stringify(out) + '\n');
  process.exit(code);
}

module.exports = { main, register, HANDLERS };
