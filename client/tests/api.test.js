import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uploadReviews, requestReply, ApiClientError } from '../src/api/client.js';

describe('api client', () => {
  it('uploadReviews returns data on 200 OK success envelope', async () => {
    const mockData = { reviews: [], report: {}, insights: {}, metrics: {} };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockData }),
    });

    const dummyFile = new Blob(['review_id\nR1'], { type: 'text/csv' });
    const result = await uploadReviews(dummyFile);
    assert.deepEqual(result, mockData);
  });

  it('maps 400 VALIDATION_ERROR response to ApiClientError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No CSV file uploaded' },
      }),
    });

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.statusCode, 400);
        assert.equal(err.message, 'No CSV file uploaded');
        return true;
      },
    );
  });

  it('maps 413 PAYLOAD_TOO_LARGE response to ApiClientError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 413,
      json: async () => ({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'File too large' },
      }),
    });

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
        assert.equal(err.statusCode, 413);
        return true;
      },
    );
  });

  it('maps 415 UNSUPPORTED_MEDIA_TYPE response to ApiClientError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 415,
      json: async () => ({
        success: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Only CSV files are allowed' },
      }),
    });

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'UNSUPPORTED_MEDIA_TYPE');
        assert.equal(err.statusCode, 415);
        return true;
      },
    );
  });

  it('maps 429 RATE_LIMIT_EXCEEDED response to ApiClientError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
      }),
    });

    await assert.rejects(
      async () => requestReply({ text: 'Hello' }),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'RATE_LIMIT_EXCEEDED');
        assert.equal(err.statusCode, 429);
        return true;
      },
    );
  });

  it('maps 502 EXTERNAL_SERVICE_ERROR response to ApiClientError', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      json: async () => ({
        success: false,
        error: { code: 'LLM_UNAVAILABLE', message: 'Groq API unavailable' },
      }),
    });

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'LLM_UNAVAILABLE');
        assert.equal(err.statusCode, 502);
        return true;
      },
    );
  });

  it('handles network failure (fetch throws) and returns friendly NETWORK_ERROR', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.statusCode, 0);
        assert.ok(err.message.includes('Server is unreachable'));
        return true;
      },
    );
  });

  it('handles invalid non-JSON server response', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    await assert.rejects(
      async () => uploadReviews(new Blob([''])),
      (err) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'INVALID_RESPONSE');
        assert.equal(err.statusCode, 500);
        return true;
      },
    );
  });

  it('requestReply returns reply on success', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { reply: 'Thank you for your review!' },
      }),
    });

    const res = await requestReply({ text: 'Great item', product: 'Watch' });
    assert.equal(res.reply, 'Thank you for your review!');
  });
});
