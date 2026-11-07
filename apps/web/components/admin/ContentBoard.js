'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  CONTENT_STAGE_LABELS,
  DELIVERABLE_TYPE_LABELS,
  METRIC_PLATFORM_LABELS,
} from '@virallink/shared/enums';
import {
  AlertTriangle, CalendarDays, Clock, Layers, LayoutGrid, List, Search,
  UserRound, X,
} from 'lucide-react';
import { ContentDetailDialog } from './ContentDetailDialog';
import { NewContentCardDialog } from './NewContentCardDialog';

/**
 * The production board.
 *
 * Drag a card between columns to move it. Two details make that trustworthy
 * rather than a toy:
 *
 *  - **Optimistic, then reconciled.** The card lands in the new column immediately
 *    and rolls back if the save fails. A board that visibly lags on every move gets
 *    abandoned, and one that silently swallows failures gets trusted while lying.
 *
 *  - **A return from approval demands a reason.** The API rejects it and so does
 *    the UI: "client wants a stronger hook" is the single most useful thing you
 *    will read three weeks from now, and it cannot be reconstructed later.
 *
 * Native HTML5 drag-and-drop rather than a library, with a stage select on every
 * card as the touch/keyboard path. The toolbar filters client-side; the board is
 * already fully loaded, so filtering should not cost a round trip.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** One hue per stage, from the design tokens. Inline styles keep Tailwind from
    having to generate a class for every dynamic stage name. */
const STAGE_COLOR = {
  idea: 'var(--stage-idea)',
  brainstorming: 'var(--stage-brainstorming)',
  writing: 'var(--stage-writing)',
  approval: 'var(--stage-approval)',
  revision: 'var(--stage-revision)',
  shooting: 'var(--stage-shooting)',
  editing: 'var(--stage-editing)',
  scheduled: 'var(--stage-scheduled)',
  posted: 'var(--stage-posted)',
};

