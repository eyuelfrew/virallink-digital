'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PROPOSAL_STATUS_LABELS } from '@virallink/shared/enums';

export function ProposalFormDialog({ proposal = null, clients = [], triggerLabel = 'New proposal' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = Boolean(proposal?.id);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    const payload = {
      title: form.get('title'),
      summary: form.get('summary') || null,
      scope: form.get('scope') || null,
      status: form.get('status'),
      value: form.get('value') || null,
      proposedStart: form.get('proposedStart') || null,
    };

    // The client is deliberately fixed after creation: moving a proposal to a
    // different client changes who it was pitched to, which is a different record.
    if (!isEdit) payload.clientId = Number(form.get('clientId'));

    try {
      const response = await fetch(isEdit ? `/api/proposals/${proposal.id}` : '/api/proposals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error?.message || 'That proposal could not be saved.');
        setPending(false);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError('The management service did not respond.');
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
            aria-labelledby="proposal-dialog-title"
            className="relative my-auto w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="proposal-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${proposal.title}` : 'New proposal'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-4 px-6 py-5">
                {error ? (
                  <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                {!isEdit ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pf-client" className="text-sm font-medium text-ink-soft">Client</label>
                    <select id="pf-client" name="clientId" required defaultValue={clients[0]?.id || ''}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pf-title" className="text-sm font-medium text-ink-soft">Title</label>
                  <input id="pf-title" name="title" required defaultValue={proposal?.title || ''}
                    placeholder="Q4 content package"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pf-scope" className="text-sm font-medium text-ink-soft">What is being proposed</label>
                  <input id="pf-scope" name="scope" defaultValue={proposal?.scope || ''}
                    placeholder="8 videos, 16 stories, monthly report"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pf-summary" className="text-sm font-medium text-ink-soft">Summary</label>
                  <textarea id="pf-summary" name="summary" rows={3} defaultValue={proposal?.summary || ''}
                    className="rounded-md border border-line bg-surface p-3 text-sm" />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pf-status" className="text-sm font-medium text-ink-soft">Status</label>
                    <select id="pf-status" name="status" defaultValue={proposal?.status || 'draft'}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
                      {Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pf-value" className="text-sm font-medium text-ink-soft">Value (ETB)</label>
                    <input id="pf-value" name="value" inputMode="decimal" defaultValue={proposal?.value || ''}
                      placeholder="45000"
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="pf-start" className="text-sm font-medium text-ink-soft">Proposed start</label>
                    <input id="pf-start" name="proposedStart" type="date" defaultValue={(proposal?.proposedStart || '').slice(0, 10)}
                      className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
                  </div>
                </div>

                <p className="text-xs text-ink-subtle">
                  Marking it accepted or declined records the date automatically, so you can see how
                  long clients take to answer.
                </p>
              </div>

              <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)}
                  className="h-9 rounded-md border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted">
                  Cancel
                </button>
                <button type="submit" disabled={pending}
                  className="h-9 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create proposal'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ProposalFormDialog;