'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';
import { AlertCircle, Check } from 'lucide-react';

/**
 * Self-service editor for the handles a person signs in with.
 *
 * Current password is required — the same rule as changing a password — so a
 * stolen session cannot quietly redirect future sign-ins to a handle the
 * attacker controls. An empty field clears that handle; at least one must
 * remain, which the server enforces.
 */
export default function ChangeHandlesForm({ initial }) {
  const [email, setEmail] = useState(initial?.email || '');
  const [username, setUsername] = useState(initial?.username || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('saving');
    setError('');
    setFieldErrors({});
    setSuccess(false);

    try {
      const response = await fetch(browserApiUrl('/api/auth/handles'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          email: email.trim() === '' ? null : email.trim(),
          username: username.trim() === '' ? null : username.trim().toLowerCase(),
          phone: phone.trim() === '' ? null : phone.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'Could not update your sign-in handles.');
        setStatus('idle');
        return;
      }

      setSuccess(true);
      setCurrentPassword('');
      setStatus('idle');
    } catch {
      setError('We could not reach the management service. Please try again.');
      setStatus('idle');
    }
  }

  const inputClasses = (hasError) =>
    cn(
      'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
      'transition-colors focus:border-brand-500 focus:outline-none',
      hasError ? 'border-danger' : 'border-line',
    );

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
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>Your sign-in handles were updated.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handles-email" className="text-sm font-medium text-ink-soft">
          Email
        </label>
        <input
          id="handles-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClasses(Boolean(fieldErrors.email))}
        />
        {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email[0]}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handles-username" className="text-sm font-medium text-ink-soft">
          Username
        </label>
        <input
          id="handles-username"
          name="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClasses(Boolean(fieldErrors.username))}
        />
        {fieldErrors.username ? <p className="text-xs text-danger">{fieldErrors.username[0]}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handles-phone" className="text-sm font-medium text-ink-soft">
          Phone
        </label>
        <input
          id="handles-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={inputClasses(Boolean(fieldErrors.phone))}
        />
        {fieldErrors.phone ? <p className="text-xs text-danger">{fieldErrors.phone[0]}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="handles-password" className="text-sm font-medium text-ink-soft">
          Current password
        </label>
        <input
          id="handles-password"
          name="currentPassword"
          type="password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          className={inputClasses(Boolean(fieldErrors.currentPassword))}
        />
        {fieldErrors.currentPassword ? (
          <p className="text-xs text-danger">{fieldErrors.currentPassword[0]}</p>
        ) : null}
      </div>

      <p className="text-xs text-ink-muted">
        At least one of email, username or phone must remain. An empty field clears that handle.
      </p>

      <button
        type="submit"
        disabled={status === 'saving'}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-500 px-4',
          'text-sm font-semibold text-white transition-colors hover:bg-brand-600',
          'disabled:pointer-events-none disabled:opacity-60',
        )}
      >
        {status === 'saving' ? 'Saving…' : 'Save handles'}
      </button>
    </form>
  );
}
