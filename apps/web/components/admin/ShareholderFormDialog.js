'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SHAREHOLDER_STATUS, SHARE_CLASS } from '@virallink/shared/enums';

export function ShareholderFormDialog({ shareholder = null, triggerLabel = 'Add shareholder' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(shareholder?.id);

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
      shareClass: formData.get('shareClass'),
      shareCount: Number(formData.get('shareCount') || 0),
      ownershipPercentage: Number(formData.get('ownershipPercentage') || 0),
      joinedAt: formData.get('joinedAt') || null,
      status: formData.get('status'),
      notes: formData.get('notes') || undefined,
    };

    try {
      const response = await fetch(isEdit ? `/api/shareholders/${shareholder.id}` : '/api/shareholders', {
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
            aria-labelledby="shareholder-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="shareholder-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${shareholder.name}` : 'Add shareholder'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-5 px-6 py-5">
                {error ? (
                  <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <label htmlFor="name" className="text-sm font-medium text-ink-soft">
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    defaultValue={shareholder?.name || ''}
                    className={inputClasses(Boolean(fieldErrors.name))}
                  />
                  {fieldErrors.name ? <p className="text-sm text-danger">{fieldErrors.name[0]}</p> : null}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="shareClass" className="text-sm font-medium text-ink-soft">Share class</label>
                    <select
                      id="shareClass"
                      name="shareClass"
                      defaultValue={shareholder?.shareClass || 'ordinary'}
                      className={inputClasses()}
                    >
                      {Object.values(SHARE_CLASS).map((cls) => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="status" className="text-sm font-medium text-ink-soft">Status</label>
                    <select
                      id="status"
                      name="status"
                      defaultValue={shareholder?.status || 'active'}
                      className={inputClasses()}
                    >
                      {Object.values(SHAREHOLDER_STATUS).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="shareCount" className="text-sm font-medium text-ink-soft">Number of shares</label>
                    <input
                      id="shareCount"
                      name="shareCount"
                      type="number"
                      min="0"
                      defaultValue={shareholder?.shareCount ?? 0}
                      className={inputClasses(Boolean(fieldErrors.shareCount))}
                    />
                    {fieldErrors.shareCount ? <p className="text-sm text-danger">{fieldErrors.shareCount[0]}</p> : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="ownershipPercentage" className="text-sm font-medium text-ink-soft">
                      Ownership percentage
                    </label>
                    <input
                      id="ownershipPercentage"
                      name="ownershipPercentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={shareholder?.ownershipPercentage ?? 0}
                      className={inputClasses(Boolean(fieldErrors.ownershipPercentage))}
                    />
                    {fieldErrors.ownershipPercentage ? (
                      <p className="text-sm text-danger">{fieldErrors.ownershipPercentage[0]}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="joinedAt" className="text-sm font-medium text-ink-soft">Joined date</label>
                  <input
                    id="joinedAt"
                    name="joinedAt"
                    type="date"
                    defaultValue={shareholder?.joinedAt ? String(shareholder.joinedAt).slice(0, 10) : ''}
                    className={inputClasses()}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="notes" className="text-sm font-medium text-ink-soft">Notes</label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    defaultValue={shareholder?.notes || ''}
                    className={inputClasses(false, 'resize-y')}
                    placeholder="Private notes about this shareholder."
                  />
                </div>
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
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add shareholder'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

const inputClasses = (hasError = false, extra = '') =>
  cn(
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
    extra,
  );

export default ShareholderFormDialog;