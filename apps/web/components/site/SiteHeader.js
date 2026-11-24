import Link from 'next/link';
import Image from 'next/image';
import { FOOTER_NAV, BRAND } from '@/lib/config';
import SiteHeaderNav from './SiteHeaderNav';
/**
 * Site header (server shell).
 *
 * The interactive, scroll-reactive bar itself is a Client Component; this
 * Server Component only hands down the database-backed contact details. Keeping
 * the split means the navigation markup and its data still render on the
 * server, and the browser only hydrates the small piece that listens to scroll.
 */
export function SiteHeader({ company }) {
  return <SiteHeaderNav company={company} />;
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