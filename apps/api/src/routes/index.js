import { Router } from 'express';
import authRoutes from './v1/auth.routes.js';
import publicRoutes from './v1/public.routes.js';
import contactRoutes from './v1/contact.routes.js';
import adminRoutes from './v1/admin.routes.js';
import { readMedia } from '../services/media.service.js';

/**
 * API router.
 *
 * Three namespaces, and the separation is deliberate:
 *
 *   /api/v1/public/*  unauthenticated reads, allowlist-serialised
 *   /api/v1/contact   the one unauthenticated write, rate limited and scored
 *   /api/v1/*         authenticated admin endpoints, permission-gated per route
 *
 * Nothing under the admin namespace is reachable without a session, regardless
 * of how it is addressed.
 */
const router = Router();

/** API version, so a future v2 can be mounted alongside without breaking clients. */
router.get('/', (request, response) => {
  response.json({
    data: {
      name: 'Virallink API',
      version: '1.0.0',
      documentation: '/docs/API.md',
    },
  });
});

router.use('/public', publicRoutes);
router.use('/contact', contactRoutes);
router.use('/auth', authRoutes);

/**
 * Admin endpoints, mounted at the root of the namespace so resource paths stay
 * clean (`/api/v1/employees`, `/api/v1/services`).
 *
 * The router guards itself: it only handles paths whose first segment is a known
 * admin resource, and passes anything else through with `next('router')` so an
 * unknown path falls through to the 404 handler instead of being answered with
 * "authentication required".
 */
router.use(adminRoutes);

/**
 * GET /api/v1/media/:year/:month/:file
 *
 * Serves stored media when the local disk driver is in use. When STORAGE_DRIVER=s3
 * files are served by the object store directly and this route is unused.
 *
 * The key is validated against a strict pattern before any filesystem access, so
 * a traversal attempt cannot escape MEDIA_ROOT.
 */
router.get('/media/*splat', async (request, response) => {
  const key = request.params.splat || '';

  const { buffer, mimeType } = await readMedia(key);

  response.setHeader('Content-Type', mimeType);
  response.setHeader('Content-Length', buffer.length);
  // Filenames are content-addressed and never rewritten, so they can be cached
  // hard. The API path itself is not cached, since rows can be replaced.
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  response.send(buffer);
});

export default router;