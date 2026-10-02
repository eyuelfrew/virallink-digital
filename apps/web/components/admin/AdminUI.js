import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ADMIN_PATH } from '@/lib/config';

/**
 * Admin page furniture.
 *
 * Each admin page needs the same three things — a title, a description, and an
 * action — so they live here. Consistent headings also mean the admin has a
 * valid outline, which matters for anyone navigating it by keyboard.
 */

export function AdminHeader({ title, description, action, breadcrumb, className }) {
  return (
    <header className={cn('mb-6', className)}>
      {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h3">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-ink-muted">{description}</p> : null}
        </div>

        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

/** Card/panel wrapper for a group of content. */
export function AdminPanel({ title, description, action, children, className, bodyClassName, dense = false }) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface', className)}>
      {title ? (
        <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>

          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}

      <div className={cn(dense ? '' : 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Statistic tile for the dashboard.
 *
 * A figure, not a chart. Charts appear only where a trend genuinely helps.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'default', href }) {
  const tones = {
    default: 'text-brand-500',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {Icon ? <Icon className={cn('size-4 shrink-0', tones[tone])} aria-hidden="true" /> : null}
      </div>

      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink">{value}</p>

      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg border border-line bg-surface p-5 transition-colors hover:border-brand-300"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg border border-line bg-surface p-5">{content}</div>;
}

/** Toolbar above a table: search, filters, actions. */
export function Toolbar({ children, className }) {
  return (
    <div className={cn('flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center', className)}>
      {children}
    </div>
  );
}

/** Simple table shell. Responsive: the wrapper scrolls horizontally rather than the page. */
export function TableWrapper({ children, className }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left', className }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className }) {
  return (
    <td
      className={cn(
        'border-b border-line px-5 py-3 align-middle text-ink-soft',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Placeholder shown while a table or panel is loading. */
export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

/** Table skeleton with a sensible shape, so loading does not jump the layout. */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="p-5">
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: rows }, (unused, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }, (unused2, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-4', columnIndex === 0 ? 'w-1/4' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Link back to the dashboard, used by 403-style pages inside the admin. */
export function BackToDashboard() {
  return (
    <Link
      href={`${ADMIN_PATH}/dashboard`}
      className="text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
    >
      Back to dashboard
    </Link>
  );
}