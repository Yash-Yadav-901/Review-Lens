import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiResponse } from '../src/utils/ApiResponse.js';

// Minimal response mock matching what Express provides.
function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

describe('ApiResponse', () => {
  it('success() produces the correct envelope with defaults', () => {
    const res = mockRes();
    ApiResponse.success(res, { data: { id: 1 } });
    assert.equal(res._status, 200);
    assert.equal(res._body.success, true);
    assert.deepEqual(res._body.data, { id: 1 });
    assert.equal(res._body.error, undefined);
  });

  it('success() respects a custom statusCode', () => {
    const res = mockRes();
    ApiResponse.success(res, { data: null, statusCode: 201 });
    assert.equal(res._status, 201);
  });

  it('success() includes meta when provided', () => {
    const res = mockRes();
    ApiResponse.success(res, { data: [], meta: { total: 0 } });
    assert.deepEqual(res._body.meta, { total: 0 });
  });

  it('success() omits meta when not provided', () => {
    const res = mockRes();
    ApiResponse.success(res, { data: null });
    assert.equal(res._body.meta, undefined);
  });

  it('error() produces the correct envelope with defaults', () => {
    const res = mockRes();
    ApiResponse.error(res);
    assert.equal(res._status, 500);
    assert.equal(res._body.success, false);
    assert.equal(res._body.error.code, 'INTERNAL_ERROR');
    assert.ok(typeof res._body.error.message === 'string');
  });

  it('error() uses provided values', () => {
    const res = mockRes();
    ApiResponse.error(res, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Gone',
      details: ['missing'],
    });
    assert.equal(res._status, 404);
    assert.equal(res._body.error.code, 'NOT_FOUND');
    assert.equal(res._body.error.message, 'Gone');
    assert.deepEqual(res._body.error.details, ['missing']);
  });

  it('error() omits details when not provided', () => {
    const res = mockRes();
    ApiResponse.error(res, { statusCode: 400, code: 'X', message: 'Y' });
    assert.equal(res._body.error.details, undefined);
  });
});
