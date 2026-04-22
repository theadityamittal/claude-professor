'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Schema validator for the professor-teach output envelope (v5).
 * Pure function — no skill invocation. Mirrors spec §7.2.3 + the
 * action/grade pairing rules in §2.6.
 */
function validate(envelope) {
  if (!envelope || typeof envelope !== 'object') return false;
  if (envelope.status !== 'ok') return false;
  const d = envelope.data;
  if (!d || typeof d !== 'object') return false;
  if (typeof d.concept_id !== 'string') return false;
  if (typeof d.domain !== 'string') return false;
  if (!['taught', 'reviewed', 'known_baseline', 'skipped_not_due'].includes(d.action)) return false;

  if (d.action === 'skipped_not_due') {
    if (d.grade !== null) return false;
  } else if (d.action === 'known_baseline') {
    // grade optional for known_baseline (null, or integer 1-4)
    if (d.grade !== null && !(Number.isInteger(d.grade) && d.grade >= 1 && d.grade <= 4)) return false;
  } else {
    // taught or reviewed: grade required, integer 1-4
    if (!Number.isInteger(d.grade) || d.grade < 1 || d.grade > 4) return false;
  }

  if (typeof d.notes_for_session_log !== 'string' || d.notes_for_session_log.length < 10) return false;
  return true;
}

describe('professor-teach output envelope (v5 schema)', () => {
  it('accepts valid taught envelope', () => {
    assert.ok(validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'taught',
        grade: 3,
        notes_for_session_log: 'Taught x via analogy y',
      },
    }));
  });

  it('accepts valid reviewed envelope', () => {
    assert.ok(validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'reviewed',
        grade: 2,
        notes_for_session_log: 'Reviewed concept briefly',
      },
    }));
  });

  it('accepts valid known_baseline envelope without grade', () => {
    assert.ok(validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'known_baseline',
        grade: null,
        notes_for_session_log: 'User already knew concept',
      },
    }));
  });

  it('accepts valid skipped_not_due envelope', () => {
    assert.ok(validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'skipped_not_due',
        grade: null,
        notes_for_session_log: 'FSRS R > 0.7, skipped',
      },
    }));
  });

  it('rejects skipped_not_due with grade', () => {
    assert.ok(!validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'skipped_not_due',
        grade: 3,
        notes_for_session_log: 'skipped somehow',
      },
    }));
  });

  it('rejects taught without grade', () => {
    assert.ok(!validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'taught',
        grade: null,
        notes_for_session_log: 'missing grade',
      },
    }));
  });

  it('rejects taught with invalid grade', () => {
    assert.ok(!validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'taught',
        grade: 5,
        notes_for_session_log: 'bad grade',
      },
    }));
  });

  it('rejects unknown action', () => {
    assert.ok(!validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'mystery',
        grade: 3,
        notes_for_session_log: 'weird',
      },
    }));
  });

  it('rejects short notes', () => {
    assert.ok(!validate({
      status: 'ok',
      data: {
        concept_id: 'x',
        domain: 'd',
        action: 'taught',
        grade: 3,
        notes_for_session_log: 'x',
      },
    }));
  });
});

module.exports = { validate };
