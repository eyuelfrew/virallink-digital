'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';

/**
 * Toolbar for admin tables: search box and select filters.
 *
 * Filters are applied by navigating with query parameters rather than filtering in
 * memory, which means filtering happens in SQL, the URL is shareable, and the
 * server component re-renders with the filtered data. No client-side data
 * fetching, so the page stays a Server Component.
 */

/** A form that submits on change, for the select filters. */
export function AdminToolbar({ basePath, searchPlaceholder = 'Search', currentSearch = '', filters = [], currentFilters = {} }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [term, setTerm] = useState(currentSearch);

  function push(params) {
    // Changing a filter resets the page: staying on page 4 of a list that now
    // has one page is confusing.
    const next = new URLSearchParams(searchParams.toString());
    next.delete('page');

    for (const [key, value] of Object.entries(params)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function submitSearch(event) {
    event.preventDefault();
    push({ search: term.trim() });
  }

  const hasActiveFilters = Object.values(currentFilters).some(Boolean) || Boolean(currentSearch);

  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center">
      <form onSubmit={submitSearch} className="relative flex-1">
        <label htmlFor="admin-search" className="sr-only">
          {searchPlaceholder}
        </label>

        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />

        <input
          id="admin-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
        />
      </form>

      {filters.map((filter) => (
        <div key={filter.name}>
          <label htmlFor={`filter-${filter.name}`} className="sr-only">
            {filter.label}
          </label>

          <select
            id={`filter-${filter.name}`}
            value={currentFilters[filter.name] || ''}
            onChange={(event) => push({ [filter.name]: event.target.value })}
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:outline-none"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() => {
            setTerm('');
            router.replace(basePath, { scroll: false });
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      ) : null}
    </div>
  );
}

/** Empty state inside a table panel. */
export function TableEmpty({ icon, title, description, hasFilters = false }) {
  const EmptyIcon = icon || null;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {EmptyIcon ? <EmptyIcon className="size-8 text-ink-subtle" aria-hidden="true" /> : null}

      <p className="mt-4 text-sm font-semibold text-ink-soft">{title}</p>

      {description ? <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p> : null}

      {hasFilters ? (
        <p className="mt-3 text-xs text-ink-subtle">Try clearing the filters above.</p>
      ) : null}
    </div>
  );
}

/** Pagination row for admin tables. */
export function AdminPagination({ meta, basePath }) {
  const page = meta?.page || 1;
  const totalPages = meta?.totalPages || 0;
  const total = meta?.total || 0;

  if (totalPages <= 1) {
    return total ? (
      <p className="border-t border-line px-5 py-3 text-xs text-ink-subtle">
        {total} {total === 1 ? 'record' : 'records'}
      </p>
    ) : null;
  }

  const href = (target) => (target <= 1 ? basePath : `${basePath}?page=${target}`);

  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3">
      <p className="text-xs text-ink-subtle">
        Page {page} of {totalPages} · {total} records
      </p>

      <div className="flex items-center gap-1.5">
        <PageLink href={href(page - 1)} disabled={page <= 1}>
          Previous
        </PageLink>
        <PageLink href={href(page + 1)} disabled={page >= totalPages}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 cursor-not-allowed items-center rounded-md border border-line px-2.5 text-xs font-medium text-ink-subtle opacity-50">
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium text-ink-soft hover:border-brand-300 hover:text-brand-600"
    >
      {children}
    </a>
  );
}

export { cn };
export default AdminToolbar;