import { fetchCompany } from '@/lib/api';
import { SiteHeader, SiteFooter } from '@/components/site/SiteHeader';
import ScrollProgress from '@/components/motion/ScrollProgress';

/**
 * Public layout.
 *
 * Fetches the company profile once and passes it to the header, footer and every
 * page that needs it. Next's request memoisation means a page and this layout
 * asking for the same data within one render share a single call.
 *
 * The route group `(public)` does not affect the URL — the pages inside it are
 * served from the root. Its purpose is to keep public chrome separate from the
 * admin layout, so the admin can never inherit the header, footer or metadata of
 * the public site.
 */
export default async function PublicLayout({ children }) {
  // A failure here degrades the header and footer to their no-content states
  // rather than failing the whole page.
  let company = null;

  try {
    company = await fetchCompany();
  } catch {
    company = null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollProgress />

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <SiteHeader company={company} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter company={company} />
    </div>
  );
}