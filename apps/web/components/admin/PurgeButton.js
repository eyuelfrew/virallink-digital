'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiUrl } from '@/lib/config';

/**
 * Remove the stored files nothing points at any more.
 *
 * Deleting a record removes the images it owned, but this sweeps up what was
 * left behind before that existed — uploads whose record is gone. It asks for
 * confirmation because it touches many files at once.
 */
export function PurgeButton({ canDelete = false }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!window.confirm('Delete every stored file that nothing uses? This cannot be undone.')) return;

    setPending(true);

    try {
      await fetch(browserApiUrl('/api/media/purge-unused'), { method: 'POST', credentials: 'include' });
      router.refresh();
    } catch {
      // The grid refreshes regardless; the user sees whatever survived.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || !canDelete}
      title={canDelete ? 'Delete files nothing uses' : 'You do not have permission to delete files'}
      className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-60"
    >
      {pending ? 'Removing…' : 'Remove unused files'}
    </button>
  );
}

export default PurgeButton;
