'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';
import { AlertCircle, Send } from 'lucide-react';

/**
 * Admin form for sending a personal notification to one user.
 *
 * Posts to /api/notifications/send, which the API enqueues for delivery over
 * push (FCM) and, when the recipient has Telegram linked, a message.
 */
export default function SendNotificationForm({ users = [] }) {
  const [userId, setUserId] = useState(users[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    setSuccess('');

    try {
      const response = await fetch(browserApiUrl('/api/notifications/send'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: Number(userId), title, body }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || 'That notification could not be sent.');
        setStatus('idle');
        return;
      }

      const result = data.data || {};
      const push = result.push || { sent: 0, failed: 0 };
      const fcmEnabled = result.fcmEnabled !== false;
      const telegram = result.telegram === true;

      let message;
      if (!fcmEnabled) {
        message = 'Queued — FCM is not configured on the server, so it will be delivered once it is.';
      } else if (push.sent > 0) {
        message = `Sent to ${push.sent} device${push.sent === 1 ? '' : 's'}${telegram ? ' (and Telegram)' : ''}.`;
      } else if (push.failed > 0) {
        message = 'No device reached — queued for retry by the cron drain.';
      } else {
        message = `Queued${telegram ? ' (Telegram sent)' : ''}.`;
      }

      setSuccess(message);
      setTitle('');
      setBody('');
      setStatus('idle');
    } catch {
      setError('We could not reach the management service. Please try again.');
      setStatus('idle');
    }
  }

  const inputClasses =
    'h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-brand-500 focus:outline-none';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error ? (
        <div role="alert" className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="flex gap-2.5 rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          <p>{success}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notify-user" className="text-sm font-medium text-ink-soft">
          Recipient
        </label>
        <select
          id="notify-user"
          name="userId"
          required
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className={inputClasses}
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} — {user.handle}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notify-title" className="text-sm font-medium text-ink-soft">
          Title
        </label>
        <input
          id="notify-title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notify-body" className="text-sm font-medium text-ink-soft">
          Message
        </label>
        <textarea
          id="notify-body"
          name="body"
          required
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-brand-500 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'sending' || users.length === 0}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-500 px-4',
          'text-sm font-semibold text-white transition-colors hover:bg-brand-600',
          'disabled:pointer-events-none disabled:opacity-60',
        )}
      >
        <Send className="size-4" aria-hidden="true" />
        {status === 'sending' ? 'Sending…' : 'Send notification'}
      </button>
    </form>
  );
}