const AVATAR_COLORS = ['#025298', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#0369a1'];

export function ContentBoard({ board, clients = [], canWrite = true, week, currentEmployeeId = null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local copy so a move is visible before the round trip completes.
  const [columns, setColumns] = useState(board?.columns || []);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [compact, setCompact] = useState(false);

  // Re-sync when the server sends new data. A refresh is only triggered after a
  // save or a navigation, never while an optimistic move is in flight.
  useEffect(() => {
    if (board?.columns) setColumns(board.columns);
  }, [board]);

  const move = useCallback(
    async (cardId, toStage, extra = {}) => {
      const previous = columns;
      const from = columns.find((column) => column.cards.some((card) => card.id === cardId));
      const card = from?.cards.find((entry) => entry.id === cardId);
      if (!card || card.stage === toStage) return;

      setColumns(
        columns.map((column) => {
          if (column.stage === from.stage) {
            return {
              ...column,
              count: column.count - 1,
              cards: column.cards.filter((entry) => entry.id !== cardId),
            };
          }
          if (column.stage === toStage) {
            return {
              ...column,
              count: column.count + 1,
              cards: [{ ...card, stage: toStage, ...extra }, ...column.cards],
            };
          }
          return column;
        }),
      );

      try {
        const response = await fetch(`/api/content/${cardId}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: toStage, ...extra }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setColumns(previous);
          setError(data.error?.message || 'That move could not be saved.');
          return;
        }

        setError(null);
        startTransition(() => router.refresh());
      } catch {
        setColumns(previous);
        setError('The management service did not respond. The card was moved back.');
      }
    },
    [columns, router],
  );

  /** Return from approval needs a reason, so it is asked for rather than assumed. */
  const requestMove = useCallback(
    (cardId, toStage) => {
      if (toStage === 'revision') {
        const reason = window.prompt(
          'What needs changing? This is recorded on the card so whoever picks it up knows what to fix.',
        );
        if (!reason || !reason.trim()) return;
        move(cardId, toStage, { note: reason.trim() });
        return;
      }
      // First move into approval marks that it has been sent to the client.
      move(cardId, toStage, toStage === 'approval' ? { sentForApproval: true } : {});
    },
    [move],
  );

  const allCards = useMemo(() => columns.flatMap((column) => column.cards), [columns]);
  const employeeId = currentEmployeeId === null || currentEmployeeId === undefined
    ? null
    : Number(currentEmployeeId);

  const stats = useMemo(
    () => ({
      all: allCards.length,
      mine: employeeId ? allCards.filter((card) => card.assigneeId === employeeId).length : 0,
      unassigned: allCards.filter((card) => !card.assigneeId).length,
      approval: allCards.filter((card) => card.stage === 'approval').length,
      overdue: allCards.filter(isOverdue).length,
    }),
    [allCards, employeeId],
  );

  const filterOptions = [
    { key: 'all', label: 'All work' },
    ...(employeeId ? [{ key: 'mine', label: 'My cards' }] : []),
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'approval', label: 'In approval' },
    { key: 'overdue', label: 'Overdue' },
  ];

  const needle = query.trim().toLowerCase();
  const filtering = Boolean(needle) || filter !== 'all';

  const filteredColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        visibleCards: column.cards.filter((card) => {
          if (!matchesFilter(card, filter, employeeId)) return false;
          if (!needle) return true;
          return [card.title, card.clientName, card.assigneeName, card.platform, card.type]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle);
        }),
      })),
    [columns, filter, employeeId, needle],
  );

  const visibleTotal = filteredColumns.reduce((total, column) => total + column.visibleCards.length, 0);

  const handleDrop = (event, stage) => {
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData('text/plain'));
    setDragging(null);
    setDragOver(null);
    if (cardId) requestMove(cardId, stage);
  };

  const reset = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded p-0.5 hover:bg-danger/10"
            aria-label="Dismiss error"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <BoardSummary
        totals={board?.totals}
        columns={columns}
        stats={stats}
        week={week}
        filter={filter}
        onFilter={setFilter}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1 xl:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, client, assignee..."
            aria-label="Search the board"
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-8 text-sm text-ink placeholder:text-ink-subtle"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 rounded p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filterOptions.map((option) => {
            const active = filter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(active ? 'all' : option.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                )}
              >
                {option.label}
                <span
                  className={cn(
                    'rounded px-1 font-mono text-[10px]',
                    active ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-subtle',
                  )}
                >
                  {stats[option.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 xl:ml-auto">
          <span className="whitespace-nowrap text-xs text-ink-subtle">
            {filtering ? `${visibleTotal} of ${stats.all}` : `${stats.all}`} cards
          </span>

          {filtering ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Reset
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setCompact((value) => !value)}
            aria-pressed={compact}
            title={compact ? 'Comfortable cards' : 'Compact cards'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink-muted hover:border-brand-300 hover:text-ink"
          >
            {compact ? <LayoutGrid className="size-3.5" aria-hidden="true" /> : <List className="size-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">{compact ? 'Comfort' : 'Compact'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3 pb-4">
        {filteredColumns.map((column) => {
          const color = STAGE_COLOR[column.stage] || 'var(--brand-500)';
          const isOver = dragOver === column.stage && dragging;

          return (
            <section
              key={column.stage}
              id={`stage-${column.stage}`}
              onDragOver={(event) => canWrite && event.preventDefault()}
              onDragEnter={() => canWrite && setDragOver(column.stage)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(null);
              }}
              onDrop={(event) => handleDrop(event, column.stage)}
              style={{ borderTopColor: color }}
              className={cn(
                'flex min-w-0 scroll-mt-24 flex-col rounded-lg border border-t-[3px] bg-surface-muted transition-shadow',
                column.blocked ? 'border-amber-300' : 'border-line',
                isOver && 'ring-2 ring-brand-400 ring-offset-1',
              )}
              aria-label={CONTENT_STAGE_LABELS[column.stage]}
            >
              <header className="flex items-center justify-between gap-1.5 border-b border-line px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <h2 className="min-w-0 text-sm font-semibold leading-tight text-ink">
                    {CONTENT_STAGE_LABELS[column.stage]}
                  </h2>
                  {column.blocked ? (
                    <span className="shrink-0 rounded bg-warning-bg px-1 py-0.5 text-[9px] font-medium text-warning">
                      client
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      'rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] font-medium',
                      column.visibleCards.length !== column.cards.length
                        ? 'text-brand-600'
                        : 'text-ink-muted',
                    )}
                  >
                    {column.visibleCards.length !== column.cards.length
                      ? `${column.visibleCards.length}/${column.cards.length}`
                      : column.cards.length}
                  </span>
                  {canWrite ? (
                    <NewContentCardDialog clients={clients} defaultStage={column.stage} compact />
                  ) : null}
                </div>
              </header>

              <div className="flex min-h-24 flex-col gap-2 p-2 lg:max-h-[62vh] lg:overflow-y-auto">
                {column.visibleCards.map((card) => (
                  <ContentCard
                    key={card.id}
                    card={card}
                    canWrite={canWrite}
                    compact={compact}
                    isDragging={dragging === card.id}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(card.id));
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(card.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOver(null);
                    }}
                    onOpen={() => setDetail(card)}
                    onMoveTo={requestMove}
                  />
                ))}

                {!column.visibleCards.length ? (
                  <p
                    className={cn(
                      'rounded-md border border-dashed px-2 py-6 text-center text-xs',
                      isOver
                        ? 'border-brand-400 bg-brand-50 text-brand-600'
                        : 'border-line text-ink-subtle',
                    )}
                  >
                    {isOver ? 'Drop here' : filtering ? 'No matches' : 'Empty'}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {detail ? (
        <ContentDetailDialog
          card={detail}
          clients={clients}
          onClose={() => setDetail(null)}
          onSaved={() => {
            setDetail(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One card.
 *
 * The left edge carries the stage hue so a board with nine columns is still
 * readable at a glance. Dates use calendar-day comparisons rather than raw
 * timestamps: a piece scheduled for today is not late at 09:00.
 */
function ContentCard({ card, canWrite, compact, isDragging = false, onDragStart, onDragEnd, onOpen, onMoveTo }) {
  const shoot = dueInfo(card.shootDate, 'Shoot');
  const post = dueInfo(card.scheduledFor, 'Post');
  const idle = idleDays(card.updatedAt);
  const stale = idle >= 7 && card.stage !== 'posted';

  return (
    <article
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ borderLeftColor: STAGE_COLOR[card.stage] || 'var(--brand-500)' }}
      className={cn(
        'group relative rounded-md border border-l-[3px] bg-surface shadow-sm transition-shadow',
        compact ? 'p-2' : 'p-2.5',
        canWrite ? 'cursor-grab active:cursor-grabbing' : '',
        isDragging ? 'opacity-40 shadow-none' : 'hover:shadow-md',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start gap-1.5">
          <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-ink">
            {card.title}
          </p>
          {stale ? (
            <span
              title={`No movement for ${idle} days`}
              className="shrink-0 rounded bg-warning-bg px-1 py-0.5 font-mono text-[9px] font-semibold text-warning"
            >
              {idle}d
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-subtle">
          {card.clientName ? (
            <>
              <span
                className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
                style={{ backgroundColor: avatarColor(card.clientName) }}
                aria-hidden="true"
              >
                {initials(card.clientName)}
              </span>
              <span className="truncate">{card.clientName}</span>
              <span className="shrink-0 text-line-strong">/</span>
            </>
          ) : null}
          <span className="truncate">{METRIC_PLATFORM_LABELS[card.platform] || card.platform}</span>
        </div>

        {!compact ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {shoot ? <Chip tone={shoot.tone} icon={CalendarDays} label={shoot.label} /> : null}
            {post ? <Chip tone={post.tone} icon={Clock} label={post.label} /> : null}
            {card.revisionCount > 0 ? (
              <Chip
                tone={card.revisionCount >= 2 ? 'warn' : 'neutral'}
                label={`${card.revisionCount} rev`}
              />
            ) : null}
          </div>
        ) : null}
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[9px] uppercase tracking-wide text-ink-subtle">
          {DELIVERABLE_TYPE_LABELS[card.type] || card.type}
        </span>

        {card.assigneeName ? (
          <span
            title={`Assigned to ${card.assigneeName}`}
            className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: avatarColor(card.assigneeName) }}
          >
            {initials(card.assigneeName)}
          </span>
        ) : (
          <span
            title="Unassigned"
            className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-subtle"
          >
            <UserRound className="size-2.5" aria-hidden="true" />
          </span>
        )}
      </div>

      {/*
        The touch/keyboard path. HTML5 drag-and-drop does not fire on touch
        devices, so without this the board would simply be unusable on a phone -
        which is where a lot of agency checking actually happens.
      */}
      {canWrite ? (
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onMoveTo(card.id, event.target.value);
          }}
          aria-label={`Move ${card.title}`}
          className="mt-2 h-7 w-full rounded border border-line bg-surface px-1.5 text-xs text-ink-muted"
        >
          <option value="">Move to...</option>
          {Object.entries(CONTENT_STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      ) : null}
    </article>
  );
}

function BoardSummary({ totals, columns, stats, week, filter, onFilter }) {
  if (!totals) return null;

  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);

  const metrics = [
    {
      key: 'shoot',
      label: 'Shooting',
      value: totals.shootingThisWeek,
      icon: CalendarDays,
      hint: 'this week',
    },
    {
      key: 'posts',
      label: 'Posts',
      value: totals.postsThisWeek,
      icon: Layers,
      hint: 'this week',
    },
    {
      key: 'approval',
      label: 'In approval',
      value: totals.awaitingApproval,
      icon: Clock,
      filter: 'approval',
      alert: totals.awaitingApproval > 2,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: totals.overdue,
      icon: AlertTriangle,
      filter: 'overdue',
      alert: totals.overdue > 0,
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      value: stats.unassigned,
      icon: UserRound,
      filter: 'unassigned',
    },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Pipeline pulse
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">
              {totals.open ?? total}
            </span>
            <span className="text-sm text-ink-muted">pieces in flight</span>
          </p>
          {week ? <p className="mt-0.5 text-xs text-ink-subtle">Week of {week}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {metrics.map((metric) => (
            <PulseMetric
              key={metric.key}
              {...metric}
              active={Boolean(metric.filter) && filter === metric.filter}
              onClick={
                metric.filter
                  ? () => onFilter(filter === metric.filter ? 'all' : metric.filter)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
          {columns.map((column) =>
            column.count > 0 ? (
              <span
                key={column.stage}
                title={`${CONTENT_STAGE_LABELS[column.stage]}: ${column.count}`}
                className="h-full transition-[flex-grow] duration-300"
                style={{
                  flexGrow: column.count,
                  backgroundColor: STAGE_COLOR[column.stage] || 'var(--brand-500)',
                }}
              />
            ) : null,
          )}
        </div>

        <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
          {columns.map((column) => (
            <button
              key={column.stage}
              type="button"
              onClick={() =>
                document
                  .getElementById(`stage-${column.stage}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
              }
              className="group inline-flex shrink-0 items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_COLOR[column.stage] || 'var(--brand-500)' }}
                aria-hidden="true"
              />
              <span className="group-hover:underline">{CONTENT_STAGE_LABELS[column.stage]}</span>
              <span className="font-mono text-[10px] text-ink-subtle">{column.count}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PulseMetric({ label, value, hint, icon: Icon, active, alert, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-brand-400 bg-brand-50'
          : onClick
            ? 'border-line bg-surface hover:border-brand-300 hover:bg-surface-muted'
            : 'cursor-default border-line bg-surface',
      )}
    >
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-md',
          alert ? 'bg-danger-bg text-danger' : 'bg-surface-muted text-ink-subtle',
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block font-mono text-lg font-semibold leading-none',
            alert ? 'text-danger' : 'text-ink',
          )}
        >
          {value}
        </span>
        <span className="mt-1 block truncate text-[10px] uppercase tracking-wide text-ink-subtle">
          {label}
          {hint ? <span className="normal-case tracking-normal"> {hint}</span> : null}
        </span>
      </span>
    </button>
  );
}

function Chip({ tone = 'neutral', label, icon: Icon }) {
  const tones = {
    neutral: 'bg-surface-muted text-ink-muted',
    info: 'bg-info-bg text-info',
    warn: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
    success: 'bg-success-bg text-success',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        tones[tone],
      )}
    >
      {Icon ? <Icon className="size-2.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Date and identity helpers                                                  */
/* -------------------------------------------------------------------------- */

/** A local calendar day, independent of the server timezone. */
function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function dayKey(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDayKey(date);
}

function parseDay(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysFromToday(value) {
  const key = dayKey(value);
  if (!key) return null;
  return Math.round((parseDay(key) - parseDay(localDayKey())) / DAY_MS);
}

function dueInfo(value, verb) {
  const days = daysFromToday(value);
  if (days === null) return null;

  if (days < 0) {
    return { label: days === -1 ? `${verb} 1d late` : `${verb} ${Math.abs(days)}d late`, tone: 'danger' };
  }
  if (days === 0) return { label: `${verb} today`, tone: 'warn' };
  if (days === 1) return { label: `${verb} tomorrow`, tone: 'info' };
  if (days <= 7) return { label: `${verb} in ${days}d`, tone: 'info' };
  return { label: `${verb} ${shortDate(value)}`, tone: 'neutral' };
}

function isOverdue(card) {
  if (card.stage === 'posted') return false;

  const today = localDayKey();
  const shoot = dayKey(card.shootDate);
  const scheduled = dayKey(card.scheduledFor);
  return (shoot !== null && shoot < today) || (scheduled !== null && scheduled < today);
}

function idleDays(value) {
  const days = daysFromToday(value);
  return days === null ? 0 : Math.max(0, days * -1);
}

function shortDate(value) {
  const key = dayKey(value);
  if (!key) return value;
  return parseDay(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function matchesFilter(card, filter, currentEmployeeId) {
  switch (filter) {
    case 'mine':
      return currentEmployeeId !== null && card.assigneeId === currentEmployeeId;
    case 'unassigned':
      return !card.assigneeId;
    case 'approval':
      return card.stage === 'approval';
    case 'overdue':
      return isOverdue(card);
    default:
      return true;
  }
}

function initials(value = '') {
  return String(value)
    .split(/[\s@_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColor(value = '') {
  let hash = 0;
  for (const character of String(value)) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default ContentBoard;
