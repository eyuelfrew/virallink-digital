/**
 * Operational errors.
 *
 * Anything thrown that is an AppError is considered "expected": the error
 * middleware returns its status and message to the client. Anything else is a
 * bug, and the client receives a generic message plus a request id while the
 * detail stays in the logs.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options.code || defaultCode(statusCode);
    this.details = options.details || undefined;
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(message, 400, { code: 'BAD_REQUEST', details });
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, 403, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Not found') {
    return new AppError(message, 404, { code: 'NOT_FOUND' });
  }

  static conflict(message, details) {
    return new AppError(message, 409, { code: 'CONFLICT', details });
  }

  static unprocessable(message, details) {
    return new AppError(message, 422, { code: 'VALIDATION_ERROR', details });
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(message, 429, { code: 'RATE_LIMITED' });
  }
}

function defaultCode(statusCode) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
  };
  return map[statusCode] || 'INTERNAL_ERROR';
}

export default AppError;