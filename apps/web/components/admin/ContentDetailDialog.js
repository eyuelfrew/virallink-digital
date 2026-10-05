'use client';

import { useState, useEffect } from 'react';
import { CONTENT_STAGE_LABELS, DELIVERABLE_TYPE_LABELS, METRIC_PLATFORM_LABELS } from '@virallink/shared/enums';

/**
 * One card, in full.
 *
 * Every pipeline step has its own field rather than one running notes box. That is
 * the difference between a record you can pick up mid-task and one where the
 * brainstorm has been overwritten by the script and the client's rejection reason
 * is three scroll positions away from the thing it refers to.
 *
 * The movement log at the bottom is read from the API rather than derived from
 * current state, because a card's history is exactly the thing current state
 * cannot tell you.
 */
export function ContentDetailDialog({ card, clients = [], onClose, onSaved }) {
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!card?.id) return;
    fetch(`/api/content/${card.id}/history`)
      .then((response) => response.json())
      .then((data) => setHistory(data.data || []))
      .catch(() => setHistory([]));
  }, [card?.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    const payload = {
      title: form.get('title'),
      type: form.get('type'),
      platform: form.get('platform'),
      url: form.get('url') || null,
      shootDate: form.get('shootDate') || null,
      scheduledFor: form.get('scheduledFor') || null,
      assigneeId: form.get('assigneeId') ? Number(form.get('assigneeId')) : null,
      idea: form.get('idea') || null,
      brainstormNotes: form.get('brainstormNotes') || null,
      scriptBody: form.get('scriptBody') || null,
      approvalNotes: form.get('approvalNotes') || null,
    };

    try {
      const response = await fetch(`/api/content/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || 'That could not be saved.');
        setPending(false);
        return;
      }

      onSaved?.();
    } catch {
      setError('The management service did not respond.');
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-detail-title"
        className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
      >
        <header className="border-b border-line px-6 py-4">
          <h2 id="content-detail-title" className="text-lg font-semibold">
            {card.title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {card.clientName ? `${card.clientName} · ` : ''}
            {CONTENT_STAGE_LABELS[card.stage]}
            {card.revisionCount > 0 ? ` · ${card.revisionCount} revision(s)` : ''}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
          <div className="flex flex-col gap-5 px-6 py-5">
            {error ? (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <Section title="Basics">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cd-title" className="text-sm font-medium text-ink-soft">Title</label>
                <input id="cd-title" name="title" required defaultValue={card.title}
                  className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cd-type" className="text-sm font-medium text-ink-soft">Type</label>
                  <select id="cd-type" name="type" defaultValue={card.type}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                    {Object.entries(DELIVERABLE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cd-platform" className="text-sm font-medium text-ink-soft">Platform</label>
                  <select id="cd-platform" name="platform" defaultValue={card.platform}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                    {Object.entries(METRIC_PLATFORM_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="cd-url" className="text-sm font-medium text-ink-soft">Live link</label>
                <input id="cd-url" name="url" type="url" defaultValue={card.url || ''}
                  placeholder="https://instagram.com/p/..."
                  className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
              </div>
            </Section>

            <Section title="Schedule">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cd-shoot" className="text-sm font-medium text-ink-soft">Shoot date</label>
                  <input id="cd-shoot" name="shootDate" type="date" defaultValue={(card.shootDate || '').slice(0, 10)}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                  <p className="text-xs text-ink-subtle">When the crew is booked.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cd-post" className="text-sm font-medium text-ink-soft">Scheduled to post</label>
                  <input id="cd-post" name="scheduledFor" type="date" defaultValue={(card.scheduledFor || '').slice(0, 10)}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                </div>
              </div>
            </Section>

            <Section title="Working material" hint="One field per step, so nothing gets overwritten.">
              <TextArea id="cd-idea" name="idea" label="1 · Idea" defaultValue={card.idea} rows={2} />
              <TextArea id="cd-brainstorm" name="brainstormNotes" label="2 · Brainstorm notes" defaultValue={card.brainstormNotes} rows={2} />
              <TextArea id="cd-script" name="scriptBody" label="3 · Script / copy" defaultValue={card.scriptBody} rows={5} />
            </Section>

            <Section title="Client approval" hint="What came back, and why.">
              <TextArea id="cd-approval" name="approvalNotes" label="4 · Approval notes"
                defaultValue={card.approvalNotes} rows={3}
                placeholder="What did the client say? What needs to change?" />
            </Section>

            <Section title="Movement log" hint="Every stage change, newest first.">
              {history.length ? (
                <ol className="flex flex-col gap-1.5">
                  {history.map((event) => (
                    <li key={event.id} className="text-xs">
                      <span className="text-ink-muted">
                        {new Date(event.createdAt).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span className="mx-1.5 text-ink-subtle">
                        {(event.fromStage ? CONTENT_STAGE_LABELS[event.fromStage] : 'Created')}
                        {' → '}
                        {CONTENT_STAGE_LABELS[event.toStage]}
                      </span>
                      {event.note ? <span className="text-ink">{event.note}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-ink-subtle">No history recorded yet.</p>
              )}
            </Section>
          </div>

          <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
            <button type="button" onClick={onClose}
              className="h-9 rounded-md border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted">
              Close
            </button>
            <button type="submit" disabled={pending}
              className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {pending ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TextArea({ id, name, label, defaultValue, rows, placeholder }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">{label}</label>
      <textarea id={id} name={name} rows={rows} defaultValue={defaultValue || ''} placeholder={placeholder}
        className="rounded-md border border-line bg-surface p-2.5 text-sm" />
    </div>
  );
}

export default ContentDetailDialog;