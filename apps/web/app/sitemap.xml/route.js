import { SITE_URL, ADMIN_PATH } from '@/lib/config';
import { xmlUrl } from '@/lib/utils';
import { fetchServices, fetchProjects, fetchPosts, fetchJobs } from '@/lib/api';

/**
 * Dynamic sitemap.
 *
 * Built from the database rather than a static list, so publishing a service,
 * case study or article adds it to the sitemap immediately — no redeploy. Only
 * published content is included, so the admin area, drafts and unpublished
 * entries are structurally absent.
 *
 * The admin prefix never appears: no route here emits it, and the final replace is
 * a belt-and-braces guard against a slug ever being chosen to look like one.
 *
 * Resilience: every fetch below is wrapped in `.catch()` and `lib/api.js` returns
 * an empty result rather than throwing, so a failing or slow API call degrades the
 * document to its static half instead of returning a 500. Search engines that hit
 * a 500 on sitemap.xml may stop crawling, which is worse than a short sitemap.
 */

/** Static pages with their relative importance and change frequency. */
const STATIC_PAGES = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/services', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/portfolio', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/clients', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/team', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.8, changeFrequency: 'daily' },
  { path: '/contact', priority: 0.8, changeFrequency: 'yearly' },
  { path: '/careers', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
];

const ORIGIN = SITE_URL.replace(/\/+$/, '');

function toEntry(path, { priority = 0.5, changeFrequency = 'monthly', lastModified = null } = {}) {
  const parts = [`    <loc>${xmlUrl(path, ORIGIN)}</loc>`];
  if (lastModified) parts.push(`    <lastmod>${new Date(lastModified).toISOString()}</lastmod>`);
  parts.push(`    <changefreq>${changeFrequency}</changefreq>`);
  parts.push(`    <priority>${priority.toFixed(1)}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

/**
 * Dynamic sitemap.
 *
 * Every helper in lib/api.js resolves to an empty result rather than throwing, and
 * each is wrapped in `.catch()` here, so a failing or slow API query degrades the
 * sitemap to its static half rather than returning a 500. Search engines that hit
 * a 500 on sitemap.xml may stop crawling the site, which is a far worse outcome
 * than a temporarily shorter sitemap.
 */

/**
 * Regenerated at most once an hour. `revalidate` rather than a static export,
 * because a statically generated sitemap cannot reflect a publish action.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  const entries = STATIC_PAGES.map((page) => toEntry(page.path, page));

  /*
   * Fetched in parallel, and each helper resolves to an empty array rather than
   * throwing. One failing query therefore degrades the sitemap to its static
   * half instead of producing a 500 and taking search console crawling down with
   * it.
   */
  const [services, projects, posts, jobs] = await Promise.all([
    fetchServices().catch(() => []),
    fetchProjects({ pageSize: 48 }).catch(() => ({ projects: [] })),
    // The public blog endpoint caps pageSize at 24; asking for more is a 422.
    fetchPosts({ pageSize: 24 }).catch(() => ({ posts: [] })),
    fetchJobs().catch(() => []),
  ]);

  for (const service of services || []) {
    entries.push(
      toEntry(`/services/${encodeURIComponent(service.slug)}`, {
        priority: 0.8,
        changeFrequency: 'monthly',
        lastModified: service.updatedAt,
      }),
    );
  }

  for (const project of projects?.projects || []) {
    entries.push(
      toEntry(`/portfolio/${encodeURIComponent(project.slug)}`, {
        priority: project.isFeatured ? 0.8 : 0.7,
        changeFrequency: 'monthly',
        lastModified: project.publishedAt,
      }),
    );
  }

  for (const post of posts?.posts || []) {
    entries.push(
      toEntry(`/blog/${encodeURIComponent(post.slug)}`, {
        priority: 0.6,
        changeFrequency: 'yearly',
        lastModified: post.publishedAt,
      }),
    );
  }

  for (const job of jobs || []) {
    entries.push(
      toEntry(`/careers/${encodeURIComponent(job.slug)}`, {
        priority: 0.4,
        changeFrequency: 'weekly',
      }),
    );
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`.split(ADMIN_PATH).join('');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
}