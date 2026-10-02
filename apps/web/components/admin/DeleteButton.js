'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Delete button with a confirmation dialog.
 *
 * Always behind a confirmation whose prompt names the item being removed.
 * "Are you sure?" tells a user nothing about what they are about to lose.
 *
 * On failure the dialog stays open and shows the API's message, rather than
 * closing as though the delete had worked.
 */
export function DeleteButton({ resource, id, label, itemName = 'record', onDeleted }) {
  const router = useRouter();

  async function handleDelete() {
    const response = await fetch(`/api/${resource}/${id}`, { method: 'DELETE' });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'That could not be deleted.');
    }

    // Refresh so the table reflects the change, or run a caller-supplied action
    // for the cases that need something other than a page reload.
    if (onDeleted) onDeleted();
    else router.refresh();
  }

  return (
    <ConfirmDialog
      title={`Delete this ${itemName}?`}
      description={
        <>
          <strong>{label}</strong> will be removed. It will no longer appear on the website.
          {itemName === 'employee' || itemName === 'client'
            ? ' The record is kept in your history rather than erased entirely.'
            : ''}
        </>
      }
      confirmLabel="Delete"
      onConfirm={handleDelete}
      trigger={
        <span
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Delete {label}</span>
        </span>
      }
    />
  );
}

/**
 * Publish/unpublish toggle.
 *
 * The most-used control on a content site, so it gets a dedicated component that
 * always states what is about to change.
 */
export function PublishToggle({ resource, id, published, itemName = 'item' }) {
  const router = useRouter();

  async function toggle() {
    const response = await fetch(`/api/${resource}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !published }),
    });

    if (response.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        published
          ? 'inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-muted'
          : 'inline-flex h-8 items-center rounded-md bg-brand-500 px-2.5 text-xs font-medium text-white hover:bg-brand-600'
      }
      title={published ? `Remove this ${itemName} from the website` : `Publish this ${itemName}`}
    >
      {published ? 'Published' : 'Publish'}
    </button>
  );
}

export default DeleteButton;