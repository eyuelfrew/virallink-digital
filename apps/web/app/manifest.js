import { SITE_URL, ADMIN_PATH, BRAND } from '@/lib/config';

/**
 * Web app manifest.
 *
 * Gives the site a name and icons when installed on a home screen, and declares
 * the display mode. Kept small: everything here is cached by the browser, so a
 * change needs a redeploy.
 */
export default function manifest() {
  return {
    name: `${BRAND.name} — digital marketing agency`,
    short_name: BRAND.name,
    description: 'Digital marketing, web and content services.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: BRAND.primaryColor,
    lang: 'en',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // The admin area is never offered as an installable surface.
    shortcuts: [
      {
        name: 'Contact',
        url: '/contact',
      },
      {
        name: 'Case studies',
        url: '/portfolio',
      },
    ],
  };
}

export { SITE_URL, ADMIN_PATH };