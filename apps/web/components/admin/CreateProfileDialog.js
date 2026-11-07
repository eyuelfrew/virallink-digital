'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PhotoField } from '@/components/admin/PhotoField';

/**
 * Create the employee profile for an account that has none, in one step.
 *
 * The inverse of CreateLoginDialog: an administrator or owner already has a
 * sign-in and turns out to also be staff. Their name — and email — come from the
 * account, so the profile is created and linked without retyping the person. Job
 * title and department are optional and can be filled in later from Employees.
 */
export function CreateProfileDialog({ user, departments = [], triggerLabel = 'Create profile', canUpload = true }) {
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
      position: form.get('position') || undefined,
      departmentId: form.get('departmentId') ? Number(form.get('departmentId')) : null,
      photoMediaId: form.get('photoMediaId') ? Number(form.get('photoMediaId')) : null,
      email: user.email,
    };

    try {
      const response = await fetch(`/api/users/${user.id}/employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That profile could not be created.');
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
            aria-labelledby="create-profile-title"
            className="relative my-auto w-full max-w-md rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="create-profile-title" className="text-lg font-semibold">
                Create an employee profile for {user.name}
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
                  The profile will be created and linked to {user.name}&rsquo;s account. It stays private until
                  you mark it public on the Employees page.
                </p>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-name" className="text-sm font-medium text-ink-soft">
                    Full name
                  </label>
                  <input
                    id="profile-name"
                    name="name"
                    required
                    defaultValue={user.name || ''}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.name ? <p className="text-xs text-danger">{fieldErrors.name[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-position" className="text-sm font-medium text-ink-soft">
                    Job title
                  </label>
                  <input
                    id="profile-position"
                    name="position"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  {fieldErrors.position ? <p className="text-xs text-danger">{fieldErrors.position[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-department" className="text-sm font-medium text-ink-soft">
                    Department
                  </label>
                  <select
                    id="profile-department"
                    name="departmentId"
                    defaultValue=""
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.departmentId ? (
                    <p className="text-xs text-danger">{fieldErrors.departmentId[0]}</p>
                  ) : null}
                </div>

                <div className="rounded-md border border-line p-4">
                  <PhotoField initialMedia={null} canUpload={canUpload} />
                </div>
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
                  {pending ? 'Creating…' : 'Create profile'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default CreateProfileDialog;
