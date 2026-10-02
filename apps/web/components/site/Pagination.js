import { cn } from '@/lib/utils';

/**
 * Pagination.
 *
 * Renders as a real navigation landmark with a label, and each link carries
 * rel="prev"/"rel="next" so crawlers can walk the pagination rather than
 * treating every page number as an unrelated URL.
 */
export function Pagination({ page, totalPages, basePath, className }) {
  if (!totalPages || totalPages <= 1) return null;

  const href = (target) => (target <= 1 ? basePath : `${basePath}?page=${target}`);

  const numbers = buildNumbers(page, totalPages);

  return (
    <nav aria-label="Pagination" className={cn('mt-12 flex justify-center', className)}>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <a
              href={href(page - 1)}
              rel="prev"
              className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:border-brand-300 hover:text-brand-600"
            >
              Previous
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-10 cursor-not-allowed items-center rounded-md border border-line px-3 text-sm font-medium text-ink-subtle opacity-50"
            >
              Previous
            </span>
          )}
        </li>

        {numbers.map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-subtle">
              …
            </li>
          ) : (
            <li key={entry}>
              <a
                href={href(entry)}
                // The current page is a link with aria-current, which is what a
                // screen reader announces as "page 3, current page".
                aria-current={entry === page ? 'page' : undefined}
                rel={entry === page + 1 ? 'next' : undefined}
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-md text-sm font-medium transition-colors',
                  entry === page
                    ? 'bg-brand-500 text-white'
                    : 'border border-line text-ink-soft hover:border-brand-300 hover:text-brand-600',
                )}
              >
                {entry}
              </a>
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <a
              href={href(page + 1)}
              rel="next"
              className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:border-brand-300 hover:text-brand-600"
            >
              Next
            </a>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-10 cursor-not-allowed items-center rounded-md border border-line px-3 text-sm font-medium text-ink-subtle opacity-50"
            >
              Next
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

/**
 * Page numbers with ellipses: 1 … 4 [5] 6 … 20
 * Keeps the control a fixed width on both a short and a long list.
 */
function buildNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (unused, index) => index + 1);

  const pages = new Set([1, total, current]);
  for (let offset = 1; offset <= 2; offset += 1) {
    pages.add(current - offset);
    pages.add(current + offset);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result = [];
  let previous = 0;

  for (const entry of sorted) {
    if (previous && entry - previous > 1) result.push('gap');
    result.push(entry);
    previous = entry;
  }

  return result;
}

export default Pagination;