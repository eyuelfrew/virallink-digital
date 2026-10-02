'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CLIENT_STATUS, CLIENT_SOURCE } from '@virallink/shared/enums';

export function ClientFormDialog({ client = null, triggerLabel = 'Add client' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(client?.id);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    const payload = {
      name: formData.get('name'),
      contactPerson: formData.get('contactPerson') || undefined,
      email: formData.get('email') || null,
      phone: formData.get('phone') || null,
      website: formData.get('website') || null,
      industry: formData.get('industry') || undefined,
      addressLine1: formData.get('addressLine1') || undefined,
      city: formData.get('city') || undefined,
      country: formData.get('country') || undefined,
      status: formData.get('status'),
      source: formData.get('source') || null,
      notes: formData.get('notes') || undefined,
      isPublic: formData.get('isPublic') === 'on',
      contractValue: formData.get('contractValue') || undefined,
    };

    try {
      const response = await fetch(isEdit ? `/api/clients/${client.id}` : '/api/clients', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            aria-labelledby="client-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="client-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${client.name}` : 'Add client'}
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
                  <Field name="name" label="Client name" required defaultValue={client?.name} error={fieldErrors.name?.[0]} />
                  <Field name="contactPerson" label="Contact person" defaultValue={client?.contactPerson} error={fieldErrors.contactPerson?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="email" label="Email" type="email" defaultValue={client?.email} error={fieldErrors.email?.[0]} />
                  <Field name="phone" label="Phone" type="tel" defaultValue={client?.phone} error={fieldErrors.phone?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="website" label="Website" type="url" defaultValue={client?.website} error={fieldErrors.website?.[0]} />
                  <Field name="industry" label="Industry" defaultValue={client?.industry} error={fieldErrors.industry?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="addressLine1" label="Address" defaultValue={client?.addressLine1} />
                  <Field name="city" label="City" defaultValue={client?.city} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={client?.status || 'prospect'}
                    options={Object.values(CLIENT_STATUS).map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                  />
                  <SelectField
                    name="source"
                    label="Source"
                    defaultValue={client?.source || ''}
                    emptyLabel="Unknown"
                    options={Object.values(CLIENT_SOURCE).map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="contractValue" label="Contract value" type="number" step="0.01" defaultValue={client?.contractValue} error={fieldErrors.contractValue?.[0]} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="notes" className="text-sm font-medium text-ink-soft">
                    Internal notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    defaultValue={client?.notes || ''}
                    className={inputClasses(false, 'resize-y')}
                    placeholder="Private notes about this client. Never published."
                  />
                </div>

                <label className="flex items-start gap-3 rounded-md border border-line bg-surface-muted p-4">
                  <input
                    type="checkbox"
                    name="isPublic"
                    defaultChecked={client?.isPublic || false}
                    className="mt-0.5 size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-soft">Show on the public website</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      The client name and logo appear on the /clients page. Contact details never do.
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
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add client'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ name, label, type = 'text', required, defaultValue, error }) {
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
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className={inputClasses(Boolean(error))}
      />
      {error ? <p id={errorId} className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function SelectField({ name, label, options, defaultValue, emptyLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">{label}</label>
      <select id={name} name={name} defaultValue={defaultValue ?? ''} className={inputClasses()}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
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

export default ClientFormDialog;