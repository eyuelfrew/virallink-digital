import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';

/**
 * 404.
 *
 * A real status code, so a mistyped or removed URL is not indexed as a soft 404
 * but is reported honestly to a crawler.
 */
export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center">
      <div className="container-page">
        <div className="mx-auto max-w-xl text-center">
          <p className="font-mono text-sm font-medium uppercase tracking-wider text-brand-500">Error 404</p>

          <h1 className="mt-4 text-h1">We could not find that page</h1>

          <p className="mt-5 text-lead text-ink-muted">
            The page may have moved, or the address may be mistyped. The links below will get you back on track.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="/">Back to home</ButtonLink>

            <Link
              href="/contact"
              className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
            >
              Contact us
            </Link>
          </div>

          <nav aria-label="Popular pages" className="mt-12 border-t border-line pt-8">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              {[
                { label: 'Services', href: '/services' },
                { label: 'Case studies', href: '/portfolio' },
                { label: 'About', href: '/about' },
                { label: 'Insights', href: '/blog' },
                { label: 'Careers', href: '/careers' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-brand-600 underline-offset-4 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}