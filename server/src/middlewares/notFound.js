import { NotFoundError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
