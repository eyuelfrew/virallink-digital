import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Breadcrumbs.
 *
 * Two jobs at once: it tells a visitor where they are, and it emits BreadcrumbList
 * structured data, which is what produces the path shown under a result in
 * Google. Both come from one component so they can never disagree.
 *
 * The final item is the current page and is not a link. A link to the page you
 * are already on is a common accessibility mistake.
 */
export function Breadcrumbs({ trail, className, tone = 'light' }) {
  if (!trail?.length) return null;

  const dark = tone === 'dark';

  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;

          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {isLast ? (
                <span
                  className={cn('font-medium', dark ? 'text-white' : 'text-ink')}
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <>
                  <Link
                    href={item.href}
                    className={cn(
                      'rounded-sm transition-colors hover:underline',
                      dark ? 'text-white/70 hover:text-white' : 'text-ink-muted hover:text-brand-600',
                    )}
                  >
                    {item.label}
                  </Link>
                  <ChevronRight
                    className={cn('size-3.5 shrink-0', dark ? 'text-white/40' : 'text-ink-subtle')}
                    aria-hidden="true"
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;