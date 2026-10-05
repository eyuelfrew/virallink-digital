'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const COMMUNICATION_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

/**
 * Add a note or log a communication against a client.
 *
 * Both already had write endpoints and no way to see the results, so this closes
 * the loop: whatever staff record here appears immediately on the client page.
 *
 * One component for both because they are the same three fields in a different
 * arrangement, and two near-identical dialogs would drift apart the way the list
 * pages did.
 */
export function ClientActivityForms({ clientId, kind = 'note', triggerLabel = 'Add' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isCommunication = kind === 'communication';
  const endpoint = isCommunication ? `/clients/${clientId}/communications` : `/clients/${clientId}/notes`;

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const payload = isCommunication
      ? {
          type: form.get('type'),
          subject: form.get('subject') || null,
          body: form.get('body') || null,
          occurredAt: form.get('occurredAt') || undefined,
        }
      : { body: form.get('body') };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That could not be saved.');
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
        className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`client-${kind}-title`}
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id={`client-${kind}-title`} className="text-lg font-semibold">
                {isCommunication ? 'Log contact' : 'Add note'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                {isCommunication ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="comm-type" className="text-sm font-medium text-ink-soft">
                        Type
                      </label>
                      <select
                        id="comm-type"
                        name="type"
                        defaultValue="call"
                        className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                      >
                        {COMMUNICATION_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="comm-date" className="text-sm font-medium text-ink-soft">
                        Date
                      </label>
                      <input
                        id="comm-date"
                        name="occurredAt"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                      />
                    </div>
                  </div>
                ) : null}

                {isCommunication ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="comm-subject" className="text-sm font-medium text-ink-soft">
                      Subject
                    </label>
                    <input
                      id="comm-subject"
                      name="subject"
                      defaultValue=""
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                    />
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${kind}-body`} className="text-sm font-medium text-ink-soft">
                    {isCommunication ? 'Notes' : 'Note'}
                  </label>
                  <textarea
                    id={`${kind}-body`}
                    name="body"
                    rows={4}
                    required={!isCommunication}
                    className="rounded-md border border-line bg-surface p-3 text-sm"
                  />
                  {fieldErrors.body ? <p className="text-xs text-danger">{fieldErrors.body[0]}</p> : null}
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
                  className={cn(
                    'h-9 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-60',
                    'bg-brand-500 hover:bg-brand-600',
                  )}
                >
                  {pending ? 'Saving…' : isCommunication ? 'Log contact' : 'Add note'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ClientActivityForms;