'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw, Send, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Connect a Telegram account to receive notifications.
 *
 * The link is established the other way round from what people expect: this card
 * does not ask for a chat id, because a person cannot be trusted to report one
 * correctly and anyone could claim another's. Instead the API issues a one-time
 * code, the person opens the bot with it, and the bot learns the chat id from the
 * update Telegram sends. So the card's job is to hand over the code and then wait.
 *
 * `initial` comes from the session, so the card paints the right state on first
 * render instead of flashing "not connected" before the fetch resolves.
 */
export function TelegramLinkCard({ initial = null }) {
  const [status, setStatus] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [issue, setIssue] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/telegram', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load your Telegram status.');
      setStatus(payload.data);
      // Once linked, the code has been redeemed and is no longer relevant.
      if (payload.data?.linked) setIssue(null);
    } catch (loadError) {
      setError(loadError.message || 'Could not load your Telegram status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  // While a code is outstanding, quietly re-check so the card flips to
  // "connected" on its own once the person presses Start in Telegram.
  useEffect(() => {
    if (!issue || status?.linked) return undefined;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [issue, status?.linked, refresh]);

  async function handleConnect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/telegram/link', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not start the connection.');
      setIssue(payload.data);
    } catch (connectError) {
      setError(connectError.message || 'That did not work. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function handleDisconnect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/telegram', { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not disconnect.');
      setStatus(payload.data);
      setIssue(null);
    } catch (disconnectError) {
      setError(disconnectError.message || 'That did not work. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Checking your Telegram connection…</p>;
  }

  if (!status?.configured) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Telegram notifications are not enabled on this server. An administrator can turn them on by
        configuring the bot credentials.
      </p>
    );
  }

  if (status.linked) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md border border-line bg-surface-muted p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
            <Send className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {status.username ? `Connected as @${status.username}` : 'Telegram connected'}
            </p>
            <p className="text-xs text-ink-muted">
              Notifications about your tasks will arrive in Telegram.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-4 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-50"
          >
            <Unlink className="size-4" aria-hidden="true" />
            {pending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Connect Telegram to get notifications about tasks assigned to you, right where you already
        are — no app to install.
      </p>

      {issue ? (
        <div className="rounded-md border border-line bg-surface-muted p-4">
          <p className="text-sm text-ink">
            Open the bot and press <span className="font-semibold">Start</span>. This page updates on
            its own once you are connected.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Send className="size-4" aria-hidden="true" />
              Open Telegram
            </a>

            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </button>
          </div>

          {!issue.url ? (
            <p className="mt-3 break-all text-xs text-ink-muted">
              Open your bot and send <span className="font-mono">/start {issue.code}</span> to finish
              linking.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-ink-subtle">
            The link is valid for {issue.ttlMinutes} minutes.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white',
            'hover:bg-brand-600 disabled:opacity-60',
          )}
        >
          <Link2 className="size-4" aria-hidden="true" />
          {pending ? 'Preparing…' : issue ? 'Get a new link' : 'Connect Telegram'}
        </button>
      </div>
    </div>
  );
}

export default TelegramLinkCard;
