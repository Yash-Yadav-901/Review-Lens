import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGroqClient,
  computeBackoffDelay,
  parseRetryAfter,
} from '../src/modules/analysis/groqClient.js';
import { ExternalServiceError } from '../src/utils/AppError.js';

describe('computeBackoffDelay', () => {
  it('grows exponentially with attempt count', () => {
    const d0 = computeBackoffDelay({
      attempt: 0,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      random: () => 0,
    });
    const d1 = computeBackoffDelay({
      attempt: 1,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      random: () => 0,
    });
    const d2 = computeBackoffDelay({
      attempt: 2,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      random: () => 0,
    });

    assert.equal(d0, 1000);
    assert.equal(d1, 2000);
    assert.equal(d2, 4000);
  });

  it('caps delay at maxDelayMs', () => {
    const d = computeBackoffDelay({
      attempt: 10,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      random: () => 0,
    });
    assert.equal(d, 5000);
  });

  it('respects retryAfterMs when it exceeds exponential delay', () => {
    const d = computeBackoffDelay({
      attempt: 0,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      retryAfterMs: 8000,
      random: () => 0,
    });
    assert.equal(d, 8000);
  });

  it('caps retryAfterMs at maxDelayMs', () => {
    const d = computeBackoffDelay({
      attempt: 0,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      retryAfterMs: 50000,
      random: () => 0,
    });
    assert.equal(d, 10000);
  });

  it('adds bounded jitter', () => {
    const d = computeBackoffDelay({
      attempt: 1,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      random: () => 1.0,
    });
    // 2000 base + (2000 * 0.5 * 1.0) = 3000
    assert.equal(d, 3000);
  });
});

describe('parseRetryAfter', () => {
  it('parses valid numeric seconds', () => {
    assert.equal(parseRetryAfter('5'), 5000);
    assert.equal(parseRetryAfter('  10  '), 10000);
    assert.equal(parseRetryAfter('0'), 0);
  });

  it('returns null on missing, empty, or garbage values', () => {
    assert.equal(parseRetryAfter(null), null);
    assert.equal(parseRetryAfter(''), null);
    assert.equal(parseRetryAfter('invalid-header'), null);
  });

  it('parses HTTP-date format in the future', () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const res = parseRetryAfter(futureDate);
    assert.ok(typeof res === 'number');
    assert.ok(res > 5000 && res <= 11000);
  });
});

