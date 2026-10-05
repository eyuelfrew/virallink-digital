import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import env from './config/env.js';
import logger from './config/logger.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
import apiRoutes from './routes/index.js';
import sequelize from './config/database.js';

/**
 * Express application.
 *
 * Kept separate from server.js so tests can import the app without binding a
 * port or starting a database connection.
 *
 * Middleware order matters and is deliberate:
 *   1. security headers
 *   2. compression
 *   3. CORS
 *   4. request id + logging
 *   5. cookie parsing
 *   6. rate limiting
 *   7. routes
 *   8. 404, then the error handler last
 */
export function createApp() {
  const app = express();

  // Passenger and some Apache setups sit in front of us; trust the proxy only
  // as far as needed to read the client IP for rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  /* ---------------------------------------------------------------- */
  /* Security headers                                                  */
  /* ---------------------------------------------------------------- */

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Inline styles are required by Next.js style injection on the web app,
          // which is served separately; styles are still not allowed to load
          // remote code.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', env.SITE_URL, 'https:'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", env.SITE_URL],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: env.isProduction ? [] : null,
        },
      },
      // The API serves JSON and images; a strict referrer policy costs nothing.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.isProduction
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Compression matters on shared hosting where bandwidth is metered.
  app.use(compression());

  /* ---------------------------------------------------------------- */
  /* CORS                                                              */
  /* ---------------------------------------------------------------- */

  app.use(
    cors({
      // An explicit allowlist. `*` is rejected at boot in production by env.js.
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(Object.assign(new Error('Origin not allowed'), { statusCode: 403 }));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Form-Loaded-At'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 86400,
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Logging, request ids, cookies                                     */
  /* ---------------------------------------------------------------- */

  app.use(
    pinoHttp({
      logger,
      // Reuse the id minted by requestContext so logs and headers agree.
      genReqId: (request) => request.id,
      customLogLevel: (request, response) => {
        if (response.statusCode >= 500) return 'error';
        if (response.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(requestContext);
  app.use(cookieParser());

  /* ---------------------------------------------------------------- */
  /* Body parsing                                                      */
  /* ---------------------------------------------------------------- */

  app.use(
    express.json({
      limit: '1mb',
      // Reject non-JSON content types rather than guessing.
      type: ['application/json', 'application/*+json'],
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  /* ---------------------------------------------------------------- */
  /* Health check — before rate limiting so it is never throttled      */
  /* ---------------------------------------------------------------- */

  app.get('/health', async (request, response) => {
    let database = 'up';
    try {
      await sequelize.authenticate();
    } catch {
      database = 'down';
    }

    response.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
      version: '1.0.0',
      env: env.NODE_ENV,
    });
  });

  /* ---------------------------------------------------------------- */
  /* Rate limiting                                                     */
  /* ---------------------------------------------------------------- */

  /*
   * Scope matters here more than the numbers.
   *
   * The global limiter protects the *anonymous* surface — the public reads and
   * the contact form — which is the only part reachable without a session. It is
   * deliberately NOT mounted across the whole API:
   *
   *   - Admin traffic already requires a valid session and a per-route
   *     permission, so a per-IP budget adds nothing against an attacker and only
   *     serves to lock out a legitimate administrator.
   *   - One admin page view fans out into many API calls (the dashboard reads
   *     the summary, activity, clients, employees and more). A global 300/15min
   *     budget was being consumed by ~10 calls per page, so ordinary use of the
   *     console produced "Too many requests" for a signed-in super admin.
   *   - In this deployment every request reaches the API over loopback, so a
   *     per-IP limit can only ever be a single shared bucket anyway.
   *
   * Login keeps its own much tighter limiter (authLimiter) inside auth.routes.js.
   */
  app.use('/api/v1/public', globalLimiter);
  app.use('/api/v1/contact', globalLimiter);

  /* ---------------------------------------------------------------- */
  /* Routes                                                           */
  /* ---------------------------------------------------------------- */

  app.use('/api/v1', apiRoutes);

  /* ---------------------------------------------------------------- */
  /* Terminal handlers                                                 */
  /* ---------------------------------------------------------------- */

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;