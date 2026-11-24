'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';

/**
 * Create / edit an admin account.
 *
 * Password is optional when editing and required when creating. An empty string
 * is sent as `undefined` rather than "", because updateUserSchema treats an
 * omitted password as "leave the existing one alone" while "" would fail the
 * password policy and block the whole update — including a role change.
 */
export function UserFormDialog({ user = null, roles = [], employees = [], triggerLabel = 'Add user' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(user?.id);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const password = form.get('password');

    const payload = {
      name: form.get('name'),
      // An empty field means "no handle" — sent as null so the API stores
      // null rather than an empty string. At least one of the three must be set.
      email: form.get('email') ? String(form.get('email')).trim() || null : null,
      username: form.get('username') ? String(form.get('username')).trim().toLowerCase() || null : null,
      phone: form.get('phone') ? String(form.get('phone')).trim() || null : null,
      role: form.get('role'),
      isActive: form.get('isActive') === 'on',
      // '' means "not linked" and is sent as null — the API treats null as
      // unlink and an absent field as "leave alone", so an edit that changes
      // nothing about the link still round-trips cleanly.
      employeeId: form.get('employeeId') ? Number(form.get('employeeId')) : null,
      // The Telegram username, without the @. An empty string clears it, which
      // is different from the field being absent — the API treats an absent
      // value as "leave it alone" and an empty one as "clear it".
      ...(form.get('telegramUsername') !== null
        ? { telegramUsername: form.get('telegramUsername').trim() }
        : {}),
      // An empty chat id means "not linked" — sent as null so the API
      // unlinks rather than leaving the old one in place.
      ...(form.get('telegramChatId') !== null
        ? { telegramChatId: form.get('telegramChatId') ? Number(form.get('telegramChatId')) : null }
        : {}),
      ...(password ? { password } : {}),
    };

    try {
      const response = await fetch(browserApiUrl(isEdit ? `/api/users/${user.id}` : '/api/users'), {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That account could not be saved.');
        setPending(false);
        return;
      }

      setOpen(false);
      setPending(false);
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
        className={cn(
          'inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition-colors',
          isEdit
            ? 'border border-line text-ink-soft hover:bg-surface-muted'
            : 'bg-brand-500 text-white hover:bg-brand-600',
        )}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div className="fixed inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-dialog-title"
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="user-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${user.email || user.username || user.phone || user.name}` : 'Add user'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-name" className="text-sm font-medium text-ink-soft">
                    Full name
                  </label>
                  <input
                    id="user-name"
                    name="name"
                    required
                    defaultValue={user?.name || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-email" className="text-sm font-medium text-ink-soft">
                    Email (optional)
                  </label>
                  <input
                    id="user-email"
                    name="email"
                    type="email"
                    defaultValue={user?.email || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.email ? <p className="text-xs text-danger">{fieldErrors.email[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-username" className="text-sm font-medium text-ink-soft">
                    Username (optional)
                  </label>
                  <input
                    id="user-username"
                    name="username"
                    type="text"
                    defaultValue={user?.username || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.username ? <p className="text-xs text-danger">{fieldErrors.username[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-phone" className="text-sm font-medium text-ink-soft">
                    Phone (optional)
                  </label>
                  <input
                    id="user-phone"
                    name="phone"
                    type="tel"
                    defaultValue={user?.phone || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.phone ? <p className="text-xs text-danger">{fieldErrors.phone[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-role" className="text-sm font-medium text-ink-soft">
                    Role
                  </label>
                  <select
                    id="user-role"
                    name="role"
                    defaultValue={user?.roles?.[0] || 'EDITOR'}
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
                  <label htmlFor="user-employee" className="text-sm font-medium text-ink-soft">
                    Employee profile
                  </label>
                  <select
                    id="user-employee"
                    name="employeeId"
                    defaultValue={user?.employeeId || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  >
                    <option value="">Not linked</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-ink-subtle">
                    Linking lets this person see the tasks assigned to that profile under My tasks.
                  </p>
                  {fieldErrors.employeeId ? (
                    <p className="text-xs text-danger">{fieldErrors.employeeId[0]}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-password" className="text-sm font-medium text-ink-soft">
                    {isEdit ? 'New password' : 'Password'}
                  </label>
                  <input
                    id="user-password"
                    name="password"
                    type="password"
                    required={!isEdit}
                    autoComplete="new-password"
                    placeholder={isEdit ? 'Leave blank to keep the current password' : ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  <p className="text-xs text-ink-subtle">
                    At least 12 characters, with an upper case letter, a lower case letter and a number.
                  </p>
                  {fieldErrors.password ? <p className="text-xs text-danger">{fieldErrors.password[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-telegram-chat" className="text-sm font-medium text-ink-soft">
                    Telegram chat id
                  </label>
                  <input
                    id="user-telegram-chat"
                    name="telegramChatId"
                    type="number"
                    inputMode="numeric"
                    defaultValue={user?.telegramChatId || ''}
                    placeholder="e.g. 123456789"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  <p className="text-xs text-ink-subtle">
                    The bot delivers here. Run <code>npm run telegram:chatid</code> to read it
                    out of Telegram when the API has no public address to be reached on.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="user-telegram" className="text-sm font-medium text-ink-soft">
                    Telegram username
                  </label>
                  <input
                    id="user-telegram"
                    name="telegramUsername"
                    defaultValue={user?.telegramUsername || ''}
                    placeholder="e.g. johndoe"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  <p className="text-xs text-ink-subtle">
                    Without the @. Registering this lets the person recover their password
                    over Telegram before they have linked an account: the bot sends a reset
                    code only to a chat whose username matches this one.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={user ? user.isActive : true}
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
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default UserFormDialog;