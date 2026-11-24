'use client';

import { useRef, useState } from 'react';
import { Music4, Trash2 } from 'lucide-react';
import { browserApiUrl } from '@/lib/config';

/**
 * A single audio file: upload, preview and remove.
 *
 * The file is uploaded straight to the API's `/api/v1/media` endpoint, and the
 * media id is what the surrounding form submits. The API
 * stores the file as it was uploaded and checks its container signature, so a
 * renamed text file is refused rather than stored.
 *
 * Two shapes are supported by Telegram and they look different in the chat:
 * an OGG/Opus file is sent as a voice note (the round bubble), anything else
 * as an audio file with a play button. The hint says which one this is.
 */
export function AudioField({
  label = 'Audio (optional)',
  value = null,
  onChange,
  folder = 'telegram-audio',
  canUpload = true,
  hint = 'Sent right after the reply text when this rule matches.',
}) {
  const inputRef = useRef(null);
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
      const response = await fetch(browserApiUrl('/api/media'), { method: 'POST', body, credentials: 'include' });
      const data = await response.json().catch(() => ({}));

      const stored = data?.data?.stored?.[0];
      const failed = data?.data?.failed?.[0];

      if (!response.ok || !stored) {
        setError(failed?.reason || data.error?.message || 'That audio file could not be uploaded.');
        return;
      }

      onChange({ id: stored.id, url: stored.url, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });
    } catch {
      setError('The upload did not complete. Please try again.');
    } finally {
      setPending(false);
      // Allow re-selecting the same file after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const isVoiceNote = value?.mimeType === 'audio/ogg' || value?.mimeType === 'audio/webm';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-soft">{label}</span>

      <div className="flex items-start gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-line bg-surface-sunken">
          <Music4 className="size-6 text-ink-subtle" aria-hidden="true" />

          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-ink-muted">
              …
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {value?.url ? (
            <audio controls src={value.url} className="h-9 max-w-xs" />
          ) : null}

          {canUpload ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {pending ? 'Uploading…' : value ? 'Replace file' : 'Upload audio'}
              </button>

              {value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
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
            <p className="text-xs text-ink-subtle">You do not have permission to upload files.</p>
          )}

          {canUpload && hint ? <p className="max-w-md text-xs text-ink-subtle">{hint}</p> : null}

          {value?.mimeType ? (
            <p className="text-xs text-ink-subtle">
              {isVoiceNote
                ? 'OGG/Opus — sent as a voice note (the round bubble in the chat).'
                : 'Sent as an audio file with a play button.'}
            </p>
          ) : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/x-wav,audio/webm,audio/flac,.ogg,.oga,.mp3,.m4a,.wav"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

export default AudioField;
