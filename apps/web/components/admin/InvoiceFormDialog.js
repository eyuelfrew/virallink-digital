'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { INVOICE_STATUS } from '@virallink/shared/enums';

export function InvoiceFormDialog({ invoice = null, triggerLabel = 'Add invoice' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([{ description: '', quantity: 1, unitPrice: '' }]);

  const isEdit = Boolean(invoice?.id);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      setItems([{ description: '', quantity: 1, unitPrice: '' }]);
      return;
    }

    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => setClients(d.data || []))
      .catch(() => {});

    if (invoice?.items?.length) {
      setItems(invoice.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: item.unitPrice,
      })));
    }
  }, [open, invoice]);

  function updateItem(index, field, value) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: '' }]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    const payload = {
      clientId: Number(formData.get('clientId')),
      invoiceNumber: formData.get('invoiceNumber'),
      issueDate: formData.get('issueDate'),
      dueDate: formData.get('dueDate') || null,
      currency: formData.get('currency') || 'ETB',
      taxRate: Number(formData.get('taxRate') || 0),
      status: formData.get('status'),
      notes: formData.get('notes') || undefined,
      items: items
        .filter((item) => item.description && item.unitPrice)
        .map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice,
        })),
    };

    if (!payload.items.length) {
      setError('Add at least one line item.');
      setPending(false);
      return;
    }

    try {
      const response = await fetch(isEdit ? `/api/finance/invoices/${invoice.id}` : '/api/finance/invoices', {
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
            aria-labelledby="invoice-dialog-title"
            className="relative my-auto w-full max-w-3xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="invoice-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${invoice.invoiceNumber}` : 'Add invoice'}
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
                    <label htmlFor="clientId" className="text-sm font-medium text-ink-soft">Client</label>
                    <select id="clientId" name="clientId" required defaultValue={invoice?.clientId || ''} className={inputClasses()}>
                      <option value="">Select a client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <Field name="invoiceNumber" label="Invoice number" required defaultValue={invoice?.invoiceNumber} error={fieldErrors.invoiceNumber?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Field name="issueDate" label="Issue date" type="date" required defaultValue={invoice?.issueDate ? String(invoice.issueDate).slice(0, 10) : ''} />
                  <Field name="dueDate" label="Due date" type="date" defaultValue={invoice?.dueDate ? String(invoice.dueDate).slice(0, 10) : ''} />
                  <Field name="currency" label="Currency" defaultValue={invoice?.currency || 'ETB'} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={invoice?.status || 'draft'}
                    options={Object.values(INVOICE_STATUS).map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                  />
                  <Field name="taxRate" label="Tax rate (%)" type="number" min="0" max="100" step="0.01" defaultValue={invoice?.taxRate ?? 0} />
                </div>

                {/* Line items */}
                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Line items</legend>

                  <div className="flex flex-col gap-3">
                    {items.map((item, index) => (
                      <div key={index} className="grid gap-3 sm:grid-cols-[1fr_5rem_6rem_2rem]">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          placeholder="Description"
                          className={inputClasses()}
                        />
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className={inputClasses()}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                          placeholder="Price"
                          className={inputClasses()}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          className="flex h-10 items-center justify-center rounded-md border border-line text-ink-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                          aria-label="Remove line item"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addItem}
                    className="mt-3 inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted"
                  >
                    + Add line item
                  </button>
                </fieldset>

                <div className="flex flex-col gap-2">
                  <label htmlFor="notes" className="text-sm font-medium text-ink-soft">Notes</label>
                  <textarea id="notes" name="notes" rows={2} defaultValue={invoice?.notes || ''} className={inputClasses(false, 'resize-y')} />
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add invoice'}
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

function SelectField({ name, label, options, defaultValue }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">{label}</label>
      <select id={name} name={name} defaultValue={defaultValue ?? ''} className={inputClasses()}>
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

export default InvoiceFormDialog;