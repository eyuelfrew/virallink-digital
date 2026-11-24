import { randomUUID } from 'node:crypto';
import logger from '../config/logger.js';

/**
 * Attach a request id and emit one compact log line per request.
 *
 * The id is echoed back in the `X-Request-Id` response header and included in
 * error responses, so a user reporting "it failed" can be correlated to an
 * exact log line without exposing any internals.
 */
export function requestContext(request, response, next) {
  // Honour an upstream id when a proxy supplies one, otherwise mint one.
  request.id = request.get('X-Request-Id') || randomUUID();
  response.setHeader('X-Request-Id', request.id);

  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      {
        id: request.id,
        method: request.method,
        path: request.originalUrl?.split('?')[0],
        status: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request',
    );
  });

  next();
}
