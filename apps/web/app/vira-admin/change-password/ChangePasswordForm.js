'use client';

import { useState } from 'react';
import Link from 'next/link';
import { browserApiUrl } from '@/lib/config';
import { AlertCircle, KeyRound } from 'lucide-react';

/**
 * Change your own password.
 *
 * Used from two places: the account page, and the forced-change screen that an
 * administrator's password reset sends somebody to. The forced case is why the
 * form asks for the current password even when the administrator has just set
 * one — the person is expected to know the temporary password they were given.
 *
 * On success the API signs every session out, including this one. That is the
 * point of a password change: a stolen session must not outlive the password
 * it was issued against. So the browser ends up signed out and says so.
 */
export default function ChangePasswordForm({ forced = false }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setFieldErrors({});

    if (newPassword !== confirm) {
      setFieldErrors({ confirm: ['The two passwords do not match'] });
      return;
    }

    setPending(true);

    try {
      const response = await fetch(browserApiUrl('/api/auth/change-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'Your password could not be changed.');
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {forced ? (
        <div className="rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
          <p className="font-semibold">Choose your own password</p>
          <p className="mt-1">
            An administrator set a temporary password on your account. Pick one of your own
            before you go any further.
          </p>
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
        <label htmlFor="current-password" className="text-sm font-medium text-ink-soft">
          {forced ? 'Temporary password' : 'Current password'}
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-invalid={fieldErrors.currentPassword ? 'true' : undefined}
          className={inputClasses(Boolean(fieldErrors.currentPassword))}
        />
        {fieldErrors.currentPassword ? (
          <p className="text-xs text-danger">{fieldErrors.currentPassword[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className="text-sm font-medium text-ink-soft">
          New password
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
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
        <label htmlFor="confirm-password" className="text-sm font-medium text-ink-soft">
          Confirm new password
        </label>
        <input
          id="confirm-password"
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
        {pending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

const inputClasses = (hasError) =>
  [
    'h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
  ].join(' ');
