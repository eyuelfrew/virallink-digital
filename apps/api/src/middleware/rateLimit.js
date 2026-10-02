import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';

/**
 * Rate limiting.
 *
 * cPanel has no Redis, so these use the in-memory store. That means limits are
 * per-process: fine for a single Node app, and the reason the store sits behind
 * this module if a shared store is ever needed.
 *
 * Each limiter is mounted on the narrowest route it can protect rather than
 * globally, so a busy admin session never consumes the public form's budget.
 */

/** Standard error body shape, matching the global error handler. */
function limitHandler(message) {
  return (request, response, _next, options) => {
    response.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMITED',
        message,
        // Seconds until the caller may retry, so the UI can say something useful.
        retryAfter: Math.ceil(options.windowMs / 1000),
        requestId: request.id,
      },
    });
  };
}

/** Broad limit applied to the whole API. */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Health checks must never be throttled or a load balancer will see a failure.
  skip: (request) => request.path === '/health',
  handler: limitHandler('Too many requests. Please slow down.'),
});

/**
 * Login is the endpoint worth attacking, so it gets a much tighter limit than
 * the global one.
 */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // A successful login should not count against the budget, or a legitimate
  // user who signs in repeatedly gets locked out.
  skipSuccessfulRequests: true,
  handler: limitHandler('Too many sign-in attempts. Please wait before trying again.'),
});

/**
 * The public contact form. Deliberately the strictest limit, since it is the
 * only unauthenticated write endpoint.
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.RATE_LIMIT_CONTACT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitHandler('You have sent several messages already. Please email us directly.'),
});

/** Uploads are expensive in CPU and memory, so they get their own budget. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limitHandler('Too many uploads. Please try again later.'),
});

/**
 * Cheap in-process guard for endpoint-level concerns the shared limiter cannot
 * express, such as one IP submitting many inquiries for different addresses.
 */
export function perKeyCounter({ windowMs = 60 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();

  return {
    check(key) {
      const now = Date.now();
      const entry = hits.get(key);

      if (!entry || now > entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }

      entry.count += 1;

      // Opportunistic cleanup so the map cannot grow without bound.
      if (hits.size > 5000) {
        for (const [k, v] of hits) {
          if (now > v.resetAt) hits.delete(k);
        }
      }

      return entry.count <= max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export { AppError };
export default globalLimiter;