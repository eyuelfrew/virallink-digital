import { INTERNAL_API_URL, REVALIDATE } from './config.js';
import { PUBLIC_TAGS } from './publicCache.js';
import { withQuery } from './utils.js';

/**
 * API client for server-side rendering.
 *
 * Server Components call the API directly at INTERNAL_API_URL, forwarding the
 * caller's cookies. Client Components use `browserApiUrl` from `lib/config.js`
 * and call the API from the browser instead; no Next.js route handler is
 * involved in either path.
 *
 * Failure policy: this never throws on a non-2xx response. A page must render
 * with an empty state rather than a 500 because one endpoint hiccupped, so every
 * helper returns a fallback and records the problem. `apiFetchOrThrow` exists for
 * the admin mutations, where a failure must surface to the user.
 */

/** Attach cookies from a Request so the API sees the admin's session. */
function withCookies(headers, cookieHeader) {
  if (!cookieHeader) return headers;
  return { ...headers, cookie: cookieHeader };
}

function buildHeaders({ method = 'GET', body, extra = {} } = {}) {
  const headers = {
    Accept: 'application/json',
    ...extra,
  };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-Requested-With'] = 'fetch';

  return headers;
}

function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = INTERNAL_API_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Core fetch. Returns `{ ok, status, data }` and never throws for HTTP errors.
 */
/**
 * Per-request timeout.
 *
 * Without this, an unreachable or slow API leaves the server render pending
 * indefinitely. On shared hosting that accumulates until the process hits its
 * memory ceiling and Passenger kills it. Generous enough for a cold connection
 * on a slow host, short enough that a hung request is abandoned quickly.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS) || 8000;

async function request(path, { method = 'GET', body, cookie, headers: extraHeaders, signal, cache = 'no-store', next } = {}) {
  try {
    // Combine any caller-supplied signal with the timeout, so a caller can still
    // cancel early without losing the deadline.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const response = await fetch(resolveUrl(path), {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      method,
      headers: withCookies(buildHeaders({ method, body, extra: extraHeaders }), cookie),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache,
      /*
       * The caller's `next` has to win. `cachedGet` asks for a specific
       * revalidation window, and dropping it left `cache: 'force-cache'` with no
       * revalidate at all — which Next treats as "cache forever". The first
       * render of a public page then froze whatever the API returned at that
       * moment, so publishing an employee changed nothing on the site until the
       * server was restarted.
       */
      next: next ?? { revalidate: cache === 'no-store' ? 0 : undefined },
    });

    const text = await response.text();
    /*
     * Named `payload`, not `body`. The destructured `body` parameter above is
     * shadowed for the whole function body by a same-named `let`, which sits in
     * the temporal dead zone until this line executes. Referencing `body` while
     * building the fetch options threw "Cannot access 'body' before
     * initialization" on every single call, before the request was ever made —
     * so every API read silently degraded to its fallback and no request reached
     * the API at all.
     */
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    /*
     * Only a successful response exposes `data`. A failure returns null so a
     * caller's `data || []` fallback does exactly that — returning the error
     * envelope here once made a validation failure surface downstream as a
     * non-iterable "array", crashing list rendering far from the cause.
     */
    const data = response.ok ? payload?.data ?? payload : null;

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: payload?.error ?? null,
      meta: payload?.meta ?? null,
      totals: payload?.totals ?? null,
    };
  } catch (error) {
    // A network failure to the API must not take the public site down.
    return { ok: false, status: 0, data: null, error: { code: 'NETWORK_ERROR', message: error.message }, meta: null };
  }
}

