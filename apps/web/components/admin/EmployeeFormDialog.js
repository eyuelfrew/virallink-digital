'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { EMPLOYMENT_STATUS } from '@virallink/shared/enums';

/**
 * Employee create/edit dialog.
 *
 * One component serves both cases: passing an `employee` switches it to edit mode.
 * That keeps the field list and validation in a single place, so an edit form can
 * never drift from a create form.
 *
 * Visibility is stated explicitly in the UI. `isPublic` decides whether a person
 * appears on the website, and it is easy to forget — so the field is labelled with
 * its consequence rather than as a bare checkbox.
 */
export function EmployeeFormDialog({ employee = null, departments = [], triggerLabel = 'Add employee' }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(employee?.id);

  // Reset transient state each time the dialog opens, so a previous failed
  // attempt's error is not still showing.
  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  async function handleSubmit(formEvent) {
    formEvent.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(formEvent.target);

    const payload = {
      name: formData.get('name'),
      position: formData.get('position') || undefined,
      departmentId: formData.get('departmentId') ? Number(formData.get('departmentId')) : null,
      biography: formData.get('biography') || undefined,
      email: formData.get('email') || null,
      phone: formData.get('phone') || null,
      linkedinUrl: formData.get('linkedinUrl') || null,
      employmentStatus: formData.get('employmentStatus'),
      joinedAt: formData.get('joinedAt') || null,
      displayOrder: Number(formData.get('displayOrder') || 0),
      isPublic: formData.get('isPublic') === 'on',
    };

    try {
      const response = await fetch(isEdit ? `/api/employees/${employee.id}` : '/api/employees', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That could not be saved. Please check the fields.');
        setPending(false);
        return;
      }

      setOpen(false);
      // Re-render the server component so the table reflects the change.
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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="employee-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${employee.name}` : 'Add employee'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col gap-5 px-6 py-5">
                {error ? (
                  <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    name="name"
                    label="Full name"
                    required
                    defaultValue={employee?.name}
                    error={fieldErrors.name?.[0]}
                  />

                  <Field
                    name="position"
                    label="Job title"
                    defaultValue={employee?.position}
                    error={fieldErrors.position?.[0]}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="departmentId"
                    label="Department"
                    defaultValue={employee?.departmentId || ''}
                    options={departments.map((department) => ({
                      value: department.id,
                      label: department.name,
                    }))}
                    emptyLabel="No department"
                  />

                  <SelectField
                    name="employmentStatus"
                    label="Employment status"
                    defaultValue={employee?.employmentStatus || 'active'}
                    options={Object.values(EMPLOYMENT_STATUS).map((status) => ({
                      value: status,
                      label: status.replace('_', ' '),
                    }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="biography" className="text-sm font-medium text-ink-soft">
                    Biography
                  </label>
                  <textarea
                    id="biography"
                    name="biography"
                    rows={4}
                    defaultValue={employee?.biography || ''}
                    className={inputClasses()}
                    placeholder="A short introduction, shown on the team page if this person is public."
                  />
                </div>

                {/* Private fields. Explicitly labelled, because these are the
                    values that must never reach the public site. */}
                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Private contact details
                  </legend>

                  <p className="mb-4 text-xs text-ink-subtle">
                    Never published. Used only inside the admin.
                  </p>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      name="email"
                      label="Work email"
                      type="email"
                      defaultValue={employee?.email}
                      error={fieldErrors.email?.[0]}
                    />

                    <Field
                      name="phone"
                      label="Phone"
                      type="tel"
                      defaultValue={employee?.phone}
                      error={fieldErrors.phone?.[0]}
                    />
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field
                      name="linkedinUrl"
                      label="LinkedIn URL"
                      type="url"
                      defaultValue={employee?.linkedinUrl}
                      error={fieldErrors.linkedinUrl?.[0]}
                    />

                    <Field
                      name="joinedAt"
                      label="Joining date"
                      type="date"
                      defaultValue={employee?.joinedAt ? String(employee.joinedAt).slice(0, 10) : ''}
                      error={fieldErrors.joinedAt?.[0]}
                    />
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    name="displayOrder"
                    label="Display order"
                    type="number"
                    defaultValue={employee?.displayOrder ?? 0}
                    hint="Lower numbers appear first."
                    error={fieldErrors.displayOrder?.[0]}
                  />
                </div>

                {/* The publish switch, labelled with its consequence. */}
                <label className="flex items-start gap-3 rounded-md border border-line bg-surface-muted p-4">
                  <input
                    type="checkbox"
                    name="isPublic"
                    defaultChecked={employee?.isPublic || false}
                    className="mt-0.5 size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />

                  <span>
                    <span className="block text-sm font-medium text-ink-soft">
                      Show on the public website
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      Their name, job title, department, biography, photo and LinkedIn link will appear on the team
                      page. Their email and phone number will not.
                    </span>
                  </span>
                </label>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Field primitives                                                           */
/* -------------------------------------------------------------------------- */

function Field({ name, label, type = 'text', required, defaultValue, error, hint }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={inputClasses(Boolean(error))}
      />

      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SelectField({ name, label, options, defaultValue, emptyLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">
        {label}
      </label>

      <select id={name} name={name} defaultValue={defaultValue ?? ''} className={inputClasses()}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const inputClasses = (hasError = false, extra = '') =>
  cn(
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
    extra,
  );

export default EmployeeFormDialog;