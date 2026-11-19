import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { logger } from '../utils/logger.js';

// Converts multer's errors to our standard shape.
function fromMulterError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected form field', 400, 'VALIDATION_ERROR');
  }
  return new AppError(err.message, 400, 'VALIDATION_ERROR');
}

export function errorHandler(err, req, res, _next) {
  // Multer errors carry a name of 'MulterError'
  if (err.name === 'MulterError') {
    const appErr = fromMulterError(err);
    return ApiResponse.error(res, {
      statusCode: appErr.statusCode,
      code: appErr.code,
      message: appErr.message,
    });
  }

  // Express JSON body-parser fires a SyntaxError for malformed JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return ApiResponse.error(res, {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON',
    });
  }

  // Zod errors bubble up if validation is called outside a service
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return ApiResponse.error(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
    });
  }

  if (err instanceof AppError) {
    // Warn on operational errors; they are expected failure paths.
    logger.warn('Operational error', {
      code: err.code,
      status: err.statusCode,
      message: err.message,
    });
    return ApiResponse.error(res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Unknown errors are programming bugs. Log the full stack but hide details
  // from the client.
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  return ApiResponse.error(res, {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
