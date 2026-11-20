import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { rateLimiter } from './middlewares/rateLimiter.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { ApiResponse } from './utils/ApiResponse.js';
import asyncHandler from './utils/asyncHandler.js';
import { createContainer } from './container.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';

export function createApp(deps = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN }));

  // Limit JSON body size to prevent large payloads outside of file uploads.
  app.use(express.json({ limit: '1mb' }));

  // Rate limit all /api routes.
  app.use('/api', rateLimiter);

  app.get(
    '/api/health',
    asyncHandler((_req, res) => {
      ApiResponse.success(res, {
        data: {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      });
    }),
  );

  const container = deps.reviewsService && deps.replyService ? null : createContainer(deps);
  const reviewsService = deps.reviewsService ?? container.reviewsService;
  const replyService = deps.replyService ?? container.replyService;

  app.use(
    '/api/reviews',
    createReviewsRouter({
      reviewsService,
      replyService,
      upload: deps.upload,
      replyLimiter: deps.replyLimiter,
    }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
