'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function BlogFormDialog({ post = null, triggerLabel = 'Add article' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);

  const isEdit = Boolean(post?.id);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      return;
    }

    Promise.all([
      fetch('/api/blog/categories').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
      fetch('/api/blog/tags').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
    ]).then(([cats, tgs]) => {
      setCategories(cats);
      setTags(tgs);
    });
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    const payload = {
      title: formData.get('title'),
      slug: formData.get('slug') || undefined,
      excerpt: formData.get('excerpt') || undefined,
      content: formData.get('content'),
      status: formData.get('status'),
      publishedAt: formData.get('publishedAt') || null,
      metaTitle: formData.get('metaTitle') || undefined,
      metaDescription: formData.get('metaDescription') || undefined,
      categoryIds: formData.getAll('categoryIds').map(Number),
      tagIds: formData.getAll('tagIds').map(Number),
    };

    try {
      const response = await fetch(isEdit ? `/api/blog/${post.id}` : '/api/blog', {
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
            aria-labelledby="blog-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="blog-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${post.title}` : 'Add article'}
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
                  <Field name="title" label="Title" required defaultValue={post?.title} error={fieldErrors.title?.[0]} />
                  <Field name="slug" label="URL slug" defaultValue={post?.slug} hint="Leave blank to generate from title." error={fieldErrors.slug?.[0]} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="excerpt" className="text-sm font-medium text-ink-soft">Excerpt</label>
                  <textarea id="excerpt" name="excerpt" rows={2} defaultValue={post?.excerpt || ''} maxLength={500} className={inputClasses(false, 'resize-y')} placeholder="A short summary used on listing pages and in search results." />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="content" className="text-sm font-medium text-ink-soft">
                    Content <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="content"
                    name="content"
                    rows={12}
                    required
                    defaultValue={post?.content || ''}
                    className={inputClasses(Boolean(fieldErrors.content), 'resize-y font-mono text-[0.8125rem]')}
                    placeholder="Write the article here. Use blank lines between paragraphs."
                  />
                  {fieldErrors.content ? <p className="text-sm text-danger">{fieldErrors.content[0]}</p> : null}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="status" className="text-sm font-medium text-ink-soft">Status</label>
                    <select id="status" name="status" defaultValue={post?.status || 'draft'} className={inputClasses()}>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                  <Field name="publishedAt" label="Publish date" type="date" defaultValue={post?.publishedAt ? String(post.publishedAt).slice(0, 10) : ''} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <fieldset className="rounded-md border border-line p-4">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Categories</legend>
                    <div className="flex flex-col gap-2">
                      {categories.length ? (
                        categories.map((cat) => (
                          <label key={cat.id} className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              name="categoryIds"
                              value={cat.id}
                              defaultChecked={post?.categories?.some((c) => c.id === cat.id) || false}
                              className="size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
                            />
                            <span className="text-sm text-ink-soft">{cat.name}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-xs text-ink-subtle">No categories yet. Add one below.</p>
                      )}
                    </div>
                  </fieldset>

                  <fieldset className="rounded-md border border-line p-4">
                    <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Tags</legend>
                    <div className="flex flex-col gap-2">
                      {tags.length ? (
                        tags.map((tag) => (
                          <label key={tag.id} className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              name="tagIds"
                              value={tag.id}
                              defaultChecked={post?.tags?.some((t) => t.id === tag.id) || false}
                              className="size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
                            />
                            <span className="text-sm text-ink-soft">{tag.name}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-xs text-ink-subtle">No tags yet.</p>
                      )}
                    </div>
                  </fieldset>
                </div>

                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Search engine listing</legend>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="metaTitle" className="text-sm font-medium text-ink-soft">Page title override</label>
                    <input id="metaTitle" name="metaTitle" defaultValue={post?.metaTitle || ''} className={inputClasses()} />
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="metaDescription" className="text-sm font-medium text-ink-soft">Meta description override</label>
                    <textarea id="metaDescription" name="metaDescription" rows={2} defaultValue={post?.metaDescription || ''} maxLength={400} className={inputClasses(false, 'resize-y')} />
                  </div>
                </fieldset>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add article'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ name, label, type = 'text', required, defaultValue, error, hint }) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue ?? ''} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} className={inputClasses(Boolean(error))} />
      {error ? <p id={errorId} className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
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

export default BlogFormDialog;