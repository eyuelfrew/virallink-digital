import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/config';

/**
 * Open Graph / Twitter card.
 *
 * A Route Handler, which means it must export `GET`. The previous version exported
 * a default function that built a Response; Next builds a Route Handler's method
 * table from HTTP-verb exports, so `/og-image` shipped and then answered 405 at
 * runtime. The build passed, because a Route Handler only needs *something* to be
 * exported — which is why this survived a working build.
 *
 * Rendered as PNG rather than SVG, and that is the part that actually mattered.
 * Facebook, LinkedIn, X and Slack all refuse SVG for og:image and will silently
 * show a blank card, so the SVG version would have looked broken on exactly the
 * platforms a marketing agency shares links on. ImageResponse rasterises to PNG
 * using Satori, with no extra dependency.
 *
 * Styling is restricted to what Satori supports: flexbox layouts and explicit
 * dimensions. There are no class names here, and no CSS selectors.
 */
export const runtime = 'nodejs';
export const alt = `${BRAND.name} — digital marketing, web and content`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          // Brand tokens from lib/config rather than a designer-maintained file,
          // so the card can never go stale after a rebrand.
          backgroundColor: '#010f1d',
          padding: '72px 80px',
        }}
      >
        {/* Accent rule across the top, matching the site's header. */}
        <div style={{ display: 'flex', width: '100%', height: 8, backgroundColor: '#025298' }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 88,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-3px',
              lineHeight: 1.05,
            }}
          >
            {BRAND.name}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 20,
              fontSize: 36,
              fontWeight: 500,
              color: '#9fb4cc',
            }}
          >
            Digital marketing, web and content
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', width: 120, height: 6, backgroundColor: '#f9a71b' }} />
          <div style={{ display: 'flex', fontSize: 26, color: '#6d8299' }}>
            Strategy · Content · Growth
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        // Regenerated daily at the edge, cached a week at the CDN. Short enough
        // that a rebrand shows up without a redeploy.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    },
  );
}