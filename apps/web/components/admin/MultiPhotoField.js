'use client';

import { useRef, useState } from 'react';
import { browserApiUrl } from '@/lib/config';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Trash2 } from 'lucide-react';

/**
 * A controlled multi-image field for Telegram albums.
 *
 * Files upload straight to the API's `/api/v1/media` endpoint and the
 * parent form keeps the ordered `{ id, url }` list in state. Order matters:
 * Telegram shows album photos in the order they are sent, and the caption goes
 * on the first one.
 */
export function MultiPhotoField({
  label = 'Album images',
  value = [],
  onChange,
  folder = 'telegram-album',
  max = 10,
  canUpload = true,
  hint = 'Sent together as one Telegram album. Use the arrows to change the order; the first image carries the caption.',
}) {
  const inputRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, max - value.length));
    if (!files.length) return;

    setPending(true);
    setError(null);

    const body = new FormData();
    for (const file of files) body.append('files', file);
    body.append('folder', folder);

    try {
      const response = await fetch(browserApiUrl('/api/media'), { method: 'POST', body, credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      const stored = data?.data?.stored || [];
      const failed = data?.data?.failed || [];

      if (!response.ok || !stored.length) {
        setError(failed[0]?.reason || data.error?.message || 'Those images could not be uploaded.');
        return;
      }

      onChange([...value, ...stored.map((media) => ({ id: media.id, url: media.url }))].slice(0, max));
      if (failed.length) {
        setError(`${failed.length} image(s) could not be uploaded: ${failed[0]?.reason || 'unknown reason'}`);
      }
    } catch {
      setError('The upload did not complete. Please try again.');
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-soft">
        {label} <span className="text-xs font-normal text-ink-subtle">({value.length}/{max})</span>
      </span>

      {value.length ? (
        <div className="flex flex-wrap gap-3">
          {value.map((media, index) => (
            <div key={media.id} className="flex flex-col gap-1">
              <div className="relative size-20 overflow-hidden rounded-md border border-line bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.url} alt="" className="size-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-ink/60 px-1.5 text-xs font-medium text-white">
                  {index + 1}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  aria-label={`Move image ${index + 1} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded border border-line p-1 text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                >
                  <ArrowLeft className="size-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move image ${index + 1} later`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded border border-line p-1 text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                >
                  <ArrowRight className="size-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => onChange(value.filter((_, position) => position !== index))}
                  className="rounded border border-line p-1 text-danger hover:bg-danger-bg"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex size-20 items-center justify-center rounded-md border border-dashed border-line text-ink-subtle">
          <ImageIcon className="size-6" aria-hidden="true" />
        </div>
      )}

      {canUpload ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending || value.length >= max}
            className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            {pending ? 'Uploading…' : value.length >= max ? 'Album is full' : 'Add images'}
          </button>
          {value.length ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear all
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">You do not have permission to upload images.</p>
      )}

      {hint ? <p className="max-w-md text-xs text-ink-subtle">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        onChange={handleFiles}
        className="hidden"
      />
    </div>
  );
}

export default MultiPhotoField;