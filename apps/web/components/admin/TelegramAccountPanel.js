'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { AdminPanel } from '@/components/admin/AdminUI';
import { browserApiUrl } from '@/lib/config';

/**
 * Personal Telegram account (MTProto).
 *
 * A bot token can only answer messages sent to a bot. This panel signs a person
 * in as themselves, so auto-reply can answer their own chats. Every action is
 * authenticated only: a role-holding user connects their own account here.
 */

const STATUS_LABELS = {
  disconnected: 'Not connected',
  code_sent: 'Login code sent',
  password_required: '2FA password required',
  connected: 'Connected',
  error: 'Needs attention',
  new: 'Not connected',
};

function statusTone(status) {
  if (status === 'connected') return 'bg-success-bg text-success';
  if (status === 'code_sent' || status === 'password_required') return 'bg-warning-bg text-warning';
  if (status === 'error') return 'bg-danger-bg text-danger';
  return 'bg-surface-muted text-ink-muted';
}

function accountName(status) {
  if (!status) return '';
  const fullName = [status.account?.first_name, status.account?.last_name]
    .filter(Boolean)
    .join(' ');
  return fullName || status.account?.username || '';
}

export function TelegramAccountPanel({ onChanged, className = '' }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const qrStartedRef = useRef(false);

  function applyStatus(next, { syncForm = true } = {}) {
    setStatus(next);
    if (syncForm) {
      setApiId(next?.apiId ? String(next.apiId) : '');
      setPhoneNumber(next?.phoneNumber || '');
    }

    if (qrStartedRef.current && next?.connected) {
      qrStartedRef.current = false;
      setPassword('');
      setNotice('Telegram account connected.');
      onChanged?.();
    }
  }

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(browserApiUrl('/api/telegram-auto-reply/account/status'), { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load your Telegram account.');
      applyStatus(payload.data || null);
    } catch (loadError) {
      setError(loadError.message || 'Could not load your Telegram account.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const qrPending = Boolean(
    status?.pending_login?.mode === 'qr' &&
      ['qr_pending', 'password_required'].includes(status.pending_login.status) &&
      !status?.connected,
  );

  /*
   * The QR token is refreshed by Telegram every ~30 seconds, and the login is
   * completed on the server when the phone approves it. Poll the status so the
   * image stays current and the panel switches to "Connected" on its own.
   */
  useEffect(() => {
    if (!qrPending) return undefined;

    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(browserApiUrl('/api/telegram-auto-reply/account/status'), {
          cache: 'no-store',
          credentials: 'include',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || stopped) return;
        const next = payload.data || null;
        applyStatus(next, { syncForm: Boolean(next?.connected) });
        if (!next?.connected && !next?.pending_login) {
          setNotice('The QR code expired. Press "Connect with QR code" to try again.');
        }
      } catch {
        // A transient network error should not end the QR flow.
      }
    };

    const id = setInterval(poll, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [qrPending]);

  async function call(path, { method = 'POST', body } = {}) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/account${path}`), {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Telegram request failed.');

      const next = payload.data || null;
      if (next && typeof next === 'object' && 'status' in next && 'configured' in next) {
        applyStatus(next);
      }
      return next;
    } catch (requestError) {
      setError(requestError.message || 'Telegram request failed.');
      throw requestError;
    } finally {
      setPending(false);
    }
  }

  async function handleSaveConfig(event) {
    event.preventDefault();
    try {
      const next = await call('/config', {
        method: 'PUT',
        body: {
          apiId: Number(apiId),
          apiHash: apiHash.trim(),
          phoneNumber: phoneNumber.trim(),
        },
      });
      setApiHash('');
      setNotice(
        next?.connected
          ? 'Telegram credentials saved. Your session is still connected.'
          : 'Telegram credentials saved. Send yourself a login code next.',
      );
    } catch {
      // The shared `call` helper already surfaced the error.
    }
  }

  async function handleSendCode() {
    try {
      /*
       * The phone number in the form is not used until it is saved. Save it
       * first, otherwise "try another number" silently asks Telegram for a
       * code on the previous number.
       */
      const savedPhone = String(status?.phoneNumber || '').trim();
      const savedApiId = status?.apiId ? String(status.apiId) : '';
      const nextPhone = phoneNumber.trim();
      const nextApiId = apiId.trim();
      const credentialsDirty =
        (nextPhone && nextPhone !== savedPhone) ||
        (nextApiId && nextApiId !== savedApiId) ||
        Boolean(apiHash.trim());

      if (credentialsDirty) {
        if (!nextPhone || !nextApiId) {
          throw new Error('Enter the API ID and phone number first.');
        }
        await call('/config', {
          method: 'PUT',
          body: {
            apiId: Number(nextApiId),
            apiHash: apiHash.trim(),
            phoneNumber: nextPhone,
          },
        });
        setApiHash('');
      }

      const next = await call('/send-code');
      setCode('');
      const phone = next?.phone_number || nextPhone || 'your phone';

      // This account only uses the OTP path: Telegram delivers the code inside
      // the app. There is no SMS/call branch.
      setNotice(
        `Telegram sent the login code to ${phone}. Look for a message from "Telegram" inside your Telegram app. If you are signed in to this account on more than one phone, it may land on another session — use "Connect with QR code" below.`,
      );
    } catch {
      // Error already surfaced.
    }
  }

  async function handleStartQr() {
    qrStartedRef.current = true;
    try {
      await call('/qr-start');
      setNotice('Scan the QR code with Telegram on your phone.');
    } catch {
      qrStartedRef.current = false;
    }
  }

  async function handleCancelQr() {
    qrStartedRef.current = false;
    try {
      await call('/cancel-login');
      setNotice('QR sign-in cancelled.');
    } catch {
      // Error already surfaced.
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault();
    try {
      const next = await call('/verify-code', { body: { code: code.trim() } });
      setCode('');
      if (next?.status === 'password_required') {
        setNotice('Telegram asks for your 2FA password.');
      } else {
        setPassword('');
        setNotice('Telegram account connected.');
        onChanged?.();
      }
    } catch {
      // Error already surfaced.
    }
  }

  async function handleVerifyPassword(event) {
    event.preventDefault();
    try {
      await call('/verify-password', { body: { password } });
      setPassword('');
      setNotice('Telegram account connected.');
      onChanged?.();
    } catch {
      // Error already surfaced.
    }
  }

  async function handleConnect() {
    try {
      await call('/connect');
      setNotice('Telegram account reconnected with the saved session.');
      onChanged?.();
    } catch {
      // Error already surfaced.
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect this Telegram account? It will stop answering chats until you reconnect.')) return;
    try {
      await call('/disconnect');
      setNotice('Telegram account disconnected.');
      onChanged?.();
    } catch {
      // Error already surfaced.
    }
  }

  async function handleClearSession() {
    if (!window.confirm('Forget the saved Telegram session? You will need to enter a new login code.')) return;
    try {
      await call('/session', { method: 'DELETE' });
      setCode('');
      setPassword('');
      setNotice('Saved session cleared. Send a new login code to sign in again.');
    } catch {
      // Error already surfaced.
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        'Reset your Telegram setup? Credentials and session are removed, but your chats, settings, catalog and rules are kept.',
      )
    ) {
      return;
    }
    try {
      await call('/config', { method: 'DELETE' });
      setApiHash('');
      setCode('');
      setPassword('');
      setNotice('Telegram setup reset. Your auto-reply history is still available.');
      onChanged?.();
    } catch {
      // Error already surfaced.
    }
  }

  if (loading) {
    return (
      <AdminPanel title="Your Telegram account" className={className}>
        <p className="text-sm text-ink-muted">Loading your Telegram account…</p>
      </AdminPanel>
    );
  }

  const currentStatus = status?.status || 'disconnected';
  const connected = Boolean(status?.connected);
  const configured = Boolean(status?.configured);
  const pendingLogin = status?.pending_login || null;
  const needsPassword = pendingLogin?.status === 'password_required';
  const qrLogin = pendingLogin?.mode === 'qr' ? pendingLogin : null;

  return (
    <AdminPanel
      title="Your Telegram account"
      description="Sign in with your own Telegram account so auto-reply can answer your chats."
      className={className}
      action={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(currentStatus)}`}>
          {connected ? 'Connected' : STATUS_LABELS[currentStatus] || 'Not connected'}
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {error ? <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-md bg-success-bg p-3 text-sm text-success">{notice}</p> : null}

        {status?.lastError ? (
          <p className="rounded-md bg-warning-bg p-3 text-sm text-warning">{status.lastError}</p>
        ) : null}

        {connected ? (
          <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {accountName(status) || 'Personal Telegram'}
                </p>
                <p className="text-xs text-ink-muted">
                  {status?.account?.username ? `@${status.account.username}` : status?.phoneNumber || 'Signed in'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={handleDisconnect}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink-soft disabled:opacity-60"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Disconnect
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleClearSession}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink-soft disabled:opacity-60"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Clear session
              </button>
            </div>
          </div>
        ) : null}

        {!connected && status?.sessionSet ? (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Saved session available</p>
              <p className="text-xs text-ink-muted">
                Reconnect without asking Telegram for a new login code.
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={handleConnect}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Link2 className="size-4" aria-hidden="true" />
              Reconnect
            </button>
          </div>
        ) : null}

        {!connected ? (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-muted p-4">
            {qrLogin?.status === 'qr_pending' ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-ink">Scan this QR code with Telegram</p>
                  <p className="text-xs text-ink-muted">
                    Open Telegram on your phone → Settings → Devices → Link Desktop Device, then
                    scan the code below. No login code is needed.
                  </p>
                </div>
                {qrLogin.qr_data_url ? (
                  <img
                    src={qrLogin.qr_data_url}
                    alt="Telegram login QR code"
                    className="mx-auto size-64 rounded-md border border-line bg-white p-2"
                  />
                ) : (
                  <p className="text-sm text-ink-muted">Generating the QR code…</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ink-muted">
                    {qrLogin.qr_expires_at
                      ? `This code refreshes automatically. The current code expires at ${new Date(
                          qrLogin.qr_expires_at,
                        ).toLocaleTimeString()}.`
                      : 'This code refreshes automatically.'}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={handleCancelQr}
                    className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink-soft disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : qrLogin?.status === 'password_required' ? (
              <p className="text-sm text-ink">
                QR code scanned. Enter your Telegram 2FA password below to finish signing in.
              </p>
            ) : qrLogin?.status === 'error' ? (
              <>
                <p className="text-sm font-semibold text-ink">QR sign-in failed</p>
                <p className="text-xs text-danger">
                  {qrLogin.error || 'Telegram did not accept the QR sign-in.'}
                </p>
                <div>
                  <button
                    type="button"
                    disabled={pending || !configured}
                    onClick={handleStartQr}
                    className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink-soft disabled:opacity-60"
                  >
                    Try QR again
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-ink">Trouble receiving the login code?</p>
                  <p className="text-xs text-ink-muted">
                    Codes can arrive in an odd place when your Telegram is connected elsewhere.
                    You can sign in with a QR code from your phone instead — no login code is
                    needed.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={pending || !configured}
                    onClick={handleStartQr}
                    className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink-soft disabled:opacity-60"
                  >
                    Connect with QR code
                  </button>
                  {!configured ? (
                    <p className="mt-2 text-xs text-ink-muted">
                      Save your API ID, API Hash and phone number above first.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {!needsPassword && !connected ? (
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">API ID</span>
                <input
                  inputMode="numeric"
                  value={apiId}
                  onChange={(event) => setApiId(event.target.value)}
                  placeholder="e.g. 12345678"
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">API Hash</span>
                <input
                  type="password"
                  value={apiHash}
                  onChange={(event) => setApiHash(event.target.value)}
                  placeholder={status?.apiHashSet ? 'Saved — leave blank to keep it' : 'From my.telegram.org'}
                  className="h-10 rounded-md border border-line px-3 text-sm"
                  autoComplete="off"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Phone number</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+251912345678"
                className="h-10 rounded-md border border-line px-3 text-sm"
                autoComplete="tel"
              />
            </label>

            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
              API credentials and the Telegram session are encrypted at rest. Use the API ID and hash
              from your own app at my.telegram.org, not the shared example values.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending || !apiId.trim() || !phoneNumber.trim()}
                className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {configured ? 'Update credentials' : 'Save credentials'}
              </button>

              {configured ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleSendCode}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Send login code
                </button>
              ) : null}

              {configured ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleReset}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-danger disabled:opacity-60"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Reset setup
                </button>
              ) : null}
            </div>
          </form>
        ) : null}

        {pendingLogin?.status === 'code_sent' && !needsPassword ? (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-2 rounded-md border border-line p-4">
            <p className="text-sm font-semibold text-ink">Enter the login code</p>
            <p className="text-xs text-ink-muted">
              Telegram sent the login code inside your Telegram app — search for "Telegram"
              and read the code. If it expired or is not there, cancel and use
              “Connect with QR code” above.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Login code"
                className="h-10 flex-1 rounded-md border border-line px-3 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !code.trim()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Verify code
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleSendCode}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
              >
                Resend
              </button>
            </div>
          </form>
        ) : null}

        {needsPassword ? (
          <form onSubmit={handleVerifyPassword} className="flex flex-col gap-2 rounded-md border border-line p-4">
            <p className="text-sm font-semibold text-ink">Two-step verification</p>
            <p className="text-xs text-ink-muted">
              This Telegram account has a 2FA password. Enter it once to finish signing in.
            </p>
            {pendingLogin?.error ? (
              <p className="rounded-md bg-danger-bg p-2 text-xs text-danger">{pendingLogin.error}</p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Telegram 2FA password"
                className="h-10 flex-1 rounded-md border border-line px-3 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !password}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Verify password
              </button>
            </div>
          </form>
        ) : null}

        {!configured && !connected ? (
          <p className="text-xs text-ink-muted">
            You need an API ID and API Hash from{' '}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-600 underline-offset-2 hover:underline"
            >
              my.telegram.org
            </a>
            . These identify the Telegram app, not your bot.
          </p>
        ) : null}
      </div>
    </AdminPanel>
  );
}

export default TelegramAccountPanel;
