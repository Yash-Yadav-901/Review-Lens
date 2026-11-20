import { ValidationError } from '../../utils/AppError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { replyRequestSchema } from './reply.schema.js';

/**
 * Creates controller handlers for review endpoints.
 *
 * @param {{ reviewsService: object, replyService?: object }} deps
 */
export function createReviewsController({ reviewsService, replyService }) {
  const uploadReviews = asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      throw new ValidationError('No CSV file uploaded');
    }

    const result = await reviewsService.processUpload(req.file.buffer);

    return ApiResponse.success(res, {
      data: result,
      statusCode: 200,
    });
  });

  const generateReply = asyncHandler(async (req, res) => {
    if (!replyService) {
      throw new ValidationError('Reply service not available');
    }

    const parseResult = replyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    const { text, product } = parseResult.data;
    const result = await replyService.generateReply({ text, product });

    return ApiResponse.success(res, {
      data: result,
      statusCode: 200,
    });
  });

  return { uploadReviews, generateReply };
}
