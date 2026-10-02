import { ZodError } from 'zod';
import AppError from '../utils/AppError.js';

/**
 * Request validation.
 *
 * Every route that accepts input declares a schema. Validation runs before the
 * handler, so handlers can assume the payload is already well-formed and
 * correctly typed — no per-handler checking, and no chance of forgetting it on
 * one endpoint.
 *
 * Parsed output replaces the raw input. Because zod applies defaults and
 * transforms, `request.body` after validation is exactly what should be
 * persisted.
 */

/**
 * Where the parsed, validated payload is stored on the request.
 *
 * `req.query` is a getter-only property in Express 5 (the getter lazily parses
 * the raw query string and caches it), so assigning to it throws. Parsed query
 * values are written to `req.validatedQuery` instead, and handlers read from
 * there. `req.body` and `req.params` are ordinary properties and are replaced in
 * place.
 */
const QUERY_DESTINATION = 'validatedQuery';

/**
 * Validate a request part against a schema.
 *
 * @param {'body'|'query'|'params'} source
 * @param {import('zod').ZodSchema} schema
 */
export function validate(source, schema) {
  return function runValidation(request, _response, next) {
    try {
      const parsed = schema.parse(request[source]);

      if (source === 'query') {
        request[QUERY_DESTINATION] = parsed;
      } else {
        request[source] = parsed;
      }

      // Keep the untouched original for the audit diff, minus anything secret.
      if (source === 'body') request.originalBody = sanitiseForAudit(request.body);

      next();
    } catch (error) {
      if (error instanceof ZodError) return next(error);
      return next(AppError.unprocessable('Invalid request', { _root: [error.message] }));
    }
  };
}

/** Validate several sources at once, e.g. validate([{ source: 'body', schema }]). */
export function validateAll(rules) {
  const middlewares = rules.map(({ source, schema }) => validate(source, schema));
  return function runAll(request, response, next) {
    let index = 0;
    const runNext = (error) => {
      if (error) return next(error);
      const middleware = middlewares[index];
      index += 1;
      if (!middleware) return next();
      return middleware(request, response, runNext);
    };
    return runNext();
  };
}

/**
 * Strip anything that must never reach the audit log.
 *
 * Even though logger.js redacts password-shaped keys, the audit trail stores a
 * metadata blob in the database where redaction does not apply. Removing these
 * fields here means a create or update can never persist a credential.
 */
const NEVER_LOG = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'passwordHash',
  'secret',
  'apiKey',
]);

export function sanitiseForAudit(body) {
  if (!body || typeof body !== 'object') return body;

  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    if (NEVER_LOG.has(key)) {
      clean[key] = '[redacted]';
      continue;
    }
    // Recurse one level into nested objects such as invoice items.
    clean[key] = value && typeof value === 'object' && !Array.isArray(value) ? sanitiseForAudit(value) : value;
  }
  return clean;
}

/**
 * Only the fields a client is allowed to set reach the model.
 *
 * A mass-assignment guard. Without it, a request body containing `roleId` or
 * `isSystem` would be written straight to the database, letting an EDITOR
 * promote themselves. Services pass an explicit allowlist and everything else is
 * dropped.
 */
export function allowOnly(payload, allowedFields) {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = payload[field];
      // undefined means "not provided"; use null to clear a value.
      if (value !== undefined) result[field] = value;
    }
  }
  return result;
}

/** Client IP, honouring a proxy header only when explicitly trusted. */
export function clientIp(request, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = request.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return request.ip || request.socket?.remoteAddress || null;
}

export { QUERY_DESTINATION };
export default validate;