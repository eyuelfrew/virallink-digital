import Link from 'next/link';
import Image from 'next/image';
import { PUBLIC_NAV, FOOTER_NAV, BRAND } from '@/lib/config';
import { cn } from '@/lib/utils';
import BrandLogo from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/site/ThemeToggle';

/**
 * Site header.
 *
 * A Server Component. Only the mobile menu toggle needs client-side JavaScript,
 * and that is a small isolated component below — the rest of the header renders
 * on the server with no hydration cost.
 *
 * Contact details come from the database rather than being hard-coded, so a
 * change in the admin dashboard is reflected on the next render.
 */
export function SiteHeader({ company }) {
  const contact = {
    phone: company?.phone,
    email: company?.email,
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-6 lg:h-18">
          <Link href="/" className="flex shrink-0 items-center" aria-label={`${BRAND.name} home`}>
            <BrandLogo className="h-8 w-auto lg:h-9" priority />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-ink-soft',
                      'transition-colors hover:bg-brand-50 hover:text-brand-700',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
                className="hidden font-mono text-sm font-medium text-brand-600 hover:text-brand-700 xl:block"
              >
                {contact.phone}
              </a>
            ) : null}

            <Link
              href="/contact"
              className={cn(
                'hidden h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white sm:inline-flex',
                'transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
              )}
            >
              Start a project
            </Link>

            <MobileMenuToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile menu.
 *
 * A Client Component, and the only JavaScript in the header. Implemented as a
 * disclosure rather than a slide-over panel: it works without JS being loaded
 * correctly, has no focus trap to get wrong, and needs no animation library.
 */
function MobileMenuToggle() {
  return (
    <details className="group relative lg:hidden">
      <summary
        className={cn(
          'flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-line',
          'text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          // Hide the default disclosure marker; the icon carries the meaning.
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="sr-only">Menu</span>
        <svg
          className="size-5 transition-transform group-open:rotate-90"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        </svg>
      </summary>

      <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-line bg-surface p-2 shadow-lg">
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-2 border-t border-line pt-2">
          <div className="flex items-center gap-2 px-1">
            <ThemeToggle className="size-9" />
            <span className="text-xs text-ink-subtle">Appearance</span>
          </div>
          <Link
            href="/contact"
            className="mt-2 block rounded-md bg-brand-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
          >
            Start a project
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * Site footer.
 *
 * Contact details and social links are read from the database. Where nothing has
 * been entered, the block is omitted rather than rendered empty — the brief
 * explicitly rules out fake or placeholder content on a public site.
 */
export function SiteFooter({ company }) {
  const year = new Date().getFullYear();

  const socialLinks = (company?.socialLinks || []).filter((link) => link.url);
  const hasContact = company?.phone || company?.email || company?.city;

  return (
    <footer className="border-t border-line bg-surface-muted">
      <div className="container-page py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Identity */}
          <div className="lg:col-span-4">
            <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block">
            {/* Light footer: the full-colour brand mark. In dark mode the footer
                flips to the navy band, where the monochrome variant is used. */}
            <span className="inline-flex items-center gap-2.5">
              <Image
                src={BRAND.logoPath}
                alt=""
                width={96}
                height={58}
                className="h-9 w-auto dark:hidden"
              />
              <Image
                src={BRAND.logoWhitePath}
                alt=""
                width={96}
                height={58}
                className="hidden h-9 w-auto dark:block"
              />
            </span>
            </Link>

            {company?.shortDescription ? (
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">{company.shortDescription}</p>
            ) : null}

            {socialLinks.length ? (
              <ul className="mt-6 flex flex-wrap gap-4">
                {socialLinks.map((link) => (
                  <li key={link.platform}>
                    <a
                      href={link.url}
                      // External links should not pass ranking signal or referrer
                      // data to the destination.
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ink-muted underline-offset-4 hover:text-brand-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      {link.label || link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Link columns */}
          <div className="grid gap-8 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-4">
            {FOOTER_NAV.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  {group.heading}
                </h2>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-soft underline-offset-4 hover:text-brand-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/* Contact */}
          {hasContact ? (
            <div className="lg:col-span-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Get in touch</h2>

              <address className="mt-4 flex flex-col gap-2.5 not-italic">
                {company?.phone ? (
                  <a
                    href={`tel:${company.phone.replace(/[^+\d]/g, '')}`}
                    className="font-mono text-sm text-ink-soft hover:text-brand-600"
                  >
                    {company.phone}
                  </a>
                ) : null}

                {company?.email ? (
                  <a href={`mailto:${company.email}`} className="break-all text-sm text-ink-soft hover:text-brand-600">
                    {company.email}
                  </a>
                ) : null}

                {company?.city || company?.country ? (
                  <span className="text-sm text-ink-muted">
                    {[company.city, company.country].filter(Boolean).join(', ')}
                  </span>
                ) : null}
              </address>
            </div>
          ) : null}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-subtle">
            © {year} {company?.legalName || company?.name || BRAND.name}. All rights reserved.
          </p>

          <p className="text-sm text-ink-subtle">
            <Link href="/privacy" className="underline-offset-4 hover:text-brand-600 hover:underline">
              Privacy
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <Link href="/terms" className="underline-offset-4 hover:text-brand-600 hover:underline">
              Terms
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default SiteHeader;