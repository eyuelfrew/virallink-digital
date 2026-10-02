import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/config';

/**
 * A screenshot-style Open Graph card.
 *
 * Rendered as a route so it can be referenced from metadata and JSON-LD. It uses
 * the brand tokens rather than an uploaded asset, so it can never go stale or
 * require a designer to update a file.
 */
export default function OpenGraphImage() {
  return new Response(
    // A minimal SVG. Social platforms that do not accept SVG will fall back to
    // /og-default.png, which is why that file is referenced in lib/seo.js.
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <rect width="1200" height="630" fill="#010f1d"/>
      <rect x="0" y="0" width="1200" height="6" fill="#025298"/>
      <text x="80" y="300" font-family="system-ui, sans-serif" font-size="82" font-weight="800" fill="#ffffff" letter-spacing="-2">${BRAND.name}</text>
      <text x="80" y="372" font-family="system-ui, sans-serif" font-size="34" font-weight="500" fill="#9fb4cc">Digital marketing, web and content</text>
      <rect x="80" y="420" width="120" height="5" fill="#f9a71b"/>
    </svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    },
  );
}

export const runtime = 'nodejs';
export const alt = 'Virallink — digital marketing agency';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/svg+xml';

export { cn };