describe('createGroqClient', () => {
  const dummyConfig = {
    GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    GROQ_API_KEY: 'test_secret_key',
    GROQ_MODEL: 'openai/gpt-oss-120b',
    GROQ_REASONING_EFFORT: 'low',
    GROQ_MAX_OUTPUT_TOKENS: 2048,
    REQUEST_TIMEOUT_MS: 30000,
    MAX_RETRIES: 2,
    RETRY_BASE_DELAY_MS: 100,
    RETRY_MAX_DELAY_MS: 1000,
  };

  it('sends correct request URL, headers, and body fields', async () => {
    let capturedUrl;
    let capturedOpts;

    const mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"results":[]}' }, finish_reason: 'stop' }],
        }),
      };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    const res = await client.chat({ system: 'sys prompt', user: 'user text' });
    assert.equal(res.content, '{"results":[]}');
    assert.equal(res.finishReason, 'stop');
    assert.equal(res.retries, 0);

    assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(capturedOpts.headers['Content-Type'], 'application/json');
    assert.equal(capturedOpts.headers.Authorization, 'Bearer test_secret_key');

    const body = JSON.parse(capturedOpts.body);
    assert.equal(body.model, 'openai/gpt-oss-120b');
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.include_reasoning, false);
    assert.equal(body.reasoning_format, undefined);
    assert.equal(body.temperature, 0);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.max_completion_tokens, 2048);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'user');
  });

  it('retries on 429 with Retry-After and succeeds', async () => {
    let callCount = 0;
    const sleeps = [];

    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => (name === 'retry-after' ? '2' : null) },
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"results":[]}' }, finish_reason: 'stop' }],
        }),
      };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async (ms) => sleeps.push(ms),
    });

    const res = await client.chat({ system: 's', user: 'u' });
    assert.equal(callCount, 2);
    assert.equal(res.retries, 1);
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] >= 1000); // respects 2s Retry-After (capped at maxDelayMs 1000)
  });

  it('retries on 500 server error and succeeds', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, headers: { get: () => null } };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    const res = await client.chat({ system: 's', user: 'u' });
    assert.equal(callCount, 2);
    assert.equal(res.retries, 1);
  });

  it('retries on network error and succeeds', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('connect ECONNREFUSED');
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'recovered' } }],
        }),
      };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    const res = await client.chat({ system: 's', user: 'u' });
    assert.equal(callCount, 2);
    assert.equal(res.content, 'recovered');
  });

  it('throws LLM_RATE_LIMITED when 429 retries are exhausted', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
    });

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_RATE_LIMITED');
        assert.equal(err.details?.retryable, true);
        assert.ok(!err.message.includes('test_secret_key'));
        return true;
      },
    );
  });

  it('throws LLM_UNAVAILABLE when 500 retries are exhausted', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
    });

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_UNAVAILABLE');
        assert.equal(err.details?.retryable, true);
        return true;
      },
    );
  });

  it('fails fast without retry on 401 with LLM_AUTH_FAILED', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 401, headers: { get: () => null } };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_AUTH_FAILED');
        assert.equal(err.details?.retryable, false);
        return true;
      },
    );
    assert.equal(callCount, 1);
  });

  it('fails fast without retry on 400 with LLM_BAD_REQUEST', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 400, headers: { get: () => null } };
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_BAD_REQUEST');
        assert.equal(err.details?.retryable, false);
        assert.equal(err.details?.statusCode, 400);
        return true;
      },
    );
    assert.equal(callCount, 1);
  });

  it('throws LLM_BAD_RESPONSE on 200 with unusable body shape', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ unexpected: 'shape', choices: [] }),
    });

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_BAD_RESPONSE');
        assert.equal(err.details?.retryable, false);
        return true;
      },
    );
  });

  it('handles request timeout and maps to retryable LLM_UNAVAILABLE', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
    });

    await assert.rejects(
      async () => client.chat({ system: 's', user: 'u' }),
      (err) => {
        assert.ok(err instanceof ExternalServiceError);
        assert.equal(err.details?.code, 'LLM_UNAVAILABLE');
        assert.equal(err.details?.retryable, true);
        return true;
      },
    );
    assert.equal(callCount, dummyConfig.MAX_RETRIES + 1);
  });

  it('never exposes API key in thrown error, details, or logs', async () => {
    const loggedMessages = [];
    const mockLogger = {
      warn: (msg, data) => loggedMessages.push({ msg, data }),
      info: (msg, data) => loggedMessages.push({ msg, data }),
      error: (msg, data) => loggedMessages.push({ msg, data }),
    };

    const mockFetch = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
    });

    const client = createGroqClient({
      config: dummyConfig,
      fetchFn: mockFetch,
      sleep: async () => {},
      logger: mockLogger,
    });

    try {
      await client.chat({ system: 's', user: 'u' });
      assert.fail('Should have thrown');
    } catch (err) {
      const errStr = JSON.stringify(err, Object.getOwnPropertyNames(err));
      assert.ok(!errStr.includes('test_secret_key'), 'API key must not appear in error');
      assert.ok(!err.message.includes('test_secret_key'));
      if (err.details) {
        assert.ok(!JSON.stringify(err.details).includes('test_secret_key'));
      }
    }

    const logStr = JSON.stringify(loggedMessages);
    assert.ok(!logStr.includes('test_secret_key'), 'API key must not appear in logs');
  });
});
