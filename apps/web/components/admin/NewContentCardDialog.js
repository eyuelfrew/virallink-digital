'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTENT_STAGE_LABELS, DELIVERABLE_TYPE_LABELS, METRIC_PLATFORM_LABELS } from '@virallink/shared/enums';

/**
 * Add a card to the board.
 *
 * Creates the item already sitting in its opening stage rather than defaulting to
 * 'posted' — starting a new piece of work and having it appear in the archive
 * column is the sort of thing that makes people stop using a board.
 *
 * Only the fields needed to place the card are asked for here. The idea, the
 * brainstorm, the script and the client feedback all live on the detail dialog,
 * opened by clicking the card, because they are written at different moments by
 * possibly different people.
 */
export function NewContentCardDialog({ clients = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    const payload = {
      clientId: Number(form.get('clientId')),
      title: form.get('title'),
      type: form.get('type'),
      platform: form.get('platform'),
      stage: form.get('stage'),
      shootDate: form.get('shootDate') || null,
      scheduledFor: form.get('scheduledFor') || null,
    };

    try {
      const response = await fetch('/api/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || 'That card could not be created.');
        setPending(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError('The management service did not respond.');
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600"
      >
        New card
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-card-title"
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="new-card-title" className="text-lg font-semibold">
                New content card
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
                  <label htmlFor="nc-client" className="text-sm font-medium text-ink-soft">
                    Client
                  </label>
                  <select
                    id="nc-client"
                    name="clientId"
                    required
                    defaultValue={clients[0]?.id || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  >
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nc-title" className="text-sm font-medium text-ink-soft">
                    Title
                  </label>
                  <input
                    id="nc-title"
                    name="title"
                    required
                    placeholder="November product teaser"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="nc-type" className="text-sm font-medium text-ink-soft">
                      Type
                    </label>
                    <select id="nc-type" name="type" defaultValue="video"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                      {Object.entries(DELIVERABLE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="nc-platform" className="text-sm font-medium text-ink-soft">
                      Platform
                    </label>
                    <select id="nc-platform" name="platform" defaultValue="instagram"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                      {Object.entries(METRIC_PLATFORM_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nc-stage" className="text-sm font-medium text-ink-soft">
                    Starting stage
                  </label>
                  <select id="nc-stage" name="stage" defaultValue="idea"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                    {Object.entries(CONTENT_STAGE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="nc-shoot" className="text-sm font-medium text-ink-soft">
                      Shoot date
                    </label>
                    <input id="nc-shoot" name="shootDate" type="date"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="nc-post" className="text-sm font-medium text-ink-soft">
                      Scheduled to post
                    </label>
                    <input id="nc-post" name="scheduledFor" type="date"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                  </div>
                </div>
              </div>

              <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)}
                  className="h-9 rounded-md border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                  className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Creating…' : 'Create card'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default NewContentCardDialog;