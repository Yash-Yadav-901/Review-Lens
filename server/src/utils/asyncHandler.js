// Wraps an async route handler so thrown errors reach Express error middleware
// instead of becoming unhandled rejections.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
