import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../src/config/env.js';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3000',
    CORS_ORIGIN: 'http://localhost:5173',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    DB_PATH: './test.db',
    BATCH_SIZE: '5',
    MAX_RETRIES: '3',
    RETRY_BASE_DELAY_MS: '1000',
    MAX_FILE_SIZE_MB: '5',
    MAX_REVIEWS: '500',
    MAX_REVIEW_CHARS: '1000',
    RATE_LIMIT_PER_MINUTE: '60',
  };

  it('accepts valid config and coerces numbers', () => {
    const cfg = validateEnv(base);
    assert.equal(cfg.PORT, 3000);
    assert.equal(cfg.BATCH_SIZE, 5);
    assert.equal(cfg.NODE_ENV, 'test');
    assert.equal(typeof cfg.PORT, 'number');
  });

  it('applies defaults for missing optional fields', () => {
    // Drop PORT and CORS_ORIGIN to verify defaults kick in.
    // eslint-disable-next-line no-unused-vars
    const { PORT, CORS_ORIGIN, ...rest } = base;
    const cfg = validateEnv(rest);
    assert.equal(cfg.PORT, 3000);
    assert.equal(cfg.CORS_ORIGIN, 'http://localhost:5173');
  });

  it('rejects an invalid PORT', () => {
    assert.throws(
      () => validateEnv({ ...base, PORT: 'not-a-number' }),
      (err) => {
        assert.ok(err.message.includes('PORT'));
        return true;
      },
    );
  });

  it('rejects an invalid NODE_ENV', () => {
    assert.throws(
      () => validateEnv({ ...base, NODE_ENV: 'staging' }),
      (err) => {
        assert.ok(err.message.includes('NODE_ENV'));
        return true;
      },
    );
  });

  it('rejects a PORT out of range', () => {
    assert.throws(
      () => validateEnv({ ...base, PORT: '99999' }),
      (err) => {
        assert.ok(err.message.includes('PORT'));
        return true;
      },
    );
  });

  it('rejects an invalid CORS_ORIGIN', () => {
    assert.throws(
      () => validateEnv({ ...base, CORS_ORIGIN: 'not-a-url' }),
      (err) => {
        assert.ok(err.message.includes('CORS_ORIGIN'));
        return true;
      },
    );
  });

  it('requires GROQ_API_KEY in non-test environments', () => {
    assert.throws(
      () => validateEnv({ ...base, NODE_ENV: 'production', GROQ_API_KEY: '' }),
      (err) => {
        assert.ok(err.message.includes('GROQ_API_KEY'));
        return true;
      },
    );
  });

  it('allows missing GROQ_API_KEY when NODE_ENV is test', () => {
    // Should not throw
    const cfg = validateEnv({ ...base, NODE_ENV: 'test' });
    assert.equal(cfg.NODE_ENV, 'test');
  });

  it('reports all invalid fields in one error', () => {
    assert.throws(
      () => validateEnv({ ...base, PORT: 'bad', BATCH_SIZE: '-1', NODE_ENV: 'bad' }),
      (err) => {
        assert.ok(err.message.includes('PORT'));
        assert.ok(err.message.includes('BATCH_SIZE'));
        assert.ok(err.message.includes('NODE_ENV'));
        return true;
      },
    );
  });

  it('config object is frozen', () => {
    const cfg = validateEnv(base);
    assert.throws(() => {
      cfg.PORT = 9999;
    });
  });
});
