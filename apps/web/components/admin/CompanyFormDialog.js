'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function CompanyFormDialog({ company = null, triggerLabel = 'Edit profile' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

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
      legalName: formData.get('legalName') || undefined,
      shortDescription: formData.get('shortDescription') || undefined,
      description: formData.get('description') || undefined,
      mission: formData.get('mission') || undefined,
      vision: formData.get('vision') || undefined,
      values: formData.get('values') || undefined,
      foundedDate: formData.get('foundedDate') || null,
      registrationNumber: formData.get('registrationNumber') || undefined,
      taxIdentifier: formData.get('taxIdentifier') || undefined,
      addressLine1: formData.get('addressLine1') || undefined,
      addressLine2: formData.get('addressLine2') || undefined,
      city: formData.get('city') || undefined,
      region: formData.get('region') || undefined,
      country: formData.get('country') || undefined,
      postalCode: formData.get('postalCode') || undefined,
      phone: formData.get('phone') || null,
      secondaryPhone: formData.get('secondaryPhone') || null,
      email: formData.get('email') || null,
      website: formData.get('website') || null,
      openingHours: formData.get('openingHours') || undefined,
      metaTitle: formData.get('metaTitle') || undefined,
      metaDescription: formData.get('metaDescription') || undefined,
    };

    try {
      const response = await fetch('/api/company', {
        method: 'PUT',
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
          'border border-line text-ink-soft hover:bg-surface-muted',
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
            aria-labelledby="company-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="company-dialog-title" className="text-lg font-semibold">Edit company profile</h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-5 px-6 py-5">
                {error ? (
                  <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="name" label="Name" required defaultValue={company?.name} error={fieldErrors.name?.[0]} />
                  <Field name="legalName" label="Legal name" defaultValue={company?.legalName} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="shortDescription" className="text-sm font-medium text-ink-soft">Short description</label>
                  <textarea id="shortDescription" name="shortDescription" rows={2} defaultValue={company?.shortDescription || ''} maxLength={500} className={inputClasses(false, 'resize-y')} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" className="text-sm font-medium text-ink-soft">Full description</label>
                  <textarea id="description" name="description" rows={4} defaultValue={company?.description || ''} className={inputClasses(false, 'resize-y')} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="mission" className="text-sm font-medium text-ink-soft">Mission</label>
                    <textarea id="mission" name="mission" rows={2} defaultValue={company?.mission || ''} className={inputClasses(false, 'resize-y')} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="vision" className="text-sm font-medium text-ink-soft">Vision</label>
                    <textarea id="vision" name="vision" rows={2} defaultValue={company?.vision || ''} className={inputClasses(false, 'resize-y')} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="values" className="text-sm font-medium text-ink-soft">Values</label>
                  <textarea id="values" name="values" rows={3} defaultValue={company?.values || ''} className={inputClasses(false, 'resize-y')} placeholder="One value per line." />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="foundedDate" label="Founded" type="date" defaultValue={company?.foundedDate ? String(company.foundedDate).slice(0, 10) : ''} />
                  <Field name="registrationNumber" label="Registration number" defaultValue={company?.registrationNumber} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="phone" label="Phone" defaultValue={company?.phone} />
                  <Field name="email" label="Email" type="email" defaultValue={company?.email} error={fieldErrors.email?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="website" label="Website" type="url" defaultValue={company?.website} />
                  <Field name="city" label="City" defaultValue={company?.city} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="country" label="Country" defaultValue={company?.country} />
                  <Field name="addressLine1" label="Address" defaultValue={company?.addressLine1} />
                </div>

                <Field name="openingHours" label="Opening hours" defaultValue={company?.openingHours} hint='e.g. "Mon-Fri 09:00-17:00"' />

                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">SEO defaults</legend>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="metaTitle" className="text-sm font-medium text-ink-soft">Default meta title</label>
                    <input id="metaTitle" name="metaTitle" defaultValue={company?.metaTitle || ''} className={inputClasses()} />
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="metaDescription" className="text-sm font-medium text-ink-soft">Default meta description</label>
                    <textarea id="metaDescription" name="metaDescription" rows={2} defaultValue={company?.metaDescription || ''} maxLength={400} className={inputClasses(false, 'resize-y')} />
                  </div>
                </fieldset>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : 'Save changes'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ name, label, type = 'text', required, defaultValue, error, hint }) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue ?? ''} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} className={inputClasses(Boolean(error))} />
      {error ? <p id={errorId} className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
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

export default CompanyFormDialog;