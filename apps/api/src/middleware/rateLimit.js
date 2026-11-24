import { isIP } from 'node:net';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

/**
 * The key a request is counted against.
 *
 * `request.ip` is not always an address, and the default key generator in
 * express-rate-limit assumes that it is. It logs
 * `ERR_ERL_INVALID_IP_ADDRESS` when handed anything else, which is what
 * happens for every request that arrives through this app's web server: that
 * server identifies its own hop with a marker rather than an address it cannot
 * verify, and Express — trusting one hop — takes the marker as the client IP.
 *
 * So the key is computed here instead:
 *
 *   - the address, when there is one. A request made directly to the API has a
 *     real client address, and so does one from a deployment whose edge
 *     records one.
 *   - otherwise the socket address, which is at least a real address for the
 *     hop that actually connected.
 *
 * Addresses go through the library's `ipKeyGenerator`, which masks an IPv6
 * address to its /56. That matters: an IPv6 client is handed a whole /64, so
 * keying on the full address would let one client walk through a fresh bucket
 * for every address it rotates through.
 *
 * Note what this does *not* do: it does not key on the forwarded chain. The
 * web server deliberately preserves that chain rather than trusting it — a
 * caller can put anything in `X-Forwarded-For` — and keying on it would hand
 * back the ability to mint a fresh rate-limit bucket per request, which is
 * exactly what the chain filtering there exists to prevent.
 *
 * The consequence is worth stating plainly. In this deployment every request
 * reaches the API over loopback, so every request shares one bucket. That is a
 * property of the topology rather than something the limiter can fix, and it
 * means the budgets below are site-wide budgets, not per-client ones.
 */
function rateLimitKey(request) {
  const ip = request.ip;

  if (typeof ip === 'string' && isIP(ip)) return ipKeyGenerator(ip);

  const socket = request.socket?.remoteAddress;
  if (typeof socket === 'string' && isIP(socket)) return ipKeyGenerator(socket);

  return 'shared';
}

/**
 * Options every limiter shares.
 *
 * The library's own `ip` validation is switched off because the key generator
 * above does the same job and understands that the client address is sometimes
 * a marker rather than an address. Leaving the library's check on would log an
 * error once per limiter per process, which is exactly the kind of noise that
 * hides the errors that matter.
 *
 * The other validations — trust proxy, unexpected `X-Forwarded-For` — are left
 * on, because they are real misconfiguration checks and this deployment
 * satisfies them.
 */
const limiterDefaults = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  validate: { ip: false },
};

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
  ...limiterDefaults,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  // Health checks must never be throttled or a load balancer will see a failure.
  skip: (request) => request.path === '/health',
  handler: limitHandler('Too many requests. Please slow down.'),
});

/**
 * Login is the endpoint worth attacking, so it gets a much tighter limit than
 * the global one.
 */
export const authLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
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
  ...limiterDefaults,
  windowMs: 60 * 60 * 1000,
  max: env.RATE_LIMIT_CONTACT_MAX,
  handler: limitHandler('You have sent several messages already. Please email us directly.'),
});

/**
 * Password recovery.
 *
 * Unlike the login limiter, every request counts — the successful ones
 * included. A password reset answers 200 whether or not it did anything, so
 * `skipSuccessfulRequests` would make this limiter a no-op: an attacker could
 * ask for codes without limit and never see a 429.
 *
 * The budget is generous because, as the key generator above explains, this
 * limiter sees one shared bucket for the whole site. It is a backstop against
 * a runaway script, not the real control — the real control is the
 * per-account limit in the database, which is the only thing that can express
 * "this account".
 */
export const passwordResetLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_PASSWORD_RESET_MAX,
  handler: limitHandler('Too many password reset requests. Please wait before trying again.'),
});

/** Uploads are expensive in CPU and memory, so they get their own budget. */
export const uploadLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60 * 60 * 1000,
  max: 60,
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