'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_STATUS, TASK_STATUS_LABELS } from '@virallink/shared/enums';
import { AssigneeChip, DueCell, TASK_PRIORITY_BAR, TaskPriorityBadge } from './Badge';
import { TaskFormDialog } from './TaskFormDialog';
import { DeleteButton } from './DeleteButton';

/**
 * Admin task board.
 *
 * The same task set the table shows, arranged by status so the shape of the
 * workload is visible at a glance instead of inferred from a status column.
 *
 *  - **Drag, with a keyboard path.** Cards drag between columns on a pointer;
 *    every card also carries a "Move to…" select, so the board is fully usable
 *    without a mouse — drag-and-drop alone would exclude keyboard and touch.
 *  - **Optimistic, then reconciled.** A move lands on screen at once and rolls
 *    back if the save fails, mirroring MyTasksBoard so the two boards behave
 *    identically. `completedAt` is mirrored locally, then re-synced from the
 *    server on refresh, which derives it from the status transition.
 *  - **Editing is a dialog, deleting confirms.** Supervisory actions stay behind
 *    the same controls the table uses rather than becoming one-click on a card.
 */

const COLUMNS = [
  { status: TASK_STATUS.TODO, accent: 'bg-ink-subtle' },
  { status: TASK_STATUS.IN_PROGRESS, accent: 'bg-brand-500' },
  { status: TASK_STATUS.REVIEW, accent: 'bg-info' },
  { status: TASK_STATUS.BLOCKED, accent: 'bg-danger' },
  { status: TASK_STATUS.DONE, accent: 'bg-success' },
  { status: TASK_STATUS.CANCELLED, accent: 'bg-line-strong' },
];

export function TasksBoard({ initial = [], employees = [], canWrite = false, canDelete = false }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overStatus, setOverStatus] = useState(null);

  // Set while a save is in flight, so a background refresh cannot clobber an
  // optimistic move with the pre-move server copy.
  const pending = useRef(false);

  // Adopt fresh server data when it arrives, unless a move is mid-flight.
  const serverKey = JSON.stringify(initial.map((task) => [task.id, task.status]));
  const lastKey = useRef(serverKey);
  if (serverKey !== lastKey.current) {
    lastKey.current = serverKey;
    if (!pending.current) setTasks(initial);
  }

  const move = useCallback(
    async (task, toStatus) => {
      if (!task || task.status === toStatus) return;

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

  function handleDragStart(event, task) {
    if (!canWrite) return;
    event.dataTransfer.setData('text/plain', String(task.id));
    event.dataTransfer.effectAllowed = 'move';
    setDragId(task.id);
  }

  function handleDragEnd() {
    setDragId(null);
    setOverStatus(null);
  }

  function handleDrop(event, status) {
    event.preventDefault();
    setOverStatus(null);
    setDragId(null);

    const id = Number(event.dataTransfer.getData('text/plain'));
    const task = tasks.find((entry) => entry.id === id);
    move(task, status);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!canWrite ? (
        <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          You have read-only access to tasks. Moving a card needs the task-write permission.
        </p>
      ) : null}

      {/*
        Fit-to-screen columns (auto-fit + minmax): rows fill edge-to-edge and wrap
        rather than scrolling horizontally — same rule as the other boards.
      */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
        {COLUMNS.map(({ status, accent }) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          const isOver = overStatus === status;

          return (
            <section
              key={status}
              onDragOver={
                canWrite
                  ? (event) => {
                      event.preventDefault();
                      setOverStatus(status);
                    }
                  : undefined
              }
              onDragLeave={canWrite ? () => setOverStatus((current) => (current === status ? null : current)) : undefined}
              onDrop={canWrite ? (event) => handleDrop(event, status) : undefined}
              className={cn(
                'flex min-w-0 flex-col rounded-lg border bg-surface-muted transition-colors',
                isOver ? 'border-brand-400 ring-2 ring-brand-200' : 'border-line',
              )}
              aria-label={TASK_STATUS_LABELS[status]}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                  <span className={cn('size-2 shrink-0 rounded-full', accent)} aria-hidden="true" />
                  <span className="truncate">{TASK_STATUS_LABELS[status]}</span>
                </h2>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                  {columnTasks.length}
                </span>
              </header>

              <div className="flex flex-col gap-2 p-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employees={employees}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    dragging={dragId === task.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onMove={move}
                  />
                ))}

                {!columnTasks.length ? (
                  <p className="px-1 py-6 text-center text-xs text-ink-subtle">
                    {isOver ? 'Drop here' : 'Nothing here'}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** One task card: priority, due date, assignee, and its workflow controls. */
function TaskCard({ task, employees, canWrite, canDelete, dragging, onDragStart, onDragEnd, onMove }) {
  const meta = [task.clientName, task.projectTitle].filter(Boolean).join(' · ');

  return (
    <article
      draggable={canWrite}
      onDragStart={canWrite ? (event) => onDragStart(event, task) : undefined}
      onDragEnd={canWrite ? onDragEnd : undefined}
      className={cn(
        'group rounded-md border border-line bg-surface p-2.5 shadow-sm',
        canWrite && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn('mt-0.5 h-6 w-1 shrink-0 rounded-sm', TASK_PRIORITY_BAR[task.priority] || 'bg-line')}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-ink">{task.title}</p>

          {task.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{task.description}</p>
          ) : null}

          {meta ? <p className="mt-1 text-xs text-ink-subtle">{meta}</p> : null}
        </div>

        {canWrite ? (
          <GripVertical
            className="mt-0.5 size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TaskPriorityBadge priority={task.priority} />
        {task.dueDate ? <DueCell value={task.dueDate} status={task.status} /> : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <AssigneeChip name={task.assignee?.name} className="min-w-0 text-xs text-ink-muted" />

        {canWrite ? (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) onMove(task, event.target.value);
            }}
            aria-label={`Move "${task.title}" to another status`}
            className="h-7 shrink-0 rounded border border-line bg-surface px-1.5 text-xs text-ink-muted"
          >
            <option value="">Move to…</option>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value} disabled={value === task.status}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <TaskFormDialog task={task} employees={employees} triggerLabel="Edit" />
        {canDelete ? <DeleteButton resource="tasks" id={task.id} label={task.title} itemName="task" /> : null}
      </div>
    </article>
  );
}

export default TasksBoard;
