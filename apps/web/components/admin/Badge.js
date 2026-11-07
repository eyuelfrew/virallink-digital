import { cn } from '@/lib/utils';
import { formatDate, formatRelative } from '@virallink/shared/format';
import {
  STATUS_LABELS,
  TASK_PRIORITY,
  TASK_PRIORITY_LABELS,
  TASK_STATUS,
  TASK_STATUS_LABELS,
} from '@virallink/shared/enums';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  Eye,
  Flame,
  Minus,
  XCircle,
} from 'lucide-react';

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

/**
 * Colour-coded task badges.
 *
 * Task workflow and priority are two independent axes, and both carry meaning at
 * a glance, so each gets its own colour and glyph. Colour is never the only
 * signal: every badge pairs a hue with an icon and the label text, which keeps
 * the board readable for anyone who does not distinguish these colours.
 */
const TASK_STATUS_LOOK = {
  [TASK_STATUS.TODO]: { tone: 'neutral', Icon: Circle },
  [TASK_STATUS.IN_PROGRESS]: { tone: 'brand', Icon: CircleDot },
  [TASK_STATUS.REVIEW]: { tone: 'info', Icon: Eye },
  [TASK_STATUS.BLOCKED]: { tone: 'danger', Icon: Ban },
  [TASK_STATUS.DONE]: { tone: 'success', Icon: CheckCircle2 },
  [TASK_STATUS.CANCELLED]: { tone: 'neutral', Icon: XCircle },
};

export function TaskStatusBadge({ status, className }) {
  const look = TASK_STATUS_LOOK[status] || { tone: 'neutral', Icon: Circle };

  return (
    <Badge tone={look.tone} className={cn('gap-1', className)}>
      <look.Icon className="size-3 shrink-0" aria-hidden="true" />
      {TASK_STATUS_LABELS[status] || status}
    </Badge>
  );
}

const TASK_PRIORITY_LOOK = {
  [TASK_PRIORITY.LOW]: { tone: 'neutral', Icon: ArrowDown },
  [TASK_PRIORITY.MEDIUM]: { tone: 'info', Icon: Minus },
  [TASK_PRIORITY.HIGH]: { tone: 'warning', Icon: ArrowUp },
  [TASK_PRIORITY.URGENT]: { tone: 'danger', Icon: Flame },
};

export function TaskPriorityBadge({ priority, className }) {
  const look = TASK_PRIORITY_LOOK[priority] || { tone: 'neutral', Icon: Minus };

  return (
    <Badge tone={look.tone} className={cn('gap-1', className)}>
      <look.Icon className="size-3 shrink-0" aria-hidden="true" />
      {TASK_PRIORITY_LABELS[priority] || priority}
    </Badge>
  );
}

/** A left-hand accent bar for a task row, keyed to how urgent it is. */
export const TASK_PRIORITY_BAR = {
  [TASK_PRIORITY.LOW]: 'bg-line-strong',
  [TASK_PRIORITY.MEDIUM]: 'bg-brand-300',
  [TASK_PRIORITY.HIGH]: 'bg-warning',
  [TASK_PRIORITY.URGENT]: 'bg-danger',
};

/**
 * Due date, made loud when it matters.
 *
 * Overdue is bold red with the word "Overdue" spelled out; a date within two
 * days turns amber; anything finished or distant stays quiet. The exact date is
 * always present, so the emphasis never hides the real value.
 */
export function DueCell({ value, status, className }) {
  if (!value) return <span className="text-ink-subtle">—</span>;

  const finished = status === TASK_STATUS.DONE || status === TASK_STATUS.CANCELLED;
  const due = new Date(value);
  const today = new Date();

  const atDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((atDay(due) - atDay(today)) / 86400000);

  const overdue = !finished && days < 0;
  const soon = !finished && days >= 0 && days <= 2;

  const tone = finished
    ? 'text-ink-subtle'
    : overdue
      ? 'font-semibold text-danger'
      : soon
        ? 'font-medium text-warning'
        : 'text-ink-muted';

  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs', tone, className)}>
      <CalendarClock className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      {overdue ? (
        <>
          <span className="font-semibold">Overdue</span>
          <span className="text-ink-subtle" aria-hidden="true">·</span>
        </>
      ) : null}
      <span>{formatDate(value)}</span>
    </span>
  );
}

/** Initials chip for a task assignee, so the eye can find a name fast. */
export function AssigneeChip({ name, className }) {
  if (!name) return <span className="text-ink-subtle">Unassigned</span>;

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-50 text-[10px] font-semibold text-brand-700">
        {initials}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

export default Badge;