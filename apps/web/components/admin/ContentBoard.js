'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CONTENT_STAGE_LABELS, METRIC_PLATFORM_LABELS } from '@virallink/shared/enums';
import { ContentDetailDialog } from './ContentDetailDialog';

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
 * Native HTML5 drag-and-drop rather than a library. It works with mouse and
 * keyboard-free by fallback (the stage select on each card), needs no dependency,
 * and degrades to the select on touch devices where HTML5 DnD does not fire.
 */

export function ContentBoard({ board, clients = [], canWrite = true, week }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local copy so a move is visible before the round trip completes.
  const [columns, setColumns] = useState(board?.columns || []);
  const [dragging, setDragging] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

  // Re-sync when the server sends new data, without clobbering an in-flight move.
  const serverKey = JSON.stringify(board?.columns?.map((column) => [column.stage, column.count]));
  const lastKey = useRef(serverKey);
  if (serverKey !== lastKey.current) {
    lastKey.current = serverKey;
    if (columns === (board?.columns || [])) setColumns(board.columns || []);
  }

  const move = useCallback(
    async (cardId, toStage, extra = {}) => {
      const previous = columns;
      const from = columns.find((column) => column.cards.some((card) => card.id === cardId));
      const card = from?.cards.find((entry) => entry.id === cardId);
      if (!card || card.stage === toStage) return;

      // Move it locally, in both columns.
      setColumns(
        columns.map((column) => {
          if (column.stage === from.stage) {
            return { ...column, count: column.count - 1, cards: column.cards.filter((entry) => entry.id !== cardId) };
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
          setColumns(previous); // put it back where it was
          setError(data.error?.message || 'That move could not be saved.');
          return;
        }

        setError(null);
        // Re-read so revision counts and any server-side side effects land.
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

  const handleDrop = (event, stage) => {
    event.preventDefault();
    const cardId = Number(event.dataTransfer.getData('text/plain'));
    setDragging(null);
    if (cardId) requestMove(cardId, stage);
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <BoardSummary totals={board?.totals} week={week} />

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {columns.map((column) => (
          <section
            key={column.stage}
            onDragOver={(event) => canWrite && event.preventDefault()}
            onDrop={(event) => handleDrop(event, column.stage)}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-lg border bg-surface-muted',
              column.blocked ? 'border-amber-300' : 'border-line',
              dragging ? 'border-dashed' : '',
            )}
            aria-label={CONTENT_STAGE_LABELS[column.stage]}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <h2 className="text-sm font-semibold text-ink">
                {CONTENT_STAGE_LABELS[column.stage]}
                {column.blocked ? (
                  <span className="ml-1.5 text-[10px] font-normal text-amber-700">waiting on client</span>
                ) : null}
              </h2>
              <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                {column.count}
              </span>
            </header>

            <div className="flex flex-col gap-2 p-2">
              {column.cards.map((card) => (
                <ContentCard
                  key={card.id}
                  card={card}
                  canWrite={canWrite}
                  isDragging={dragging === card.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', String(card.id));
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(card.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onOpen={() => setDetail(card)}
                  onMoveTo={requestMove}
                />
              ))}

              {!column.cards.length ? (
                <p className="px-1 py-6 text-center text-xs text-ink-subtle">Empty</p>
              ) : null}
            </div>
          </section>
        ))}
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
 * Shows the two dates that decide whether a week is covered, and surfaces a card
 * that has already bounced from the client, because a third revision is the point
 * at which someone should probably have a conversation.
 */
function ContentCard({ card, canWrite, isDragging = false, onDragStart, onDragEnd, onOpen, onMoveTo }) {
  const today = new Date();
  const shootOverdue = card.shootDate && new Date(card.shootDate) < today && card.stage !== 'posted';
  const postOverdue = card.scheduledFor && new Date(card.scheduledFor) < today && card.stage !== 'posted';

  return (
    <article
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-md border bg-surface p-2.5 shadow-sm',
        canWrite ? 'cursor-grab active:cursor-grabbing' : '',
        isDragging ? 'opacity-50' : '',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className="text-sm font-medium text-ink">{card.title}</p>

        <p className="mt-1 text-xs text-ink-subtle">
          {card.clientName ? `${card.clientName} · ` : ''}
          {METRIC_PLATFORM_LABELS[card.platform] || card.platform}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {card.shootDate ? (
            <Chip tone={shootOverdue ? 'danger' : 'neutral'} label={`Shoot ${shortDate(card.shootDate)}`} overdue={shootOverdue} />
          ) : null}
          {card.scheduledFor ? (
            <Chip
              tone={postOverdue ? 'danger' : 'info'}
              label={`Post ${shortDate(card.scheduledFor)}`}
              overdue={postOverdue}
            />
          ) : null}
          {card.revisionCount > 0 ? (
            <Chip
              tone={card.revisionCount >= 2 ? 'warn' : 'neutral'}
              label={`${card.revisionCount} revision${card.revisionCount === 1 ? '' : 's'}`}
            />
          ) : null}
        </div>
      </button>

      {/*
        The touch/keyboard path. HTML5 drag-and-drop does not fire on touch
        devices, so without this the board would simply be unusable on a phone —
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
          <option value="">Move to…</option>
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

function Chip({ tone = 'neutral', label }) {
  const tones = {
    neutral: 'bg-surface-muted text-ink-muted',
    info: 'bg-sky-50 text-sky-800',
    warn: 'bg-amber-50 text-amber-800',
    danger: 'bg-red-50 text-red-700',
  };

  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>{label}</span>;
}

function BoardSummary({ totals, week }) {
  if (!totals) return null;

  const cells = [
    { label: 'In flight', value: totals.open, tone: 'text-ink' },
    { label: `Shooting ${week?.label || 'this week'}`, value: totals.shootingThisWeek, tone: 'text-ink' },
    { label: 'Posts this week', value: totals.postsThisWeek, tone: 'text-ink' },
    { label: 'Awaiting approval', value: totals.awaitingApproval, tone: totals.awaitingApproval > 2 ? 'text-amber-700' : 'text-ink' },
    { label: 'Overdue', value: totals.overdue, tone: totals.overdue > 0 ? 'text-danger' : 'text-ink' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-line bg-surface px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-subtle">{cell.label}</p>
          <p className={cn('text-xl font-semibold', cell.tone)}>{cell.value}</p>
        </div>
      ))}
    </div>
  );
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default ContentBoard;