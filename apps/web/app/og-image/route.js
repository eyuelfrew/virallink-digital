import { ImageResponse } from 'next/og';
import { BRAND, PUBLIC_API_URL } from '@/lib/config';

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

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 180;

/**
 * Media URLs arrive from the API as site-relative `/media/<key>` paths. Turn
 * those into an absolute URL on the API's public origin so Satori can fetch the
 * bytes. Nothing else is accepted — this route must not become a proxy that
 * fetches arbitrary caller-supplied hosts.
 */
function allowedImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const apiBase = String(PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (value.startsWith('/media/')) return `${apiBase}/api/v1/${value.slice(1)}`;

  const allowed = `${apiBase}/api/v1/media/`;
  return value.startsWith(allowed) ? value : null;
}

/**
 * Fetch the cover once, with a deadline and a size cap, and hand Satori a data
 * URL. A missing or slow media file must degrade to the brand card, not leave a
 * social crawler waiting on an unbounded fetch.
 */
async function socialImageSrc(raw) {
  const url = allowedImageUrl(raw);
  if (!url) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) return null;

    const mime = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const title = String(params.get('title') || '').trim().slice(0, MAX_TITLE) ||
    `${BRAND.name} — digital marketing, web and content`;
  const description = String(params.get('description') || '').trim().slice(0, MAX_DESCRIPTION) ||
    'Strategy · Content · Growth';
  const imageSrc = await socialImageSrc(params.get('image'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          // Brand tokens from lib/config rather than a designer-maintained file,
          // so the card can never go stale after a rebrand.
          backgroundColor: '#010f1d',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: imageSrc ? '62%' : '100%',
            height: '100%',
            padding: '72px 80px',
          }}
        >
          {/* Accent rule across the top, matching the site's header. */}
          <div style={{ display: 'flex', width: '100%', height: 8, backgroundColor: '#025298' }} />

          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                fontSize: title.length > 60 ? 56 : 72,
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-2px',
                lineHeight: 1.1,
                overflow: 'hidden',
              }}
            >
              {title}
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontSize: 28,
                fontWeight: 500,
                color: '#9fb4cc',
                lineHeight: 1.3,
                overflow: 'hidden',
              }}
            >
              {description}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', width: 100, height: 6, backgroundColor: '#f9a71b' }} />
            <div style={{ display: 'flex', fontSize: 24, color: '#6d8299' }}>
              virallinkdigital.com
            </div>
          </div>
        </div>

        {imageSrc ? (
          <div style={{ display: 'flex', width: '38%', height: '100%', backgroundColor: '#0a2036' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : null}
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