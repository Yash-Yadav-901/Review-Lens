import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createApp } from '../src/app.js';

function buildMultipart({
  fieldName = 'file',
  filename = 'reviews.csv',
  content = 'a,b,c',
  mimeType = 'text/csv',
} = {}) {
  const boundary = '----ReviewLensTestBoundary1234567890';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, data, tail]);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType };
}

function request(app, method, path, { rawBody, contentType } = {}) {
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

describe('POST /api/reviews/upload HTTP endpoint', () => {
  it('returns 200 and ApiResponse envelope on valid file upload', async () => {
    const mockResult = {
      reviews: [{ reviewId: 'R1', status: 'valid' }],
      report: { totalRows: 1, valid: 1 },
      insights: { summary: {} },
      metrics: { aiCalls: 1 },
      parseIssues: [],
    };

    const mockReviewsService = {
      processUpload: async () => mockResult,
    };

    const app = createApp({ reviewsService: mockReviewsService });
    const { body, contentType } = buildMultipart({
      fieldName: 'file',
      filename: 'reviews.csv',
      content: 'review_id,product,rating,date,review_text\nR1,Widget,5,2024-01-01,Great',
    });

    const res = await request(app, 'POST', '/api/reviews/upload', {
      rawBody: body,
      contentType,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, mockResult);
  });

  it('returns 400 ValidationError when no file is uploaded', async () => {
    const app = createApp({ reviewsService: { processUpload: async () => {} } });

    const boundary = '----ReviewLensTestBoundary1234567890';
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="comment"\r\n\r\nno file provided\r\n--${boundary}--\r\n`,
    );
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const res = await request(app, 'POST', '/api/reviews/upload', {
      rawBody: body,
      contentType,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 413 PayloadTooLargeError when file exceeds size limit', async () => {
    const multer = (await import('multer')).default;
    const tinyUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 },
    });

    const app = createApp({
      reviewsService: { processUpload: async () => {} },
      upload: tinyUpload,
    });

    const { body, contentType } = buildMultipart({
      fieldName: 'file',
      filename: 'reviews.csv',
      content: 'This content is definitely longer than ten bytes',
    });

    const res = await request(app, 'POST', '/api/reviews/upload', {
      rawBody: body,
      contentType,
    });

    assert.equal(res.status, 413);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('returns 415 UnsupportedMediaTypeError when file extension is not CSV', async () => {
    const app = createApp({ reviewsService: { processUpload: async () => {} } });
    const { body, contentType } = buildMultipart({
      fieldName: 'file',
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      content: '%PDF-1.4',
    });

    const res = await request(app, 'POST', '/api/reviews/upload', {
      rawBody: body,
      contentType,
    });

    assert.equal(res.status, 415);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('returns 400 when an unexpected form field name is used', async () => {
    const app = createApp({ reviewsService: { processUpload: async () => {} } });
    const { body, contentType } = buildMultipart({
      fieldName: 'wrong_field_name',
      filename: 'reviews.csv',
      content: 'review_id,product,rating,date,review_text\nR1,P,5,2024-01-01,T',
    });

    const res = await request(app, 'POST', '/api/reviews/upload', {
      rawBody: body,
      contentType,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });
});