/** Like request, but throws an Error carrying the API's message. */
async function requestOrThrow(path, options = {}) {
  const result = await request(path, options);
  if (!result.ok) {
    const error = new Error(result.error?.message || `Request failed with status ${result.status}`);
    error.status = result.status;
    error.code = result.error?.code;
    error.details = result.error?.details;
    throw error;
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Public reads                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Cached read for public content.
 *
 * The Next data cache handles revalidation here, which is what keeps repeat
 * visits fast on shared hosting. Each read carries a tag, so an admin write can
 * purge exactly the content it affected (see `publicCache.js`).
 */
function cachedGet(path, revalidateSeconds, tag) {
  return request(path, {
    cache: 'force-cache',
    next: tag ? { revalidate: revalidateSeconds, tags: [tag] } : { revalidate: revalidateSeconds },
  });
}

export async function fetchCompany() {
  const { data } = await cachedGet('/api/v1/public/company', REVALIDATE.company, PUBLIC_TAGS.company);
  return data?.company || null;
}

export async function fetchServices() {
  const { data } = await cachedGet('/api/v1/public/services', REVALIDATE.services, PUBLIC_TAGS.services);
  return data?.services || [];
}

export async function fetchService(slug) {
  const { data, ok } = await cachedGet(
    `/api/v1/public/services/${encodeURIComponent(slug)}`,
    REVALIDATE.services,
    PUBLIC_TAGS.services,
  );
  return ok ? data : null;
}

export async function fetchProjects({ page = 1, pageSize = 12, service = null, featured = false } = {}) {
  const path = withQuery('/api/v1/public/portfolio', {
    page,
    pageSize,
    service: service || undefined,
    featured: featured ? 'true' : undefined,
  });

  const { data, meta } = await cachedGet(path, REVALIDATE.projects, PUBLIC_TAGS.portfolio);
  return { projects: data || [], meta: meta || { page, pageSize, total: 0, totalPages: 0 } };
}

export async function fetchProject(slug) {
  const { data, ok } = await cachedGet(
    `/api/v1/public/portfolio/${encodeURIComponent(slug)}`,
    REVALIDATE.project,
    PUBLIC_TAGS.portfolio,
  );
  return ok ? data?.project || null : null;
}

export async function fetchFeaturedProjects(limit = 4) {
  const { projects } = await fetchProjects({ pageSize: limit, featured: true });
  return projects;
}

export async function fetchTeam() {
  const { data } = await cachedGet('/api/v1/public/team', REVALIDATE.team, PUBLIC_TAGS.team);
  return data?.team || [];
}

export async function fetchPublicClients() {
  const { data } = await cachedGet('/api/v1/public/clients', REVALIDATE.clients, PUBLIC_TAGS.clients);
  return data?.clients || [];
}

export async function fetchTestimonials(limit = 6) {
  const { data } = await cachedGet('/api/v1/public/testimonials', REVALIDATE.clients, PUBLIC_TAGS.testimonials);
  return (data?.testimonials || []).slice(0, limit);
}

export async function fetchJobs() {
  const { data } = await cachedGet('/api/v1/public/jobs', REVALIDATE.jobs, PUBLIC_TAGS.jobs);
  return data?.jobs || [];
}

export async function fetchJob(slug) {
  const { data, ok } = await cachedGet(
    `/api/v1/public/jobs/${encodeURIComponent(slug)}`,
    REVALIDATE.jobs,
    PUBLIC_TAGS.jobs,
  );
  return ok ? data?.job || null : null;
}

export async function fetchPosts({ page = 1, pageSize = 10, category = null, tag = null } = {}) {
  const path = withQuery('/api/v1/public/blog', {
    page,
    pageSize,
    category: category || undefined,
    tag: tag || undefined,
  });

  const { data, meta } = await cachedGet(path, REVALIDATE.posts, PUBLIC_TAGS.blog);
  return { posts: data || [], meta: meta || { page, pageSize, total: 0, totalPages: 0 } };
}

export async function fetchPost(slug) {
  const { data, ok } = await cachedGet(
    `/api/v1/public/blog/${encodeURIComponent(slug)}`,
    REVALIDATE.post,
    PUBLIC_TAGS.blog,
  );
  return ok ? data?.post || null : null;
}

export async function fetchBlogTaxonomy() {
  const { data } = await cachedGet('/api/v1/public/blog-taxonomy', REVALIDATE.posts, PUBLIC_TAGS.blog);
  return { categories: data?.categories || [], tags: data?.tags || [] };
}

/** Related posts, excluding the current one. */
export async function fetchRelatedPosts(post, limit = 3) {
  if (!post) return [];

  const categorySlug = post.categories?.[0]?.slug;
  const { posts } = await fetchPosts({ pageSize: limit + 1, category: categorySlug || null });

  return posts.filter((item) => item.slug !== post.slug).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Authenticated admin reads                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Admin reads pass the incoming cookie header through, so the API sees the same
 * session the browser holds. These are never cached: admin data is per-user and
 * must reflect a change immediately.
 */
export function adminGet(path, cookie) {
  return request(path, { cookie, cache: 'no-store' });
}

export function adminSend(path, { method = 'POST', body, cookie } = {}) {
  return requestOrThrow(path, { method, body, cookie, cache: 'no-store' });
}

export async function fetchDashboard(cookie) {
  const { data } = await adminGet('/api/v1/dashboard/summary', cookie);
  return data;
}

export async function fetchSession(cookie) {
  const { data, ok } = await adminGet('/api/v1/auth/me', cookie);
  return ok ? data?.user || null : null;
}

export { request, requestOrThrow, resolveUrl };
export default {
  fetchCompany,
  fetchServices,
  fetchService,
  fetchProjects,
  fetchProject,
  fetchFeaturedProjects,
  fetchTeam,
  fetchPublicClients,
  fetchTestimonials,
  fetchJobs,
  fetchJob,
  fetchPosts,
  fetchPost,
  fetchBlogTaxonomy,
  fetchRelatedPosts,
  fetchDashboard,
  fetchSession,
  adminGet,
  adminSend,
};