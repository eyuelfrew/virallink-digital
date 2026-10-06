'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  TASK_STATUS,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from '@virallink/shared/enums';
import { StatCard } from './AdminUI';
import { ListChecks, Play, Eye, AlertTriangle, Check } from 'lucide-react';

/**
 * "My tasks" — the employee-facing board.
 *
 * Same trust rules as the production board it mirrors:
 *
 *  - **Optimistic, then reconciled.** A status change lands on screen at once
 *    and rolls back if the save fails, so the interface never lags behind a
 *    click and never pretends a failed move succeeded.
 *  - **The server decides who "me" is.** Every write goes to
 *    `PUT /api/tasks/:id`; the read came from `/tasks/mine`, which resolves the
 *    assignee from the session. Nothing here sends an identity.
 *
 * Deliberately narrower than the admin task board: this view can move a task
 * through its workflow but cannot reassign it, retitle it or delete it. Those
 * are supervisory actions; an employee doing their own work needs the workflow
 * and nothing else.
 *
 * Counters are derived from local state rather than taken from the server
 * payload, so an optimistic move updates the column badge and the summary tiles
 * in the same render instead of disagreeing until the next round trip.
 */

/** Statuses that count as unfinished — mirrors OPEN_STATUSES in the API. */
const OPEN = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.REVIEW, TASK_STATUS.BLOCKED];

/** The forward action offered on each status. Reopen covers done and cancelled. */
const NEXT_ACTION = {
  [TASK_STATUS.TODO]: { label: 'Start', to: TASK_STATUS.IN_PROGRESS },
  [TASK_STATUS.IN_PROGRESS]: { label: 'Send to review', to: TASK_STATUS.REVIEW },
  [TASK_STATUS.REVIEW]: { label: 'Mark done', to: TASK_STATUS.DONE },
  [TASK_STATUS.BLOCKED]: { label: 'Resume', to: TASK_STATUS.IN_PROGRESS },
  [TASK_STATUS.DONE]: { label: 'Reopen', to: TASK_STATUS.TODO },
  [TASK_STATUS.CANCELLED]: { label: 'Reopen', to: TASK_STATUS.TODO },
};

const COLUMNS = [
  TASK_STATUS.TODO,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.BLOCKED,
];

const PRIORITY_TONE = {
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-amber-50 text-amber-800',
  medium: '',
  low: 'bg-surface-muted text-ink-muted',
};

function tally(tasks) {
  const byStatus = {};
  let open = 0;
  let overdue = 0;
  let done = 0;
  const now = new Date();

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    if (OPEN.includes(task.status)) {
      open += 1;
      if (task.dueDate && new Date(task.dueDate) < now) overdue += 1;
    }
    if (task.status === TASK_STATUS.DONE) done += 1;
  }

  return { byStatus, open, overdue, done };
}

