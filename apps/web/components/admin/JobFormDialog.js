'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';

/**
 * Job / vacancy form for the careers admin.
 *
 * Posts straight to the API (job.write is enforced there), and refreshes the
 * list on success. All fields mirror the API's upsertJobSchema so the form
 * cannot send a shape the validator rejects.
 */
export function JobFormDialog({ job = null, departments = [], triggerLabel = 'Add role' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [closesAt, setClosesAt] = useState(
    job?.closesAt ? String(job.closesAt).slice(0, 10) : '',
  );

  const isEdit = Boolean(job?.id);
  // yyyy-mm-dd in local time, matching what <input type="date"> reports and
  // what the API's DATEONLY column stores.
  const today = localDateString();
  const closesInPast = Boolean(closesAt && closesAt < today);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const f = new FormData(event.currentTarget);

    const payload = {
      title: f.get('title'),
      slug: f.get('slug') || undefined,
      departmentId: f.get('departmentId') ? Number(f.get('departmentId')) : null,
      employmentType: f.get('employmentType') || undefined,
      location: f.get('location') || undefined,
      isRemote: f.get('isRemote') === 'on',
      summary: f.get('summary') || undefined,
      description: f.get('description'),
      requirements: f.get('requirements') || undefined,
      applyEmail: f.get('applyEmail') || null,
      applyUrl: f.get('applyUrl') || null,
      isPublished: f.get('isPublished') === 'on',
      closesAt: f.get('closesAt') || null,
      displayOrder: Number(f.get('displayOrder')) || 0,
    };

    try {
      const response = await fetch(browserApiUrl(isEdit ? `/api/jobs/${job.id}` : '/api/jobs'), {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFieldErrors(data.error?.details || {});
        setError(data.error?.message || 'That could not be saved.');
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
            aria-labelledby="job-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="job-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${job.title}` : 'Add role'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-5 px-6 py-5">
                {error ? (
                  <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="title" label="Role title" required defaultValue={job?.title} error={fieldErrors.title?.[0]} />
                  <Field name="slug" label="URL slug" defaultValue={job?.slug} hint="Leave blank to generate from the title." error={fieldErrors.slug?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="departmentId" className="text-sm font-medium text-ink-soft">Department</label>
                    <select id="departmentId" name="departmentId" defaultValue={job?.departmentId || ''} className={inputClasses()}>
                      <option value="">No department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <Field name="employmentType" label="Employment type" defaultValue={job?.employmentType} hint="e.g. Full-time, Contract, Internship" error={fieldErrors.employmentType?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="location" label="Location" defaultValue={job?.location} hint="e.g. Addis Ababa, Hybrid" error={fieldErrors.location?.[0]} />
                  <Field
                    name="closesAt"
                    label="Closing date"
                    type="date"
                    min={today}
                    defaultValue={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                    hint="Leave blank to keep the role open indefinitely."
                    error={fieldErrors.closesAt?.[0]}
                  />
                </div>

                {closesInPast ? (
                  <div role="alert" className="rounded-md border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
                    This closing date has already passed. The role will be published in the admin but hidden from the public careers page.
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Field name="summary" label="Short summary" defaultValue={job?.summary} hint="A one-line summary for the listings." error={fieldErrors.summary?.[0]} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" className="text-sm font-medium text-ink-soft">
                    Description <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={10}
                    required
                    defaultValue={job?.description || ''}
                    className={inputClasses(Boolean(fieldErrors.description), 'resize-y')}
                    placeholder="What the role involves. Use blank lines between paragraphs."
                  />
                  {fieldErrors.description ? <p className="text-sm text-danger">{fieldErrors.description[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="requirements" className="text-sm font-medium text-ink-soft">Requirements</label>
                  <textarea
                    id="requirements"
                    name="requirements"
                    rows={6}
                    defaultValue={job?.requirements || ''}
                    className={inputClasses(false, 'resize-y')}
                    placeholder="Skills and experience. Use blank lines between items."
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="applyEmail" label="Apply by email" type="email" defaultValue={job?.applyEmail} error={fieldErrors.applyEmail?.[0]} />
                  <Field name="applyUrl" label="Apply URL" type="url" defaultValue={job?.applyUrl} error={fieldErrors.applyUrl?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Checkbox name="isRemote" label="Remote role" defaultChecked={job?.isRemote || false} />
                  <Checkbox name="isPublished" label="Published" defaultChecked={job?.isPublished || false} />
                  <Field name="displayOrder" label="Display order" type="number" defaultValue={job?.displayOrder ?? 0} error={fieldErrors.displayOrder?.[0]} />
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add role'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Local calendar date as yyyy-mm-dd (UTC's "today" is often yesterday here). */
function localDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const inputClasses = (hasError, extra = '') =>
  cn(
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
    extra,
  );

function Field({ name, label, type = 'text', required, defaultValue, error, hint, min, onChange }) {
  const errorId = `${name}-error`;
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
        min={min}
        onChange={onChange}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className={inputClasses(Boolean(error))}
      />
      {error ? <p id={errorId} className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function Checkbox({ name, label, defaultChecked }) {
  return (
    <label className="flex h-10 items-center gap-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
      />
      <span className="text-sm text-ink-soft">{label}</span>
    </label>
  );
}

export default JobFormDialog;
