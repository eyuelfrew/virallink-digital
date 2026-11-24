'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';
import { INQUIRY_STATUS, STATUS_LABELS } from '@/shared/enums';
import { AlertCircle, Check, Archive } from 'lucide-react';

/**
 * Inline controls for a single inquiry: mark read, change status, add a note,
 * archive. Each action posts straight to the API with the admin's session
 * cookie included.
 */
export default function InquiryControls({ inquiry }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [status, setStatus] = useState(inquiry.status);
  const [notes, setNotes] = useState(inquiry.notes || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function update(body, successMessage) {
    setError('');
    setNotice('');
    try {
      const response = await fetch(browserApiUrl(`/api/inquiries/${inquiry.id}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message || 'Could not save the change.');
        return;
      }
      if (successMessage) setNotice(successMessage);
      startTransition(() => router.refresh());
    } catch {
      setError('We could not reach the management service. Please try again.');
    }
  }

  async function archive() {
    if (!window.confirm('Archive this inquiry? It will be hidden from the default list.')) return;
    setError('');
    setNotice('');
    try {
      const response = await fetch(browserApiUrl(`/api/inquiries/${inquiry.id}/archive`), { method: 'POST', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message || 'Could not archive the inquiry.');
        return;
      }
      setNotice('Inquiry archived.');
      startTransition(() => router.push('/vira-admin/inquiries'));
    } catch {
      setError('We could not reach the management service. Please try again.');
    }
  }

  const busy = pending;

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <div role="alert" className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="flex gap-2.5 rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!inquiry.isRead ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => update({ isRead: true }, 'Marked as read.')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            <Check className="size-4" aria-hidden="true" />
            Mark as read
          </button>
        ) : (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-success-bg px-3 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" />
            Read
          </span>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={archive}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-danger disabled:opacity-60"
        >
          <Archive className="size-4" aria-hidden="true" />
          Archive
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="inquiry-status" className="text-sm font-medium text-ink-soft">
          Status
        </label>
        <select
          id="inquiry-status"
          value={status}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value;
            setStatus(next);
            update({ status: next }, 'Status updated.');
          }}
          className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink"
        >
          {Object.values(INQUIRY_STATUS).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value] || value}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="inquiry-notes" className="text-sm font-medium text-ink-soft">
          Internal notes
        </label>
        <textarea
          id="inquiry-notes"
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes are private to your team — the visitor never sees them."
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <button
          type="button"
          disabled={busy || notes === (inquiry.notes || '')}
          onClick={() => update({ notes }, 'Notes saved.')}
          className="inline-flex h-9 w-fit items-center rounded-md bg-brand-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          Save notes
        </button>
      </div>

      <Link
        href="/vira-admin/inquiries"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to inquiries
      </Link>
    </div>
  );
}
