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
 * GET /api/v1/media/:year/:month/:file
 *
 * Serves stored media when the local disk driver is in use. When STORAGE_DRIVER=s3
 * files are served by the object store directly and this route is unused.
 *
 * The key is validated against a strict pattern before any filesystem access, so
 * a traversal attempt cannot escape MEDIA_ROOT.
 *
 * MOUNTED BEFORE `adminRoutes`, and that ordering is load-bearing.
 *
 * The admin router is mounted at the root of the namespace and owns the `media`
 * prefix (for the library and uploads), so mounting it first made it swallow
 * every image request: `GET /media/2026/10/abc.webp` matched its prefix check,
 * fell through to `router.use(authenticate)`, and came back 401. Every uploaded
 * image on the site was therefore broken — including a client's own logo — while
 * nothing in the logs suggested anything other than "no session".
 *
 * The two sets of routes do not actually collide. This one needs at least one
 * path segment after `/media/`, so `GET /media` (the admin library listing) still
 * falls through to the admin router as intended.
 */
router.get('/media/*splat', async (request, response) => {
  /*
   * Express 5 changed named wildcards: `*splat` captures an *array* of segments,
   * not a string. Passing that array straight through failed
   * `isValidMediaKey`'s `typeof key === 'string'` guard, so every image returned
   * 400 "Invalid media reference" even though the key was perfectly valid.
   *
   * Rejoined here, and then re-validated by readMedia as before — the pattern
   * check is what stops a traversal attempt, and it must run on the reconstructed
   * string, not on whatever the router happened to hand over.
   */
  const { splat } = request.params;
  const key = Array.isArray(splat) ? splat.join('/') : splat || '';

  const { buffer, mimeType } = await readMedia(key);

  response.setHeader('Content-Type', mimeType);
  response.setHeader('Content-Length', buffer.length);
  // Filenames are content-addressed and never rewritten, so they can be cached
  // hard. The API path itself is not cached, since rows can be replaced.
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('X-Content-Options', 'nosniff');

  response.send(buffer);
});

/**
 * Admin endpoints, mounted at the root of the namespace so resource paths stay
 * clean (`/api/v1/employees`, `/api/v1/services`).
 *
 * The router guards itself: it only handles paths whose first segment is a known
 * admin resource, and passes anything else through with `next('router')` so an
 * unknown path falls through to the 404 handler instead of being answered with
 * "authentication required".
 *
 * Mounted after the public media route above, for the reason given there.
 */
router.use(adminRoutes);

export default router;