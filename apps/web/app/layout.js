import { Sora, Inter, JetBrains_Mono } from 'next/font/google';

/**
 * Root layout.
 *
 * Fonts are self-hosted by next/font, so there is no render-blocking request to
 * Google's servers and no layout shift when they arrive. `display: swap` shows
 * text immediately in the fallback rather than blocking on the webfont.
 *
 * The type pairing follows the logo: Sora is a geometric sans with the same
 * engineered feel as the monogram, used for headings; Inter for body text, which
 * stays legible at small sizes; JetBrains Mono for figures in the dashboard,
 * where digits must line up in a column.
 */

const sora = Sora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sora',
  // Only the weights actually used. Each extra weight is a real download.
  weight: ['600', '700', '800'],
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-jb',
  weight: ['400', '500'],
});

import './globals.css';

export const metadata = {
  // Replaced per-page by generateMetadata; this is the fallback only.
  title: 'Virallink',
  description: 'Digital marketing, web and content services.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Not capped: capping zoom breaks accessibility for anyone who needs to magnify.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#025298' },
    { media: '(prefers-color-scheme: dark)', color: '#010f1d' },
  ],
};

/**
 * Theme bootstrap.
 *
 * Runs before first paint: reads the stored choice, falls back to the OS
 * preference, and puts the `dark` class on <html>. Doing this inline — rather
 * than in a hydrating component — is what prevents a flash of the wrong theme.
 * The same key is used by ThemeToggle.
 */
const themeInit = `
(function () {
  try {
    var stored = localStorage.getItem('vl-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
