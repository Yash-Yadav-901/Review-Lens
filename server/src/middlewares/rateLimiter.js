import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { ApiResponse } from '../utils/ApiResponse.js';

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  // Use a custom handler so the response matches our error envelope.
  handler(_req, res) {
    ApiResponse.error(res, {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before retrying.',
    });
  },
});

export function createReplyRateLimiter(maxRequests = config.REPLY_RATE_LIMIT_PER_MINUTE) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, res) {
      ApiResponse.error(res, {
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many reply requests. Please wait before retrying.',
      });
    },
  });
}

export const replyRateLimiter = createReplyRateLimiter();
