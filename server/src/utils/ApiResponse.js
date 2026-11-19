export class ApiResponse {
  // Sends a uniform success envelope.
  static success(res, { data = null, meta = null, statusCode = 200 } = {}) {
    const body = { success: true, data };
    if (meta !== null) {
      body.meta = meta;
    }
    return res.status(statusCode).json(body);
  }

  // Sends a uniform error envelope. Stack traces are never included.
  static error(
    res,
    {
      statusCode = 500,
      code = 'INTERNAL_ERROR',
      message = 'An unexpected error occurred',
      details = null,
    } = {},
  ) {
    const body = {
      success: false,
      error: { code, message },
    };
    if (details !== null) {
      body.error.details = details;
    }
    return res.status(statusCode).json(body);
  }
}
