import { Router } from 'express';
import { query, v } from '../../middleware/schemas.js';
import {
  getCompanyProfile,
  listServices,
  getServiceBySlug,
  listProjects,
  getProjectBySlug,
  listTeam,
  listPublicClients,
  listTestimonials,
  listJobs,
  getJobBySlug,
  listPosts,
  getPostBySlug,
  listBlogTaxonomy,
} from '../../services/public.service.js';

/**
 * Public read-only endpoints.
 *
 * This whole namespace is unauthenticated and read-only. Nothing here accepts a
 * write, and every response passes through a serialiser with an explicit field
 * allowlist (see src/serializers/public.js) — which is why employee emails,
 * client contact details, shareholder records and all financial data cannot
 * appear in a response the website reads.
 *
 * Splitting these under /public also means an admin query with a wider include
 * can never be reused here by accident.
 */
const router = Router();

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/v1/public/company
 * Powers the header contact details, footer, and the about page.
 */
router.get('/company', async (request, response) => {
  const profile = await getCompanyProfile();

  // A fresh install has no company row yet. The website handles null and shows
  // its own empty states rather than the site failing to render.
  response.json({ data: profile });
});

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

router.get('/services', async (request, response) => {
  const services = await listServices();
  response.json({ data: { services } });
});

router.get('/services/:slug', async (request, response) => {
  const result = await getServiceBySlug(request.params.slug);

  // 404 rather than an empty body: an unpublished or unknown service must be
  // indistinguishable to a prober.
  if (!result) {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'That service is not available', requestId: request.id },
    });
    return;
  }

  response.json({ data: result });
});

/* -------------------------------------------------------------------------- */
/* Portfolio                                                                  */
/* -------------------------------------------------------------------------- */

router.get('/portfolio', v('publicPortfolio'), async (request, response) => {
  const { page, pageSize, service, featured } = query(request);

  const result = await listProjects({
    page,
    pageSize,
    serviceSlug: service || null,
    featured: featured === true,
  });

  response.json({ data: result.projects, meta: result.meta });
});

router.get('/portfolio/:slug', async (request, response) => {
  const result = await getProjectBySlug(request.params.slug);

  if (!result) {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'That project is not available', requestId: request.id },
    });
    return;
  }

  response.json({ data: result });
});

/* -------------------------------------------------------------------------- */
/* Team & clients                                                             */
/* -------------------------------------------------------------------------- */

/** GET /api/v1/public/team — public employees only, contact details excluded. */
router.get('/team', async (request, response) => {
  const team = await listTeam();
  response.json({ data: { team } });
});

/** GET /api/v1/public/clients — only clients an admin has opted in. */
router.get('/clients', async (request, response) => {
  const clients = await listPublicClients();
  response.json({ data: { clients } });
});

/** GET /api/v1/public/testimonials */
router.get('/testimonials', async (request, response) => {
  const testimonials = await listTestimonials({ limit: 6 });
  response.json({ data: { testimonials } });
});

/* -------------------------------------------------------------------------- */
/* Careers                                                                    */
/* -------------------------------------------------------------------------- */

router.get('/jobs', async (request, response) => {
  const jobs = await listJobs();
  response.json({ data: { jobs } });
});

router.get('/jobs/:slug', async (request, response) => {
  const result = await getJobBySlug(request.params.slug);
  if (!result) {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'That role is not available', requestId: request.id },
    });
    return;
  }
  response.json({ data: result });
});

/* -------------------------------------------------------------------------- */
/* Blog                                                                       */
/* -------------------------------------------------------------------------- */

router.get('/blog', v('publicBlog'), async (request, response) => {
  const { page, pageSize, category, tag } = query(request);

  const result = await listPosts({
    page,
    pageSize,
    categorySlug: category || null,
    tagSlug: tag || null,
  });

  response.json({ data: result.posts, meta: result.meta });
});

router.get('/blog/:slug', async (request, response) => {
  const result = await getPostBySlug(request.params.slug);

  // A draft post and a nonexistent post both return 404, so drafts cannot be
  // discovered by guessing slugs.
  if (!result) {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'That article is not available', requestId: request.id },
    });
    return;
  }

  response.json({ data: result });
});

router.get('/blog-taxonomy', async (request, response) => {
  const taxonomy = await listBlogTaxonomy();
  response.json({ data: taxonomy });
});

export default router;