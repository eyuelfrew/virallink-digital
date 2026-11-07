'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Create the sign-in for an existing employee, in one step.
 *
 * The employee's name and email arrive prefilled from the row, so the person is
 * never retyped into the user form — the admin only chooses a role and a
 * password. The account is created already linked (`employeeId`), which is what
 * makes "My tasks" and Telegram notifications resolve for this person.
 *
 * The role list is supplied by the page; if the caller cannot read roles the
 * select is empty, but the endpoint still rejects an unknown role rather than
 * creating an unprivileged account by accident.
 */
export function CreateLoginDialog({ employee, roles = [], triggerLabel = 'Create login' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      role: form.get('role'),
      isActive: form.get('isActive') === 'on',
      password: form.get('password'),
      employeeId: employee.id,
    };

    try {
      const response = await fetch('/api/users', {
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

      setOpen(false);
      router.refresh();
    } catch {
      setError('The management service did not respond. Please try again.');
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-brand-200 px-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-login-title"
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="create-login-title" className="text-lg font-semibold">
                Create a login for {employee.name}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <p className="text-xs text-ink-subtle">
                  This account will be linked to {employee.name}&rsquo;s employee profile, so tasks assigned to
                  them appear under &ldquo;My tasks&rdquo;.
                </p>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-name" className="text-sm font-medium text-ink-soft">
                    Full name
                  </label>
                  <input
                    id="login-name"
                    name="name"
                    required
                    defaultValue={employee.name || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-email" className="text-sm font-medium text-ink-soft">
                    Email
                  </label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    defaultValue={employee.email || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-role" className="text-sm font-medium text-ink-soft">
                    Role
                  </label>
                  <select
                    id="login-role"
                    name="role"
                    defaultValue={roles.some((role) => role.key === 'EDITOR') ? 'EDITOR' : roles[0]?.key || 'EDITOR'}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  >
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.role ? <p className="text-xs text-danger">{fieldErrors.role[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-password" className="text-sm font-medium text-ink-soft">
                    Password
                  </label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  <p className="text-xs text-ink-subtle">
                    At least 12 characters, with an upper case letter, a lower case letter and a number.
                  </p>
                  {fieldErrors.password ? <p className="text-xs text-danger">{fieldErrors.password[0]}</p> : null}
                </div>

                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked
                    className="size-4 rounded border-line"
                  />
                  Account is active
                </label>
              </div>

              <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 rounded-md border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {pending ? 'Creating…' : 'Create login'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default CreateLoginDialog;
