import { randomUUID } from 'node:crypto';

/**
 * Attach a request id and emit one structured log line per request.
 *
 * The id is echoed back in the `X-Request-Id` response header and included in
 * error responses, so a user reporting "it failed" can be correlated to an exact
 * log line without exposing any internals.
 */
export function requestContext(request, response, next) {
  // Honour an upstream id when a proxy supplies one, otherwise mint one.
  request.id = request.get('X-Request-Id') || randomUUID();
  response.setHeader('X-Request-Id', request.id);

  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    request.log?.info(
      {
        req: {
          id: request.id,
          method: request.method,
          // req.route is set by Express once a handler matches; during boot it
          // is undefined for unmatched paths.
          path: request.originalUrl?.split('?')[0],
          route: request.route?.path,
          status: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        },
      },
      'request completed',
    );
  });

  next();
}