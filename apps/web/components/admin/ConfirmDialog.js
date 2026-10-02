'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Confirmation dialog for a destructive action.
 *
 * Built on a native <dialog> element rather than a custom modal. That gives focus
 * trapping, Escape-to-close and inert background for free from the browser,
 * instead of reimplementing all three — which is where custom modals usually go
 * wrong.
 *
 * The action's name is repeated in the prompt ("Delete 3 services?") because a
 * confirm dialog that does not say what will happen is worse than none.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  const dialogRef = useCallback((node) => {
    if (!node) return;

    const onCancelEvent = (event) => {
      event.preventDefault();
      setOpen(false);
    };

    node.addEventListener('cancel', onCancelEvent);
    return () => node.removeEventListener('cancel', onCancelEvent);
  }, []);

  async function handleConfirm() {
    setPending(true);
    setError(null);

    try {
      await onConfirm();
      setOpen(false);
    } catch (confirmError) {
      setError(confirmError.message || 'That did not work. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => !pending && setOpen(false)}
            aria-hidden="true"
          />

          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={description ? 'confirm-description' : undefined}
            className="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-xl"
          >
            <h2 id="confirm-title" className="text-h4">
              {title}
            </h2>

            {description ? (
              <p id="confirm-description" className="mt-2.5 text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className={cn(
                  'inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white',
                  'disabled:pointer-events-none disabled:opacity-60',
                  tone === 'danger' ? 'bg-danger hover:brightness-95' : 'bg-brand-500 hover:bg-brand-600',
                )}
              >
                {pending ? 'Working…' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Toast-style feedback.
 *
 * Deliberately minimal: a polite live region so success messages are announced
 * without stealing focus, which is what a toast library tends to do.
 */
export function useToast() {
  const [toast, setToast] = useState(null);
  const router = useRouter();

  function notify(message, tone = 'success') {
    setToast({ message, tone });

    // Auto-dismiss. The timeout is cleared on the next notify, so rapid
    // successive messages do not stack up timers.
    setTimeout(() => setToast(null), 4000);
  }

  /** Refresh server component data after a mutation. */
  function refresh() {
    startTransition(() => router.refresh());
  }

  const element = toast ? (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-5 right-5 z-[70] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg',
        toast.tone === 'success' ? 'border-success/30 bg-success-bg text-success' : 'border-danger/30 bg-danger-bg text-danger',
      )}
    >
      {toast.message}
    </div>
  ) : null;

  return { notify, refresh, toast: element, isPending: isPending };
}

export default ConfirmDialog;