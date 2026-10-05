'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { METRIC_PLATFORM_LABELS } from '@virallink/shared/enums';

/** Current month as YYYY-MM, matching the API's key format. */
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Enter one month of figures for one deliverable.
 *
 * Every counter is optional, and blank means "not measured" rather than zero. The
 * report renders those differently: a blank is honest, a zero is a claim. Leaving
 * something blank is therefore never wrong.
 *
 * Saving is an upsert, so re-entering a corrected figure for a month that already
 * has one updates it in place instead of creating a second row that the report
 * would then add together.
 */
export function MetricFormDialog({ deliverable, existing = null, triggerLabel = 'Add figures' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = Boolean(existing?.id);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    // Blank inputs submit ''. Coerce those to null ("not measured") rather than 0,
    // and leave the number alone when something was typed.
    const numberOrNull = (name) => {
      const raw = String(form.get(name) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };

    const payload = {
      deliverableId: deliverable.id,
      month: form.get('month'),
      platform: form.get('platform'),
      views: numberOrNull('views'),
      likes: numberOrNull('likes'),
      comments: numberOrNull('comments'),
      shares: numberOrNull('shares'),
      watchHours: numberOrNull('watchHours'),
      source: 'manual',
    };

    try {
      const response = await fetch('/api/deliverables/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || 'Those figures could not be saved.');
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
          'inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
          isEdit
            ? 'border border-line text-ink-muted hover:bg-surface-muted'
            : 'border border-line text-ink-muted hover:bg-surface-muted',
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
            aria-labelledby="metric-dialog-title"
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="metric-dialog-title" className="text-lg font-semibold">
                {isEdit ? 'Update figures' : 'Add figures'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{deliverable?.title}</p>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="metric-month" className="text-sm font-medium text-ink-soft">
                      Month
                    </label>
                    <input
                      id="metric-month"
                      name="month"
                      required
                      pattern="\d{4}-(0[1-9]|1[0-2])"
                      defaultValue={existing?.month || currentMonth()}
                      placeholder="2026-10"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                    <p className="text-xs text-ink-subtle">Format YYYY-MM</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="metric-platform" className="text-sm font-medium text-ink-soft">
                      Platform
                    </label>
                    <select
                      id="metric-platform"
                      name="platform"
                      defaultValue={existing?.platform || deliverable?.platform || 'other'}
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

                <fieldset className="flex flex-col gap-3">
                  <legend className="text-sm font-medium text-ink-soft">Figures for that month</legend>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['views', 'Views'],
                      ['likes', 'Likes'],
                      ['comments', 'Comments'],
                      ['shares', 'Shares'],
                    ].map(([name, label]) => (
                      <div key={name} className="flex flex-col gap-1.5">
                        <label htmlFor={`metric-${name}`} className="text-xs text-ink-muted">
                          {label}
                        </label>
                        <input
                          id={`metric-${name}`}
                          name={name}
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={existing?.[name] ?? ''}
                          className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="metric-watchHours" className="text-xs text-ink-muted">
                      Watch hours
                    </label>
                    <input
                      id="metric-watchHours"
                      name="watchHours"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={existing?.watchHours ?? ''}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                  </div>

                  <p className="text-xs text-ink-subtle">
                    Leave anything blank if you did not measure it. A blank is reported as &ldquo;not
                    measured&rdquo; rather than zero.
                  </p>
                </fieldset>
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
                  {pending ? 'Saving…' : 'Save figures'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default MetricFormDialog;