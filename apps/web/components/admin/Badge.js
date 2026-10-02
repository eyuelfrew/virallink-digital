import { cn } from '@/lib/utils';
import { formatDate, formatRelative } from '@virallink/shared/format';
import { STATUS_LABELS } from '@virallink/shared/enums';

/**
 * Status badge.
 *
 * The label text always accompanies the colour, so the state is readable without
 * relying on hue — the WCAG requirement, and simply better for anyone who does
 * not distinguish these colours.
 */
const TONES = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  accent: 'bg-accent-400/20 text-accent-600',
};

export function Badge({ children, tone = 'neutral', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        TONES[tone] || TONES.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a domain status onto a badge tone, per entity. */
export function StatusBadge({ status, kind = 'generic', className }) {
  const label = STATUS_LABELS[status] || status;

  const maps = {
    project: {
      planning: 'neutral', in_progress: 'brand', review: 'info', on_hold: 'warning',
      completed: 'success', cancelled: 'danger',
    },
    client: { prospect: 'info', active: 'success', inactive: 'neutral', churned: 'danger' },
    inquiry: { new: 'brand', contacted: 'info', qualified: 'warning', converted: 'success', closed: 'neutral' },
    transaction: { pending: 'warning', completed: 'success', failed: 'danger', refunded: 'neutral' },
    invoice: {
      draft: 'neutral', issued: 'info', partially_paid: 'warning',
      paid: 'success', overdue: 'danger', void: 'neutral',
    },
    employee: { active: 'success', on_leave: 'warning', inactive: 'neutral' },
    shareholder: { active: 'success', inactive: 'neutral', exited: 'danger' },
    generic: {},
  };

  const tone = maps[kind]?.[status] || 'neutral';

  // Publication is its own badge because it is a separate axis from workflow status.
  if (kind === 'publish') {
    return (
      <Badge tone={status ? 'success' : 'neutral'} className={className}>
        {status ? 'Published' : 'Draft'}
      </Badge>
    );
  }

  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

/** Yes/no indicator. */
export function BooleanBadge({ value, trueLabel = 'Yes', falseLabel = 'No' }) {
  return <Badge tone={value ? 'success' : 'neutral'}>{value ? trueLabel : falseLabel}</Badge>;
}

/** Date, with an absolute value in the title attribute for precision. */
export function DateCell({ value, relative = false, className }) {
  if (!value) return <span className="text-ink-subtle">—</span>;

  return (
    <time dateTime={new Date(value).toISOString()} title={formatDate(value, { withTime: true })} className={className}>
      {relative ? formatRelative(value) : formatDate(value)}
    </time>
  );
}

/** Monospaced figure, so digits line up down a column. */
export function MoneyCell({ amount, currency = 'ETB', className }) {
  if (amount === null || amount === undefined || amount === '') {
    return <span className="text-ink-subtle">—</span>;
  }

  const numeric = Number(amount);

  return (
    <span className={cn('font-mono text-[0.8125rem] tabular-nums', className)}>
      {Number.isFinite(numeric)
        ? new Intl.NumberFormat('en-ET', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
          }).format(numeric)
        : '—'}
    </span>
  );
}

/** Small count, right-aligned, for a numeric column. */
export function NumberCell({ value, className }) {
  if (value === null || value === undefined) return <span className="text-ink-subtle">—</span>;

  return (
    <span className={cn('font-mono text-[0.8125rem] tabular-nums', className)}>
      {new Intl.NumberFormat('en-ET').format(Number(value) || 0)}
    </span>
  );
}

export default Badge;