import { SITE_URL, ADMIN_PATH } from '@/lib/config';

/**
 * robots.txt.
 *
 * Served from a route handler rather than the `robots.js` file convention.
 *
 * The convention expects a module default-exporting a plain string, which Next
 * then feeds into its own handler. During a production build that failed inside
 * Next's route-entry code with "Cannot read properties of undefined (reading
 * 'userAgent')" — a prerendering-stage crash, not a problem with the rules
 * themselves. Returning a Response directly is the documented alternative and
 * prerenders cleanly.
 *
 * Two jobs: allow the public site and its media, and keep the admin area and the
 * API out of the index. This is one of three layers of admin protection:
 *   1. this robots.txt (a crawl directive)
 *   2. per-page `robots: { index: false }` metadata in the admin layouts
 *   3. an `X-Robots-Tag` response header from next.config.mjs and .htaccess
 *
 * None of them is a security control. The admin area is protected by requiring a
 * session, which is the only thing that actually keeps data private.
 */
export const dynamic = 'force-static';

export function GET() {
  const body = [
    'User-agent: *',
    '',
    '# Public site is fully crawlable',
    'Allow: /',
    '',
    '# The administration area and its API must never be indexed or crawled',
    `Disallow: ${ADMIN_PATH}`,
    `Disallow: ${ADMIN_PATH}/`,
    'Disallow: /api/',
    '',
    '# Query-string duplicates of the same content',
    'Disallow: /*?*utm_',
    'Disallow: /*?*page=',
    'Disallow: /*?*search=',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}