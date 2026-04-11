'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { envelope, envelopeError } = require('../../scripts/utils.js');

describe('envelope', () => {
  it('wraps data in ok status', () => {
    const result = envelope({ count: 3 });
    assert.deepStrictEqual(result, { status: 'ok', data: { count: 3 } });
  });

  it('wraps null data', () => {
    const result = envelope(null);
    assert.deepStrictEqual(result, { status: 'ok', data: null });
  });

  it('wraps empty object', () => {
    const result = envelope({});
    assert.deepStrictEqual(result, { status: 'ok', data: {} });
  });

  it('does not include error field', () => {
    const result = envelope({ x: 1 });
    assert.strictEqual('error' in result, false);
  });
});

describe('envelopeError', () => {
  it('wraps fatal error', () => {
    const result = envelopeError('fatal', 'No session state');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'fatal', message: 'No session state' },
    });
  });

  it('wraps blocking error', () => {
    const result = envelopeError('blocking', 'Checkpoint blocked');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'blocking', message: 'Checkpoint blocked' },
    });
  });

  it('wraps warning error', () => {
    const result = envelopeError('warning', 'Subagent failed');
    assert.deepStrictEqual(result, {
      status: 'error',
      error: { level: 'warning', message: 'Subagent failed' },
    });
  });

  it('does not include data field', () => {
    const result = envelopeError('fatal', 'err');
    assert.strictEqual('data' in result, false);
  });
});
