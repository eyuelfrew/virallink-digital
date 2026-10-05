'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { DELIVERABLE_TYPE_LABELS, METRIC_PLATFORM_LABELS } from '@virallink/shared/enums';

/**
 * Create or edit a deliverable — one piece of work produced for a client.
 *
 * Separate from the metric dialog on purpose. "We made a video" and "the video got
 * 4,200 views" are different facts with different dates, and a client asks about
 * them separately. Merging them into one form is how a report ends up claiming
 * five videos in a month when three were made.
 *
 * `publishedAt` defaults to today because most work is logged as it goes out, and
 * the month a deliverable counts towards is derived from this date.
 */
export function DeliverableFormDialog({ clientId, deliverable = null, triggerLabel = 'Add deliverable' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(deliverable?.id);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const payload = {
      clientId,
      title: form.get('title'),
      type: form.get('type'),
      platform: form.get('platform'),
      url: form.get('url') || null,
      // An empty date input submits '', which zod would reject as an invalid date.
      publishedAt: form.get('publishedAt') || null,
      notes: form.get('notes') || null,
    };

    try {
      const response = await fetch(isEdit ? `/api/deliverables/${deliverable.id}` : '/api/deliverables', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That deliverable could not be saved.');
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
            aria-labelledby="deliverable-dialog-title"
            className="relative my-auto w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="deliverable-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${deliverable.title}` : 'Add deliverable'}
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
                  <label htmlFor="deliverable-title" className="text-sm font-medium text-ink-soft">
                    Title
                  </label>
                  <input
                    id="deliverable-title"
                    name="title"
                    required
                    defaultValue={deliverable?.title || ''}
                    placeholder="October brand reel"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.title ? <p className="text-xs text-danger">{fieldErrors.title[0]}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="deliverable-type" className="text-sm font-medium text-ink-soft">
                      Type
                    </label>
                    <select
                      id="deliverable-type"
                      name="type"
                      defaultValue={deliverable?.type || 'video'}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    >
                      {Object.entries(DELIVERABLE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="deliverable-platform" className="text-sm font-medium text-ink-soft">
                      Platform
                    </label>
                    <select
                      id="deliverable-platform"
                      name="platform"
                      defaultValue={deliverable?.platform || 'instagram'}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    >
                      {Object.entries(METRIC_PLATFORM_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="deliverable-url" className="text-sm font-medium text-ink-soft">
                      Link
                    </label>
                    <input
                      id="deliverable-url"
                      name="url"
                      type="url"
                      defaultValue={deliverable?.url || ''}
                      placeholder="https://instagram.com/p/..."
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                    {fieldErrors.url ? <p className="text-xs text-danger">{fieldErrors.url[0]}</p> : null}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="deliverable-date" className="text-sm font-medium text-ink-soft">
                      Published
                    </label>
                    <input
                      id="deliverable-date"
                      name="publishedAt"
                      type="date"
                      defaultValue={(deliverable?.publishedAt || '').slice(0, 10)}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                    <p className="text-xs text-ink-subtle">The month it counts towards.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="deliverable-notes" className="text-sm font-medium text-ink-soft">
                    Notes
                  </label>
                  <textarea
                    id="deliverable-notes"
                    name="notes"
                    rows={2}
                    defaultValue={deliverable?.notes || ''}
                    className="rounded-md border border-line bg-surface p-3 text-sm"
                  />
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
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add deliverable'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default DeliverableFormDialog;