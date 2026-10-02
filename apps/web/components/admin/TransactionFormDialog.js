'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TRANSACTION_TYPE, TRANSACTION_STATUS, PAYMENT_METHOD } from '@virallink/shared/enums';

export function TransactionFormDialog({ transaction = null, triggerLabel = 'Add transaction' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);

  const isEdit = Boolean(transaction?.id);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      return;
    }

    Promise.all([
      fetch('/api/finance/categories').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
      fetch('/api/clients').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
    ]).then(([cats, cli]) => {
      setCategories(cats);
      setClients(cli);
    });
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    const payload = {
      type: formData.get('type'),
      amount: formData.get('amount'),
      currency: formData.get('currency') || 'ETB',
      categoryId: formData.get('categoryId') ? Number(formData.get('categoryId')) : null,
      clientId: formData.get('clientId') ? Number(formData.get('clientId')) : null,
      description: formData.get('description'),
      transactionDate: formData.get('transactionDate'),
      paymentMethod: formData.get('paymentMethod') || null,
      reference: formData.get('reference') || null,
      status: formData.get('status'),
      notes: formData.get('notes') || undefined,
    };

    try {
      const response = await fetch(isEdit ? `/api/finance/transactions/${transaction.id}` : '/api/finance/transactions', {
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
            aria-labelledby="transaction-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="transaction-dialog-title" className="text-lg font-semibold">
                {isEdit ? 'Edit transaction' : 'Add transaction'}
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
                  <div className="flex flex-col gap-2">
                    <label htmlFor="type" className="text-sm font-medium text-ink-soft">Type</label>
                    <select id="type" name="type" defaultValue={transaction?.type || 'income'} className={inputClasses()}>
                      {Object.values(TRANSACTION_TYPE).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <Field name="amount" label="Amount" type="number" step="0.01" required defaultValue={transaction?.amount} error={fieldErrors.amount?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="transactionDate" label="Date" type="date" required defaultValue={transaction?.transactionDate ? String(transaction.transactionDate).slice(0, 10) : ''} error={fieldErrors.transactionDate?.[0]} />
                  <Field name="currency" label="Currency" defaultValue={transaction?.currency || 'ETB'} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="categoryId"
                    label="Category"
                    defaultValue={transaction?.categoryId || ''}
                    emptyLabel="No category"
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <SelectField
                    name="clientId"
                    label="Client"
                    defaultValue={transaction?.clientId || ''}
                    emptyLabel="No client"
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" className="text-sm font-medium text-ink-soft">
                    Description <span className="text-danger">*</span>
                  </label>
                  <input
                    id="description"
                    name="description"
                    required
                    defaultValue={transaction?.description || ''}
                    className={inputClasses(Boolean(fieldErrors.description))}
                    placeholder="e.g. Client payment for Q3 retainer"
                  />
                  {fieldErrors.description ? <p className="text-sm text-danger">{fieldErrors.description[0]}</p> : null}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="paymentMethod"
                    label="Payment method"
                    defaultValue={transaction?.paymentMethod || ''}
                    emptyLabel="Not specified"
                    options={Object.values(PAYMENT_METHOD).map((m) => ({ value: m, label: m.replace('_', ' ') }))}
                  />
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={transaction?.status || 'completed'}
                    options={Object.values(TRANSACTION_STATUS).map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                  />
                </div>

                <Field name="reference" label="Reference" defaultValue={transaction?.reference} />

                <div className="flex flex-col gap-2">
                  <label htmlFor="notes" className="text-sm font-medium text-ink-soft">Notes</label>
                  <textarea id="notes" name="notes" rows={2} defaultValue={transaction?.notes || ''} className={inputClasses(false, 'resize-y')} />
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add transaction'}
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
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue ?? ''} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} className={inputClasses(Boolean(error))} />
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

export default TransactionFormDialog;