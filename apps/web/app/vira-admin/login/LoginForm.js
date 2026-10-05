'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AlertCircle, LogIn } from 'lucide-react';

/**
 * Login form.
 *
 * Posts to this app's own /api route, which forwards to the API over loopback.
 * The session is set as an httpOnly cookie by the API response, so the access
 * token is never exposed to page JavaScript.
 *
 * Errors are shown verbatim from the API. The API deliberately returns the same
 * message for an unknown email and a wrong password, so nothing here reveals
 * whether an account exists.
 */
export default function LoginForm({ next = '', hasStaleCookie = false }) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit(event) {
    event.preventDefault();

    setStatus('submitting');
    setError('');
    setFieldErrors({});

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.details || {});
        setError(data.error?.message || 'Sign-in failed. Please try again.');
        setStatus('idle');
        return;
      }

      /*
       * Only allow a same-origin redirect target. Without this check an attacker
       * could pass ?next=https://evil.example and the successful sign-in would
       * bounce the admin off-site — a classic open-redirect.
       */
      const target = next.startsWith('/') && !next.startsWith('//') ? next : '/vira-admin/dashboard';

      // Full navigation rather than router.push so the new cookie is picked up by
      // the server components that will run on the next render.
      window.location.assign(target);
    } catch {
      setError('We could not reach the management service. Please try again.');
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {error ? (
        <div role="alert" className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {hasStaleCookie ? (
        <p className="rounded-md bg-warning-bg p-3 text-xs text-warning">
          A previous session cookie is present but no longer valid. Signing in will replace it.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-ink-soft">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email ? 'true' : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          className={inputClasses(Boolean(fieldErrors.email))}
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-sm text-danger">
            {fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium text-ink-soft">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password ? 'true' : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          className={inputClasses(Boolean(fieldErrors.password))}
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-danger">
            {fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-4',
          'text-sm font-semibold text-white transition-colors hover:bg-brand-600',
          'disabled:pointer-events-none disabled:opacity-60',
        )}
      >
        {status === 'submitting' ? (
          <>
            <Spinner />
            Signing in
          </>
        ) : (
          <>
            <LogIn className="size-4" aria-hidden="true" />
            Sign in
          </>
        )}
      </button>
    </form>
  );
}

const inputClasses = (hasError) =>
  cn(
    'h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
  );

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}