'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Clears activity log entries inside a chosen date range.
 *
 * Both bounds are optional, but the user must set at least one — the API refuses
 * a range-less request, and the UI mirrors that rather than letting the call
 * fail. The destructive nature is stated plainly and the range is echoed back in
 * the confirmation, because "are you sure?" tells a person nothing about what
 * they are about to lose.
 */
export function ClearActivityDialog() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [cleared, setCleared] = useState(null);

  function reset() {
    setFrom('');
    setTo('');
    setError(null);
    setCleared(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  async function handleClear() {
    if (!from && !to) {
      setError('Choose a start or end date.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const search = new URLSearchParams();
      if (from) search.set('from', from);
      if (to) search.set('to', to);

      const response = await fetch(`/api/activity?${search.toString()}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error?.message || 'Those entries could not be cleared.');
      }

      setCleared(payload.data?.deleted ?? 0);
      router.refresh();
    } catch (clearError) {
      setError(clearError.message || 'That did not work. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const rangeLabel =
    from && to ? `${from} to ${to}` : from ? `everything before ${from}` : `everything up to ${to}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Clear logs
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/50" onClick={close} aria-hidden="true" />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-activity-title"
            aria-describedby="clear-activity-description"
            className="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-xl"
          >
            <h2 id="clear-activity-title" className="text-h4">
              Clear activity logs
            </h2>

            <p id="clear-activity-description" className="mt-2.5 text-sm leading-relaxed text-ink-muted">
              This permanently removes audit entries in the range you choose. It cannot be undone.
              Set a start date, an end date, or both.
            </p>

            {cleared === null ? (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink">From</span>
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink">To</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
                    />
                  </label>
                </div>

                {from && to && from > to ? (
                  <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-sm text-danger">
                    The start date must be on or before the end date.
                  </p>
                ) : null}

                {error ? (
                  <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={pending || (!from && !to) || (from && to && from > to)}
                    className={cn(
                      'inline-flex h-10 items-center rounded-md bg-danger px-4 text-sm font-semibold text-white',
                      'hover:brightness-95 disabled:pointer-events-none disabled:opacity-60',
                    )}
                  >
                    {pending ? 'Clearing…' : 'Clear these logs'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p role="status" className="mt-4 rounded-md bg-success-bg p-3 text-sm text-success">
                  Removed {cleared} {cleared === 1 ? 'entry' : 'entries'} ({rangeLabel}).
                </p>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ClearActivityDialog;
