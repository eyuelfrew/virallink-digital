'use client';

import { useRef, useState } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';

/**
 * A single image field: preview, upload and remove.
 *
 * The chosen file is uploaded immediately to `/api/media` (a dedicated
 * multipart proxy) and the resulting media id is what the surrounding form
 * submits through a hidden input — so the form still works as a plain
 * uncontrolled `<form>` and the upload never has to be repeated at save time.
 *
 * Removing clears the id to an empty string; the dialog turns that into `null`,
 * which the API treats as "unlink". The file itself stays in the Media library,
 * so a person can be unlinked from a photo without the image being destroyed —
 * and without needing `media.delete`, which most roles do not have.
 */
export function PhotoField({
  name = 'photoMediaId',
  label = 'Photo',
  initialMedia = null,
  folder = 'employee',
  canUpload = true,
  hint = 'Shown on the public team page when this person is marked public.',
}) {
  const inputRef = useRef(null);
  const [media, setMedia] = useState(initialMedia ? { id: initialMedia.id, url: initialMedia.url } : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPending(true);
    setError(null);

    const body = new FormData();
    body.append('files', file);
    body.append('folder', folder);

    try {
      const response = await fetch('/api/media', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));

      const stored = data?.data?.stored?.[0];
      const failed = data?.data?.failed?.[0];

      if (!response.ok || !stored) {
        setError(failed?.reason || data.error?.message || 'That image could not be uploaded.');
        return;
      }

      setMedia({ id: stored.id, url: stored.url });
    } catch {
      setError('The upload did not complete. Please try again.');
    } finally {
      setPending(false);
      // Allow re-selecting the same file after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-soft">{label}</span>

      {/* The value the form actually submits. */}
      <input type="hidden" name={name} value={media?.id ?? ''} />

      <div className="flex items-start gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunken">
          {media?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-subtle">
              <ImageIcon className="size-6" aria-hidden="true" />
            </span>
          )}

          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-xs font-medium text-white">
              …
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {canUpload ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {pending ? 'Uploading…' : media ? 'Replace image' : 'Upload image'}
              </button>

              {media ? (
                <button
                  type="button"
                  onClick={() => {
                    setMedia(null);
                    setError(null);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">
              You do not have permission to upload images.
            </p>
          )}

          {canUpload ? hint ? <p className="max-w-sm text-xs text-ink-subtle">{hint}</p> : null : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

export default PhotoField;
