import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createApp } from '../src/app.js';
import { ValidationError } from '../src/utils/AppError.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

/**
 * Calls the Express app in-process without any network connection.
 * Uses a PassThrough stream for req (satisfies body-parser internals)
 * and a plain object mock for res.
 */
function request(app, method, path, { rawBody, contentType } = {}) {
  return new Promise((resolve, reject) => {
    // Use a real PassThrough so body-parser's raw-body can consume it.
    const req = new PassThrough();
    req.method = method;
    req.url = path;
    req.socket = { remoteAddress: '::1' };
    req.connection = req.socket;
    req.headers = { host: 'localhost' };

    if (contentType) {
      req.headers['content-type'] = contentType;
    }
    if (rawBody !== undefined) {
      req.headers['content-length'] = String(Buffer.byteLength(rawBody));
    }

    // Accumulate response chunks.
    let statusCode = 200;
    let responseBody = '';
    const sentHeaders = {};

    const res = new PassThrough();
    res.statusCode = 200;
    res.locals = {};
    res.headersSent = false;
    res.finished = false;

    res.setHeader = (k, v) => { sentHeaders[k.toLowerCase()] = v; };
    res.getHeader = (k) => sentHeaders[k.toLowerCase()];
    res.removeHeader = (k) => { delete sentHeaders[k.toLowerCase()]; };

    // Express sets status via res.status(code) which must return res.
    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.writeHead = (code) => {
      statusCode = code;
      res.statusCode = code;
    };

    res.write = (chunk) => { responseBody += chunk; };
    res.end = (chunk) => {
      if (chunk) { responseBody += chunk; }
      let parsed;
      try { parsed = JSON.parse(responseBody); } catch { parsed = responseBody; }
      resolve({ status: statusCode, body: parsed });
    };
    // Express checks res.json — provide it so our ApiResponse.success/error work.
    res.json = (body) => {
      res.end(JSON.stringify(body));
      return res;
    };

    try {
      app.handle(req, res, (err) =>
        reject(err ?? new Error('Request passed through without being handled')),
      );
    } catch (err) {
      reject(err);
    }

    process.nextTick(() => {
      if (rawBody !== undefined) {
        req.push(rawBody);
      }
      req.push(null);
    });
  });
}

// Minimal res mock for direct errorHandler tests (no stream needed).
function mockRes() {
  const state = { statusCode: 200, body: null };
  return {
    // ApiResponse calls res.status(code).json(body)
    status(code) { state.statusCode = code; return this; },
    json(b) { state.body = b; return this; },
    // Accessors used by assertions
    get _status() { return state.statusCode; },
    get _body() { return state.body; },
  };
}

describe('GET /api/health', () => {
  it('returns 200 with the success envelope', async () => {
    const app = createApp();
    const { status, body } = await request(app, 'GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.ok(typeof body.data.uptime === 'number');
    assert.ok(typeof body.data.timestamp === 'string');
  });
});

describe('GET /api/unknown', () => {
  it('returns 404 with the error envelope', async () => {
    const app = createApp();
    const { status, body } = await request(app, 'GET', '/api/unknown-route');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});

describe('errorHandler', () => {
  // Test errorHandler directly as a function to avoid route ordering constraints.

  it('converts an AppError to its own status code', () => {
    const res = mockRes();
    const err = new ValidationError('bad field', [{ field: 'x' }]);
    errorHandler(err, {}, res, () => {});
    assert.equal(res._status, 400);
    assert.equal(res._body.error.code, 'VALIDATION_ERROR');
    assert.equal(res._body.error.message, 'bad field');
  });

  it('converts an unknown error to a generic 500 without stack', () => {
    const res = mockRes();
    errorHandler(new Error('internal boom'), {}, res, () => {});
    assert.equal(res._status, 500);
    assert.equal(res._body.error.code, 'INTERNAL_ERROR');
    // Stack trace must never appear in the response body.
    assert.ok(!JSON.stringify(res._body).includes(' at '));
  });

  it('returns 400 for a malformed JSON body via the full stack', async () => {
    const app = createApp();
    const { status, body } = await request(app, 'POST', '/api/health', {
      rawBody: '{ bad json }',
      contentType: 'application/json',
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'INVALID_JSON');
  });
});
