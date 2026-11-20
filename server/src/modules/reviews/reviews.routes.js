import { Router } from 'express';
import { upload as defaultUpload } from '../../middlewares/upload.js';
import { replyRateLimiter as defaultReplyRateLimiter } from '../../middlewares/rateLimiter.js';
import { createReviewsController } from './reviews.controller.js';

/**
 * Creates reviews router with injected reviewsService, replyService, and upload middleware.
 *
 * @param {{ reviewsService: object, replyService?: object, upload?: object, replyLimiter?: object }} deps
 */
export function createReviewsRouter({
  reviewsService,
  replyService,
  upload = defaultUpload,
  replyLimiter = defaultReplyRateLimiter,
}) {
  const router = Router();
  const controller = createReviewsController({ reviewsService, replyService });

  router.post('/upload', upload.single('file'), controller.uploadReviews);
  router.post('/reply', replyLimiter, controller.generateReply);

  return router;
}