export function MyTasksBoard({ initial, canWrite = false }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tasks, setTasks] = useState(initial?.tasks || []);
  const [error, setError] = useState(null);

  // Set while a save is in flight, so a background refresh cannot clobber an
  // optimistic move with the pre-move server copy.
  const pending = useRef(false);

  // Adopt fresh server data when it arrives, unless a move is mid-flight.
  const serverKey = JSON.stringify(initial?.tasks?.map((task) => [task.id, task.status]));
  const lastKey = useRef(serverKey);
  if (serverKey !== lastKey.current) {
    lastKey.current = serverKey;
    if (!pending.current) setTasks(initial?.tasks || []);
  }

  const counts = tally(tasks);
  const finished = tasks.filter(
    (task) => task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.CANCELLED,
  );

  const move = useCallback(
    async (task, toStatus) => {
      if (task.status === toStatus) return;

      const previous = tasks;
      pending.current = true;
      setTasks(
        tasks.map((entry) =>
          entry.id === task.id
            ? {
                ...entry,
                status: toStatus,
                // Mirror the server's derived completedAt before the round trip lands.
                completedAt: toStatus === TASK_STATUS.DONE ? new Date().toISOString() : null,
              }
            : entry,
        ),
      );
      setError(null);

      try {
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: toStatus }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setTasks(previous);
          setError(data.error?.message || 'That change could not be saved.');
          return;
        }

        // Re-sync so completedAt and any server-side side effects land exactly.
        startTransition(() => router.refresh());
      } catch {
        setTasks(previous);
        setError('The management service did not respond. The task was put back.');
      } finally {
        pending.current = false;
      }
    },
    [tasks, router],
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Open" value={counts.open} icon={ListChecks} href="/vira-admin/my-tasks" />
        <StatCard
          label="In progress"
          value={counts.byStatus[TASK_STATUS.IN_PROGRESS] || 0}
          icon={Play}
        />
        <StatCard label="In review" value={counts.byStatus[TASK_STATUS.REVIEW] || 0} icon={Eye} />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          icon={AlertTriangle}
          tone={counts.overdue > 0 ? 'danger' : 'default'}
        />
        <StatCard label="Completed" value={counts.done} icon={Check} tone="success" />
      </div>

      {/*
        Fit-to-screen columns (auto-fit + minmax): rows fill edge-to-edge and
        wrap rather than scrolling horizontally — same rule as the pipeline board.
      */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
        {COLUMNS.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status);

          return (
            <section
              key={status}
              className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-muted"
              aria-label={TASK_STATUS_LABELS[status]}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className="min-w-0 text-sm font-semibold text-ink">
                  {TASK_STATUS_LABELS[status]}
                </h2>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                  {columnTasks.length}
                </span>
              </header>

              <div className="flex flex-col gap-2 p-2">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} canWrite={canWrite} onMove={move} />
                ))}

                {!columnTasks.length ? (
                  <p className="px-1 py-6 text-center text-xs text-ink-subtle">Nothing here</p>
                ) : null}
              </div>
            </section>
          );
        })}

        {/* Finished lives on the board too — proof of work done, not a hidden archive. */}
        <section
          className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-muted"
          aria-label="Finished"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h2 className="min-w-0 text-sm font-semibold text-ink">Finished</h2>
            <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-muted">
              {finished.length}
            </span>
          </header>

          <div className="flex flex-col gap-2 p-2">
            {finished.slice(0, 12).map((task) => (
              <TaskCard key={task.id} task={task} canWrite={canWrite} onMove={move} />
            ))}

            {!finished.length ? (
              <p className="px-1 py-6 text-center text-xs text-ink-subtle">
                Completed tasks appear here
              </p>
            ) : finished.length > 12 ? (
              <p className="px-1 py-3 text-center text-xs text-ink-subtle">
                …and {finished.length - 12} more
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
/**
 * One task card: what it is, when it is due, and the one workflow action that
 * makes sense from its current status. The "Move to…" select covers every
 * status for touch devices, where the buttons are the primary path.
 */
function TaskCard({ task, canWrite, onMove }) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue =
    due && due < new Date() && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED;
  const action = NEXT_ACTION[task.status];
  const meta = [task.clientName, task.projectTitle].filter(Boolean).join(' · ');

  return (
    <article className="rounded-md border bg-surface p-2.5 shadow-sm">
      <p className="break-words text-sm font-medium text-ink">{task.title}</p>

      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{task.description}</p>
      ) : null}

      {meta ? <p className="mt-1 text-xs text-ink-subtle">{meta}</p> : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {task.priority && task.priority !== 'medium' ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium',
              PRIORITY_TONE[task.priority] || 'bg-surface-muted text-ink-muted',
            )}
          >
            {TASK_PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        ) : null}

        {due ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium',
              isOverdue ? 'bg-red-50 text-red-700' : 'bg-surface-muted text-ink-muted',
            )}
          >
            {isOverdue ? 'Overdue · ' : 'Due '}
            {due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
          </span>
        ) : null}

        {task.status === TASK_STATUS.DONE && task.completedAt ? (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
            Done{' '}
            {new Date(task.completedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })}
          </span>
        ) : null}

        {task.status === TASK_STATUS.CANCELLED ? (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle">
            Cancelled
          </span>
        ) : null}
      </div>

      {canWrite && action ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onMove(task, action.to)}
            className="h-7 w-full rounded border border-brand-500 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            {action.label}
          </button>

          {/* Touch/keyboard path: every status, not just the likely next one. */}
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) onMove(task, event.target.value);
            }}
            aria-label={`Move "${task.title}" to another status`}
            className="h-7 w-full rounded border border-line bg-surface px-1.5 text-xs text-ink-muted"
          >
            <option value="">Move to…</option>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </article>
  );
}

export default MyTasksBoard;
