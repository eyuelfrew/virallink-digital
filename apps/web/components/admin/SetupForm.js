'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, UserPlus } from 'lucide-react';

/**
 * First-run setup: create the very first administrator.
 *
 * This exists purely because of the hosting constraint. The app runs on cPanel,
 * where the only thing that can be started is the Node.js application — there is
 * no shell to run `npm run create:admin` in. The database builds itself on boot,
 * but a person cannot, so without this a fresh install would be permanently
 * unopenable.
 *
 * The form disappears the moment an account exists: the API refuses the request,
 * and the page stops offering it. That is enforced server-side, not by hiding a
 * button, so it cannot be reached by typing the URL.
 */
export function SetupForm({ onDone }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    };

    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That account could not be created.');
        setPending(false);
        return;
      }

      // Straight to the sign-in form with the email pre-filled: setup does not
      // start a session, so there is exactly one code path for signing in.
      onDone?.(payload.email);
      router.refresh();
    } catch {
      setError('The management service did not respond. Please try again.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
        <p className="font-semibold">First-time setup</p>
        <p className="mt-1">
          No administrator exists yet. Create the first account to sign in. This option
          disappears as soon as an account exists.
        </p>
      </div>

      {error ? (
        <div role="alert" className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="setup-name" className="text-sm font-medium text-ink-soft">
          Full name
        </label>
        <input
          id="setup-name"
          name="name"
          required
          autoComplete="name"
          className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
        />
        {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name[0]}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="setup-email" className="text-sm font-medium text-ink-soft">
          Email
        </label>
        <input
          id="setup-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
        />
        {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email[0]}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="setup-password" className="text-sm font-medium text-ink-soft">
          Password
        </label>
        <input
          id="setup-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
        />
        <p className="text-xs text-ink-subtle">
          At least 12 characters, with an upper case letter, a lower case letter and a
          number.
        </p>
        {fieldErrors.password ? <p className="text-xs text-danger">{fieldErrors.password[0]}</p> : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        {pending ? 'Creating…' : 'Create administrator'}
      </button>
    </form>
  );
}

export default SetupForm;