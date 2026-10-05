/**
 * Site configuration.
 *
 * Only two values may reach the browser: NEXT_PUBLIC_SITE_URL and
 * NEXT_PUBLIC_API_PUBLIC_URL. Everything else here is either a build-time
 * constant or is read from the database, so no secret can be inlined by
 * mistake.
 *
 * Values that a company would normally want to change per deployment are read
 * from the environment. Everything else is design, not configuration.
 */

/** Public site origin. Falls back to localhost so a build never crashes. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

/**
 * Where the browser should send API requests.
 *
 * Empty in production by design: the admin app calls its own Next.js route
 * handlers, which forward to the API server-side. That removes the CORS hop from
 * the critical path and means the API is never directly reachable from a browser.
 */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_PUBLIC_URL || '';

/**
 * Server-to-server API base. On cPanel this is a loopback address, so calls
 * between the two apps never leave the machine.
 */
export const INTERNAL_API_URL =
  process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

/** The admin area. Its path is deliberately not guessable-looking but is NOT a
 * security control — authentication is what protects it. */
export const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || '/vira-admin';

/** Route prefixes that must never be indexed. */
export const NOINDEX_PREFIXES = [ADMIN_PATH];

/**
 * Brand defaults.
 *
 * These match the tokens in globals.css. They are duplicated here only as the
 * fallback for structured data, which must contain a literal hex value and cannot
 * read a CSS custom property.
 */
export const BRAND = {
  name: 'Virallink',
  primaryColor: '#025298',
  accentColor: '#f9a71b',
  /**
   * The supplied artwork, served as-is from public/brand. `logo.avif` is the
   * original blue-and-gold mark; `logo-white.png` is its monochrome twin for
   * dark bands; the icon tiles are blue squares carrying the white monogram.
   */
  logoPath: '/brand/logo.avif',
  logoWhitePath: '/brand/logo-white.png',
  faviconPath: '/brand/icon-192.png',
};

/** Navigation shown in the public header. */
export const PUBLIC_NAV = [
  { label: 'Services', href: '/services' },
  { label: 'Work', href: '/portfolio' },
  { label: 'About', href: '/about' },
  { label: 'Clients', href: '/clients' },
  { label: 'Team', href: '/team' },
  { label: 'Insights', href: '/blog' },
  { label: 'Careers', href: '/careers' },
];

/** Footer link groups. Contact details are filled from the database. */
export const FOOTER_NAV = [
  {
    heading: 'Services',
    links: [{ label: 'All services', href: '/services' }],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Our clients', href: '/clients' },
      { label: 'Our team', href: '/team' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Case studies', href: '/portfolio' },
      { label: 'Insights', href: '/blog' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
    ],
  },
];

/** Cache lifetimes for server-side data fetching, in seconds. */
export const REVALIDATE = {
  company: 600,
  services: 300,
  projects: 300,
  project: 600,
  posts: 300,
  post: 600,
  team: 600,
  clients: 600,
  jobs: 600,
};

/** Pagination defaults, mirrored by the API's own limits. */
export const PAGE_SIZE = {
  portfolio: 12,
  blog: 10,
  admin: 20,
};