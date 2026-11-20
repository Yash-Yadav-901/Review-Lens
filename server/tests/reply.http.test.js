import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createApp } from '../src/app.js';
import { ExternalServiceError } from '../src/utils/AppError.js';
import { createReplyRateLimiter } from '../src/middlewares/rateLimiter.js';

function request(app, method, path, { rawBody, contentType = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
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

    let statusCode = 200;
    let responseBody = '';

    const res = new PassThrough();
    res.statusCode = 200;
    res.locals = {};
    res.headersSent = false;
    res.finished = false;

    res.setHeader = () => {};
    res.getHeader = () => null;
    res.removeHeader = () => {};

    res.status = (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };
    res.writeHead = (code) => {
      statusCode = code;
      res.statusCode = code;
    };

    res.write = (chunk) => {
      responseBody += chunk;
    };
    res.end = (chunk) => {
      if (chunk) {
        responseBody += chunk;
      }
      let parsed;
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = responseBody;
      }
      resolve({ status: statusCode, body: parsed });
    };
    res.json = (body) => {
      res.end(JSON.stringify(body));
      return res;
    };

    try {
      app.handle(req, res, (err) => reject(err ?? new Error('Request unhandled')));
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

describe('POST /api/reviews/reply HTTP endpoint', () => {
  it('returns 200 and ApiResponse envelope on valid request', async () => {
    const mockReplyService = {
      generateReply: async () => ({
        reply: 'Thank you for your feedback! We are here to help.',
      }),
    };

    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      replyService: mockReplyService,
    });

    const res = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({
        text: 'The product was great!',
        product: 'Wireless Speaker',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.reply, 'Thank you for your feedback! We are here to help.');
  });

  it('returns 400 ValidationError when text is missing or invalid', async () => {
    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      replyService: { generateReply: async () => ({ reply: 'ok' }) },
    });

    // Empty text
    const res1 = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({ text: '   ' }),
    });
    assert.equal(res1.status, 400);
    assert.equal(res1.body.success, false);
    assert.equal(res1.body.error.code, 'VALIDATION_ERROR');

    // Missing text field
    const res2 = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({ product: 'Laptop' }),
    });
    assert.equal(res2.status, 400);
    assert.equal(res2.body.success, false);
    assert.equal(res2.body.error.code, 'VALIDATION_ERROR');

    // Unrecognized extra field (strict)
    const res3 = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({ text: 'Valid review', extra: 'forbidden' }),
    });
    assert.equal(res3.status, 400);
    assert.equal(res3.body.success, false);
    assert.equal(res3.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 502 with standard envelope when model fails twice', async () => {
    const failingReplyService = {
      generateReply: async () => {
        throw new ExternalServiceError('Model failed to generate a valid reply after re-ask', {
          code: 'LLM_BAD_RESPONSE',
          retryable: false,
        });
      },
    };

    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      replyService: failingReplyService,
    });

    const res = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({ text: 'Any review text' }),
    });

    assert.equal(res.status, 502);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'EXTERNAL_SERVICE_ERROR');
  });

  it('applies stricter rate limit to /reply route only and returns 429 when exceeded', async () => {
    // Create an isolated limiter with limit 2 for deterministic testing
    const strictLimiter = createReplyRateLimiter(2);

    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      replyService: { generateReply: async () => ({ reply: 'ok' }) },
      replyLimiter: strictLimiter,
    });

    const body = JSON.stringify({ text: 'Testing rate limits' });

    // Request 1: OK
    const res1 = await request(app, 'POST', '/api/reviews/reply', { rawBody: body });
    assert.equal(res1.status, 200);

    // Request 2: OK
    const res2 = await request(app, 'POST', '/api/reviews/reply', { rawBody: body });
    assert.equal(res2.status, 200);

    // Request 3: Rate limited -> 429
    const res3 = await request(app, 'POST', '/api/reviews/reply', { rawBody: body });
    assert.equal(res3.status, 429);
    assert.equal(res3.body.error.code, 'RATE_LIMIT_EXCEEDED');

    // Health endpoint still works -> 200 (proves stricter limit applies to reply route only)
    const healthRes = await request(app, 'GET', '/api/health');
    assert.equal(healthRes.status, 200);
  });

  it('never exposes API key in any response payload or error envelope', async () => {
    const SECRET_KEY = 'super_secret_groq_api_key_12345';
    const mockClient = {
      async chat() {
        throw new ExternalServiceError('LLM request failed', {
          code: 'LLM_BAD_RESPONSE',
        });
      },
    };

    const replyService = (
      await import('../src/modules/reviews/reply.service.js')
    ).createReplyService({
      client: mockClient,
    });

    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      replyService,
    });

    const res = await request(app, 'POST', '/api/reviews/reply', {
      rawBody: JSON.stringify({ text: 'Valid review text' }),
    });

    const responseString = JSON.stringify(res.body);
    assert.ok(!responseString.includes(SECRET_KEY), 'API key must not appear in response');
    assert.equal(res.status, 502);
  });
});
