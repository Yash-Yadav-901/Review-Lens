import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  ValidationError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  RateLimitError,
  ExternalServiceError,
  ConfigError,
} from '../src/utils/AppError.js';

describe('AppError subclasses', () => {
  it('ValidationError has statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input', [{ field: 'name' }]);
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.message, 'bad input');
    assert.deepEqual(err.details, [{ field: 'name' }]);
    assert.equal(err.isOperational, true);
    assert.ok(err instanceof AppError);
    assert.ok(err instanceof Error);
  });

  it('NotFoundError has statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError();
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, 'NOT_FOUND');
  });

  it('PayloadTooLargeError has statusCode 413 and code PAYLOAD_TOO_LARGE', () => {
    const err = new PayloadTooLargeError();
    assert.equal(err.statusCode, 413);
    assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
  });

  it('UnsupportedMediaTypeError has statusCode 415 and code UNSUPPORTED_MEDIA_TYPE', () => {
    const err = new UnsupportedMediaTypeError();
    assert.equal(err.statusCode, 415);
    assert.equal(err.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('RateLimitError has statusCode 429 and code RATE_LIMIT_EXCEEDED', () => {
    const err = new RateLimitError();
    assert.equal(err.statusCode, 429);
    assert.equal(err.code, 'RATE_LIMIT_EXCEEDED');
  });

  it('ExternalServiceError has statusCode 502 and code EXTERNAL_SERVICE_ERROR', () => {
    const err = new ExternalServiceError('groq down', { retries: 3 });
    assert.equal(err.statusCode, 502);
    assert.equal(err.code, 'EXTERNAL_SERVICE_ERROR');
    assert.deepEqual(err.details, { retries: 3 });
  });

  it('ConfigError has statusCode 500 and code CONFIG_ERROR', () => {
    const err = new ConfigError('missing key');
    assert.equal(err.statusCode, 500);
    assert.equal(err.code, 'CONFIG_ERROR');
  });

  it('AppError stack trace is captured', () => {
    const err = new ValidationError('oops');
    assert.ok(err.stack.includes('AppError.test.js'));
  });
});
