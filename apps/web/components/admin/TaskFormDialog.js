'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@virallink/shared/enums';

/**
 * Create / edit a task.
 *
 * Follows the same shape as the other admin form dialogs: an uncontrolled form
 * read into a payload on submit, POST to create, PUT to edit, then refresh the
 * server component.
 *
 * `assigneeId` and `dueDate` are sent as null rather than omitted when cleared.
 * The update schema treats an absent key as "leave alone", so a partial-update
 * endpoint needs an explicit null to clear a field — otherwise unassigning
 * someone would silently do nothing.
 */
export function TaskFormDialog({ task = null, triggerLabel = 'Add task', employees = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(task?.id);

  useEffect(() => {
    if (open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const payload = {
      title: form.get('title'),
      description: form.get('description') || null,
      status: form.get('status'),
      priority: form.get('priority'),
      assigneeId: form.get('assigneeId') ? Number(form.get('assigneeId')) : null,
      dueDate: form.get('dueDate') || null,
    };

    try {
      const response = await fetch(isEdit ? `/api/tasks/${task.id}` : '/api/tasks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That task could not be saved.');
        setPending(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError('The management service did not respond. Please try again.');
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition-colors',
          isEdit
            ? 'border border-line text-ink-soft hover:bg-surface-muted'
            : 'bg-brand-500 text-white hover:bg-brand-600',
        )}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-dialog-title"
            className="relative my-auto w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="task-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${task.title}` : 'Add task'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="task-title" className="text-sm font-medium text-ink-soft">
                    Title
                  </label>
                  <input
                    id="task-title"
                    name="title"
                    required
                    defaultValue={task?.title || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.title ? <p className="text-xs text-danger">{fieldErrors.title[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="task-description" className="text-sm font-medium text-ink-soft">
                    Detail
                  </label>
                  <textarea
                    id="task-description"
                    name="description"
                    rows={4}
                    defaultValue={task?.description || ''}
                    className="rounded-md border border-line bg-surface p-3 text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="task-status" className="text-sm font-medium text-ink-soft">
                      Status
                    </label>
                    <select
                      id="task-status"
                      name="status"
                      defaultValue={task?.status || 'todo'}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    >
                      {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="task-priority" className="text-sm font-medium text-ink-soft">
                      Priority
                    </label>
                    <select
                      id="task-priority"
                      name="priority"
                      defaultValue={task?.priority || 'medium'}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    >
                      {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="task-assignee" className="text-sm font-medium text-ink-soft">
                      Assigned to
                    </label>
                    <select
                      id="task-assignee"
                      name="assigneeId"
                      defaultValue={task?.assigneeId || ''}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="task-due" className="text-sm font-medium text-ink-soft">
                      Due date
                    </label>
                    <input
                      id="task-due"
                      name="dueDate"
                      type="date"
                      defaultValue={task?.dueDate || ''}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                  </div>
                </div>
              </div>

              <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 rounded-md border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default TaskFormDialog;