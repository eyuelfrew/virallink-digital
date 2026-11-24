'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PUBLIC_NAV, BRAND } from '@/lib/config';
import { cn } from '@/lib/utils';
import BrandLogo from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/site/ThemeToggle';

/**
 * Public site header — scroll-reactive.
 *
 * Three things happen as the visitor scrolls, all driven by one rAF-throttled
 * scroll listener:
 *
 *  1. **Compact / float.** Past the first 48px the bar lifts off the edges into
 *     a rounded, shadowed pill. This is the "floating nav" moment.
 *  2. **Hide on the way down, reveal on the way up.** Below 220px of travel the
 *     bar slides out of view when scrolling down and returns when scrolling up,
 *     which keeps the reading area clear without ever removing the navigation.
 *  3. **Reading progress.** A gold line along the pill's lower edge fills with
 *     the fraction of the page read.
 *
 * Reduced-motion visitors get none of the movement: the bar simply stays put,
 * and the progress line still updates because it carries no motion of its own.
 */

/** Distance scrolled before the bar is allowed to hide. */
const HIDE_AFTER_PX = 220;
/** Extra travel needed before a direction change registers, so a jittery thumb
 *  does not flicker the bar in and out. */
const HIDE_HYSTERESIS_PX = 6;

export default function SiteHeaderNav({ company }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  const lastY = useRef(0);
  const frame = useRef(null);
  const menuRef = useRef(null);

  /* Honour the OS motion preference, live. */
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onChange = (event) => setReduced(event.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const update = () => {
      frame.current = null;

      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      // A short page has nothing to fill; leave the line empty rather than full.
      setProgress(max > 0 ? Math.min(window.scrollY / max, 1) : 0);

      const y = window.scrollY;
      setScrolled(y > 48);

      // An open mobile menu must never slide away under the finger that opened it.
      if (menuRef.current?.open) {
        setHidden(false);
      } else if (reduced) {
        setHidden(false);
      } else if (y > HIDE_AFTER_PX && y > lastY.current + HIDE_HYSTERESIS_PX) {
        setHidden(true);
      } else if (y < lastY.current - HIDE_HYSTERESIS_PX || y <= HIDE_AFTER_PX) {
        setHidden(false);
      }

      lastY.current = y;
    };

    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(update);
    };

    update();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [reduced]);

  const contact = {
    phone: company?.phone,
    email: company?.email,
  };

  // A nav item is active when the current path is that item or a child of it
  // (e.g. /services/search-engine-optimization highlights "Services").
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-line bg-surface shadow-sm',
        'transition-transform duration-300 motion-reduce:transition-none',
        hidden ? '-translate-y-[130%]' : 'translate-y-0',
      )}
      // While tucked away the bar is invisible and out of the tab order.
      inert={hidden || undefined}
    >
      <div
        className={cn(
          'container-page flex items-center justify-between gap-4',
          'transition-[height] duration-300 motion-reduce:transition-none',
          scrolled ? 'h-14' : 'h-16 lg:h-[4.5rem]',
        )}
      >
        <Link href="/" className="flex shrink-0 items-center" aria-label={`${BRAND.name} home`}>
          <BrandLogo
            className={cn(
              'w-auto transition-[height] duration-300 motion-reduce:transition-none',
              scrolled ? 'h-7 lg:h-8' : 'h-8 lg:h-9',
            )}
            priority
          />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'nav-link relative inline-flex h-9 items-center rounded-md px-3 text-sm font-medium',
                    'transition-colors',
                    isActive(item.href)
                      ? 'text-brand-700 dark:text-accent-400'
                      : 'text-ink-soft hover:text-brand-700 dark:hover:text-accent-400',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                  )}
                >
                  {item.label}
                  {isActive(item.href) ? (
                    <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent-400" aria-hidden="true" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {contact.phone ? (
            <a
              href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
              className="hidden font-mono text-sm font-medium text-brand-600 transition-opacity hover:text-brand-700 xl:block"
            >
              {contact.phone}
            </a>
          ) : null}

          <Link
            href="/contact"
            className={cn(
              'btn-shine group relative hidden h-10 items-center gap-2 overflow-hidden rounded-md px-4 text-sm font-semibold text-white sm:inline-flex',
              'bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_4px_14px_-4px_rgba(2,82,152,0.6)]',
              'transition-all duration-200 hover:from-brand-500 hover:to-brand-400 hover:shadow-[0_6px_20px_-4px_rgba(2,82,152,0.7)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
            )}
          >
            <span className="relative z-10">Start a project</span>
            <svg className="relative z-10 size-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <MobileMenuToggle ref={menuRef} isActive={isActive} />
        </div>

        {/* Reading progress: one thin line along the very bottom of the bar. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]">
          <span
            className="block h-full origin-left bg-accent-400"
            style={{ transform: `scaleX(${progress})` }}
          />
        </span>
      </div>
    </header>
  );
}

/**
 * Mobile menu.
 *
 * A Client Component (it forwards a ref to the `<details>` so the header can
 * keep itself visible while it is open). Still a disclosure rather than a
 * slide-over: it works without JS, has no focus trap, and needs no animation
 * library.
 */
const MobileMenuToggle = forwardRef(function MobileMenuToggle({ isActive }, ref) {
  return (
    <details ref={ref} className="group relative lg:hidden">
      <summary
        className={cn(
          'flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-line',
          'text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
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

      <div className="absolute right-2 top-[calc(100%+1rem)] z-50 w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-line bg-surface p-2 shadow-xl dark:border-white/10 dark:bg-brand-950/90 sm:right-3">
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2.5 text-sm font-medium',
                    isActive(item.href)
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-accent-400'
                      : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10',
                  )}
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
            className="mt-2 block rounded-md bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(2,82,152,0.6)]"
          >
            Start a project →
          </Link>
        </div>
      </div>
    </details>
  );
});
