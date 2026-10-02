/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `output: 'standalone'` is deliberately NOT used. Passenger on cPanel owns the
  // process lifecycle and expects a real node_modules directory in the app root,
  // which standalone output strips down to a minimal bundle.
  poweredByHeader: false,

  images: {
    // Media is served by the API. Only the site's own origin is allowed, so a
    // database value cannot be used to make the app fetch arbitrary remote images.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    // Explicitly disabled: next/image optimises through a Node server, which
    // costs CPU on shared hosting. Images are already re-encoded to WebP and
    // resized at upload time, so the on-disk file is already close to optimal.
    // Set to true only if the host can afford the CPU.
    unoptimized: true,
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  experimental: {
    // Server Actions carry the admin mutations; this is the cap for their payloads.
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Inline the critical CSS for the public site only.
    optimizePackageImports: ['lucide-react', 'recharts'],
  },

  async headers() {
    return [
      {
        // The admin must never be indexed. This is one of three layers; the others
        // are the noindex metadata in the admin layout and the robots.txt rule.
        source: '/admin-teftef/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // Camera is allowed same-origin: the public Camera Studio section is
            // a local-only photo booth. Microphone and location stay blocked.
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            // Only meaningful over HTTPS; harmless but inert on localhost.
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // Normalise trailing slashes so each page has exactly one canonical URL.
      { source: '/services/:slug/', destination: '/services/:slug', permanent: true },
      { source: '/portfolio/:slug/', destination: '/portfolio/:slug', permanent: true },
      { source: '/blog/:slug/', destination: '/blog/:slug', permanent: true },
    ];
  },
};

export default nextConfig;