import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config/env.js';
import { rateLimiter } from './middlewares/rateLimiter.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { ApiResponse } from './utils/ApiResponse.js';
import asyncHandler from './utils/asyncHandler.js';
import { createContainer } from './container.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIST = resolve(__dirname, '../../client/dist');

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

  // Serve static files in production if client/dist exists
  const clientDist = deps.clientDist ?? DEFAULT_CLIENT_DIST;
  const isProduction = config.NODE_ENV === 'production' || deps.serveStatic;
  if (isProduction && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(resolve(clientDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
