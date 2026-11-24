import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import AppError from '../utils/AppError.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Terminal error handler.
 *
 * Distinguishes three cases:
 *  - AppError          → expected, safe to show the message
 *  - ZodError          → 422 with field-keyed details
 *  - anything else     → a bug: client gets a generic message and a request id,
 *                        while the stack stays in the logs
 */
export function errorHandler(error, request, response, _next) {
  /*
   * CORS runs before requestContext, so a rejected origin reaches this handler
   * without an id. Always have one: otherwise JSON.stringify drops the
   * undefined requestId and the response is indistinguishable from a proxy
   * error page when debugging cross-origin failures.
   */
  const requestId = request.id || randomUUID();

  if (error instanceof AppError) {
    logger.warn(
      { req: { id: requestId, method: request.method, path: request.originalUrl }, status: error.statusCode, code: error.code, msg: error.message },
      'request rejected',
    );

    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId,
      },
    });
  }

  if (error instanceof ZodError) {
    const details = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || '_root';
      if (!details[field]) details[field] = [];
      details[field].push(issue.message);
    }

    logger.warn(
      { req: { id: requestId, method: request.method, path: request.originalUrl }, validationErrors: details },
      'request failed validation',
    );

    return response.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Some fields need attention', details, requestId },
    });
  }

  /*
   * A unique-index violation is a conflict, not a bug. Reaching here means the
   * caller did not anticipate it — most often a value still held by a
   * soft-deleted row, which the paranoid scope hides. Reporting 409 names the
   * offending column instead of returning an opaque 500.
   */
  if (error.name === 'SequelizeUniqueConstraintError') {
    const fields = Object.keys(error.fields || {});

    logger.warn(
      { req: { id: requestId, method: request.method, path: request.originalUrl }, fields },
      'unique constraint violation',
    );

    return response.status(409).json({
      error: {
        code: 'CONFLICT',
        message: fields.length ? `That ${fields.join(' and ')} is already in use` : 'That value is already in use',
        requestId,
      },
    });
  }

  // Body parser failures (malformed JSON, oversized payload).
  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON', requestId },
    });
  }

  if (error.type === 'entity.too.large') {
    return response.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large', requestId },
    });
  }

  // Multer file errors.
  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(413).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: `Files must be ${Math.round(env.MEDIA_MAX_BYTES / 1024 / 1024)}MB or smaller`,
        requestId,
      },
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
    return response.status(400).json({
      error: { code: 'INVALID_UPLOAD', message: 'Too many files, or an unexpected file field', requestId },
    });
  }

  /*
   * Middleware that runs before requestContext can still signal a deliberate
   * client rejection — most notably CORS, which rejects disallowed origins with
   * a 403. Preserve that status (and its safe message) instead of turning a
   * configuration problem into an opaque 500. Only 4xx errors are surfaced, and
   * this sits AFTER the specific handlers above so parser errors keep their own
   * safe, generic messages instead of leaking a raw JSON parse error string.
   */
  const status = error.statusCode || error.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    logger.warn(
      { req: { id: requestId, method: request.method, path: request.originalUrl }, status, msg: error.message },
      'request rejected by middleware',
    );

    return response.status(status).json({
      error: { code: error.code || 'REQUEST_REJECTED', message: error.message || 'Request rejected', requestId },
    });
  }

  logger.error(
    {
      req: { id: requestId, method: request.method, path: request.originalUrl },
      err: { message: error.message, stack: error.stack, name: error.name },
    },
    'unhandled error',
  );

  return response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
      // The id lets support find the exact log line without exposing internals.
      requestId,
      ...(env.isProduction ? {} : { debug: error.message }),
    },
  });
}

/** 404 handler for unmatched routes. Mounted after all routers. */
export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${request.method} ${request.originalUrl.split('?')[0]}`,
      requestId: request.id,
    },
  });
}