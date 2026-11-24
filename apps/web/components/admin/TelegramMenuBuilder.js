'use client';

import { useCallback, useEffect, useState } from 'react';
import { MultiPhotoField } from '@/components/admin/MultiPhotoField';
import { browserApiUrl } from '@/lib/config';

const ACTION_LABELS = {
  catalog: 'Send the catalog',
  text: 'Send a text reply',
  album: 'Send an image album',
  url: 'Open a link',
  submenu: 'Open a submenu',
  menu: 'Return to main menu',
};

function defaultButtonForm() {
  return {
    label: '',
    action: 'text',
    parentId: '',
    replyText: '',
    url: '',
    images: [],
    displayOrder: 0,
    isActive: true,
  };
}

/**
 * Per-account interactive menu editor.
 *
 * Buttons are flat rows with an optional parent; a parent must itself use the
 * "Open a submenu" action. The preview shows the main menu exactly as Telegram
 * will render it (two buttons per row).
 */
export function TelegramMenuBuilder({ accountId, menuTitle = '' }) {
  const [buttons, setButtons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultButtonForm());

  const load = useCallback(async () => {
    if (!accountId) {
      setButtons([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${accountId}/menu-buttons`), { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load menu buttons.');
      setButtons(payload.data || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load menu buttons.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setEditingId(null);
    setForm(defaultButtonForm());
    setError(null);
    setNotice(null);
    load();
  }, [load]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!accountId) return;
    setPending(true);
    setError(null);
    setNotice(null);

    const payload = {
      label: form.label.trim(),
      action: form.action,
      parentId: form.parentId ? Number(form.parentId) : null,
      replyText: form.replyText.trim() || null,
      url: form.url.trim() || null,
      imageMediaIds: form.images.map((image) => image.id),
      displayOrder: Number(form.displayOrder) || 0,
      isActive: form.isActive,
    };

    try {
      const url = browserApiUrl(editingId
        ? `/api/telegram-auto-reply/${accountId}/menu-buttons/${editingId}`
        : `/api/telegram-auto-reply/${accountId}/menu-buttons`);
      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Could not save menu button.');
      setNotice(editingId ? 'Menu button updated.' : 'Menu button created.');
      setEditingId(null);
      setForm(defaultButtonForm());
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Could not save menu button.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(buttonId) {
    if (!window.confirm('Delete this menu button? Buttons inside its submenu are deleted too.')) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${accountId}/menu-buttons/${buttonId}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not delete menu button.');
      setNotice('Menu button deleted.');
      if (editingId === buttonId) {
        setEditingId(null);
        setForm(defaultButtonForm());
      }
      await load();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete menu button.');
    } finally {
      setPending(false);
    }
  }

  function startEdit(button) {
    setEditingId(button.id);
    setForm({
      label: button.label || '',
      action: button.action || 'text',
      parentId: button.parentId ? String(button.parentId) : '',
      replyText: button.replyText || '',
      url: button.url || '',
      images: button.images || [],
      displayOrder: button.displayOrder ?? 0,
      isActive: button.isActive ?? true,
    });
  }

  const submenuOptions = buttons.filter((button) => button.action === 'submenu' && button.id !== editingId);
  const parentLabel = (parentId) => buttons.find((button) => button.id === parentId)?.label || '—';
  const topLevel = buttons.filter((button) => !button.parentId && button.isActive);

  return (
    <div className="flex flex-col gap-6">
      {error ? <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-md bg-success-bg p-3 text-sm text-success">{notice}</p> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border border-line p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Button label</span>
            <input
              required
              maxLength={64}
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="e.g. Our services"
              className="h-10 rounded-md border border-line px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">When tapped</span>
            <select
              value={form.action}
              onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Inside submenu</span>
            <select
              value={form.parentId}
              onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
            >
              <option value="">Main menu (top level)</option>
              {submenuOptions.map((button) => (
                <option key={button.id} value={button.id}>
                  {button.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Display order</span>
            <input
              type="number"
              min="0"
              max="100000"
              value={form.displayOrder}
              onChange={(event) => setForm((current) => ({ ...current, displayOrder: Number(event.target.value) }))}
              className="h-10 rounded-md border border-line px-3 text-sm"
            />
          </label>
        </div>

        {form.action === 'text' || form.action === 'submenu' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {form.action === 'submenu' ? 'Submenu title (optional)' : 'Reply message'}
            </span>
            <textarea
              value={form.replyText}
              onChange={(event) => setForm((current) => ({ ...current, replyText: event.target.value }))}
              rows={3}
              placeholder={
                form.action === 'submenu'
                  ? 'Shown above the submenu buttons; defaults to the button label'
                  : 'What should be sent when this button is tapped?'
              }
              className="rounded-md border border-line p-3 text-sm"
            />
          </label>
        ) : null}

        {form.action === 'url' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Link URL</span>
            <input
              type="url"
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.com"
              className="h-10 rounded-md border border-line px-3 text-sm"
            />
          </label>
        ) : null}

        {form.action === 'album' ? (
          <div className="flex flex-col gap-4">
            <MultiPhotoField
              label="Album images"
              value={form.images}
              onChange={(images) => setForm((current) => ({ ...current, images }))}
              folder="telegram-menu"
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Caption (optional)</span>
              <textarea
                value={form.replyText}
                onChange={(event) => setForm((current) => ({ ...current, replyText: event.target.value }))}
                rows={2}
                placeholder="Shown on the first image of the album"
                className="rounded-md border border-line p-3 text-sm"
              />
            </label>
          </div>
        ) : null}

        {form.action === 'submenu' ? (
          <p className="text-xs text-ink-subtle">
            After saving, add more buttons and pick this button under “Inside submenu” to fill the submenu.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !form.label.trim()}
            className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {editingId ? 'Update button' : 'Add button'}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditingId(null);
                setForm(defaultButtonForm());
              }}
              className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>
      </form>

      {topLevel.length ? (
        <div className="rounded-md border border-line bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Main menu preview</p>
          <p className="mt-2 text-sm text-ink">{menuTitle.trim() || 'What would you like to do?'}</p>
          <div className="mt-3 grid max-w-sm grid-cols-2 gap-2">
            {topLevel.map((button) => (
              <span
                key={button.id}
                className="rounded-md border border-line bg-surface px-3 py-2 text-center text-sm font-medium text-brand-700"
              >
                {button.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-ink-muted">Loading menu buttons…</p> : null}

      {buttons.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-subtle">
                <th className="px-3 py-2">Button</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Inside</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {buttons.map((button) => (
                <tr key={button.id} className="border-b border-line align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink">{button.label}</div>
                    <div className="text-xs text-ink-muted">
                      {button.action === 'album' && button.imageMediaIds?.length
                        ? `${button.imageMediaIds.length} image(s)`
                        : button.replyText || button.url || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3">{ACTION_LABELS[button.action] || button.action}</td>
                  <td className="px-3 py-3 text-xs text-ink-muted">
                    {button.parentId ? parentLabel(button.parentId) : 'Main menu'}
                  </td>
                  <td className="px-3 py-3">{button.displayOrder}</td>
                  <td className="px-3 py-3">{button.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(button)}
                        className="rounded-md border border-line px-3 py-1.5 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDelete(button.id)}
                        className="rounded-md border border-line px-3 py-1.5 text-xs text-danger disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          No menu buttons yet. Add buttons here, then enable the menu in the settings above. Chats can also open
          it anytime with /menu.
        </p>
      )}
    </div>
  );
}

export default TelegramMenuBuilder;