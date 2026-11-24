'use client';

import { useState } from 'react';
import Link from 'next/link';
import { browserApiUrl } from '@/lib/config';
import { AlertCircle, ArrowLeft, KeyRound, Send } from 'lucide-react';

/**
 * Password recovery.
 *
 * A two-step form. The first step asks for the email address and asks the API
 * to send a six-digit code to the account's linked Telegram chat. The second
 * step takes that code and a new password.
 *
 * The first step's response says the same thing whether a code was sent or
 * not, because the API is careful not to say — so this form does not get to
 * know either. It shows the same confirmation in both cases. That is
 * deliberate: a different message for "no such account" would turn this page
 * into a way to find out who works here.
 *
 * Which is why the confirmation also says what to do if no code arrives: link
 * Telegram, or ask an administrator.
 */
export default function ForgotPasswordForm() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);
  const [telegram, setTelegram] = useState(null);

  async function requestCode(event) {
    event.preventDefault();

    setPending(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch(browserApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That request could not be sent.');
        setPending(false);
        return;
      }

      /*
       * The API answers the same way whatever the account looks like, so it
       * cannot tell us whether a code was sent or a link is needed. It does
       * hand back a link, because a bot cannot message a chat that has never
       * spoken to it — opening the link starts the bot, and the bot replies
       * with the code.
       */
      setTelegram({
        url: data.data?.url || null,
        botUsername: data.data?.botUsername || null,
        ttlMinutes: data.data?.ttlMinutes || 10,
      });

      setStep('code');
      setPending(false);
    } catch {
      setError('We could not reach the management service. Please try again.');
      setPending(false);
    }
  }

  async function redeemCode(event) {
    event.preventDefault();

    setError('');
    setFieldErrors({});

    if (password !== confirm) {
      setFieldErrors({ confirm: ['The two passwords do not match'] });
      return;
    }

    setPending(true);

    try {
      const response = await fetch(browserApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code, newPassword: password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That code could not be used.');
        setPending(false);
        return;
      }

      setDone(true);
      setPending(false);
    } catch {
      setError('We could not reach the management service. Please try again.');
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-md border border-success/30 bg-success-bg p-3 text-sm text-success">
          <p className="font-semibold">Your password has been changed</p>
          <p className="mt-1">
            Every session on your account has been signed out. Sign in again with your new
            password.
          </p>
        </div>

        <Link
          href="/vira-admin/login"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={redeemCode} noValidate className="flex flex-col gap-5">
        <div className="rounded-md border border-line bg-surface-muted p-3 text-xs text-ink-muted">
          <p>
            If <span className="font-medium text-ink-soft">{email}</span> belongs to an
            account with Telegram linked, a six-digit code is now in that chat. It expires
            in {telegram?.ttlMinutes || 10} minutes and can only be used once.
          </p>
          <p className="mt-1.5">
            If the code does not work, connect Telegram from your account page — or ask an
            administrator to reset your password.
          </p>
        </div>

        {/*
         * The link. A bot cannot message a chat that has never spoken to it,
         * so for an account that has not linked Telegram yet this is the only
         * way the code can arrive: opening it starts the bot, and the bot
         * replies with the code.
         *
         * It is shown whether or not it is needed — the API deliberately does
         * not say which case this is — so it has to read as a fallback rather
         * than as the main event.
         */}
        {telegram?.url ? (
          <div className="flex flex-col gap-2 rounded-md border border-brand-200 bg-brand-50 p-3">
            <p className="text-sm font-semibold text-ink">Nothing arrived?</p>
            <p className="text-xs text-ink-muted">
              Open the bot and it will send a fresh code to that chat.
            </p>
            <a
              href={telegram.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <Send className="size-4" aria-hidden="true" />
              Open Telegram
            </a>
            {telegram.botUsername ? (
              <p className="text-xs text-ink-subtle">
                Or message @{telegram.botUsername} directly and tap the link below.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="reset-code" className="text-sm font-medium text-ink-soft">
            Code from Telegram
          </label>
          <input
            id="reset-code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            aria-invalid={fieldErrors.code ? 'true' : undefined}
            className={inputClasses(Boolean(fieldErrors.code))}
          />
          {fieldErrors.code ? <p className="text-xs text-danger">{fieldErrors.code[0]}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="reset-password" className="text-sm font-medium text-ink-soft">
            New password
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.newPassword ? 'true' : undefined}
            className={inputClasses(Boolean(fieldErrors.newPassword))}
          />
          <p className="text-xs text-ink-subtle">
            At least 12 characters, with an upper case letter, a lower case letter and a
            number.
          </p>
          {fieldErrors.newPassword ? (
            <p className="text-xs text-danger">{fieldErrors.newPassword[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="reset-confirm" className="text-sm font-medium text-ink-soft">
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={fieldErrors.confirm ? 'true' : undefined}
            className={inputClasses(Boolean(fieldErrors.confirm))}
          />
          {fieldErrors.confirm ? <p className="text-xs text-danger">{fieldErrors.confirm[0]}</p> : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
        >
          <KeyRound className="size-4" aria-hidden="true" />
          {pending ? 'Setting your password…' : 'Set new password'}
        </button>

        <button
          type="button"
          onClick={() => {
            setStep('email');
            setCode('');
            setError('');
            setFieldErrors({});
          }}
          className="inline-flex items-center justify-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Use a different email address
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} noValidate className="flex flex-col gap-5">
      {error ? (
        <div
          role="alert"
          className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="forgot-email" className="text-sm font-medium text-ink-soft">
          Email address
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email ? 'true' : undefined}
          className={inputClasses(Boolean(fieldErrors.email))}
        />
        {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email[0]}</p> : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-60"
      >
        <Send className="size-4" aria-hidden="true" />
        {pending ? 'Sending…' : 'Send me a code'}
      </button>

      <p className="text-xs text-ink-subtle">
        Codes are delivered over Telegram, so your account must have Telegram linked — or
        an administrator must have registered your Telegram username. If neither, ask an
        administrator to reset your password.
      </p>
    </form>
  );
}

const inputClasses = (hasError) =>
  [
    'h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
  ].join(' ');
