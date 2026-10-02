'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { slugify } from '@virallink/shared/seo';

/**
 * Service create/edit dialog.
 *
 * Includes a live slug preview. The slug is the URL, so it is worth showing what
 * the page address will actually be before saving — an admin who guesses
 * `/services/seo-services` and gets `/services/search-engine-optimisation` would
 * otherwise be surprised.
 *
 * The slug auto-generates from the title until it is edited manually, after which
 * it is left alone. That is the behaviour people expect from a CMS.
 */
export function ServiceFormDialog({ service = null, triggerLabel = 'Add service' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const isEdit = Boolean(service?.id);
  const [title, setTitle] = useState(service?.title || '');
  const [slug, setSlug] = useState(service?.slug || '');
  const [slugTouched, setSlugTouched] = useState(isEdit);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);

  // Only auto-generate while the admin has not typed a slug of their own.
  const effectiveSlug = slugTouched ? slug : slugify(title);

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);

    const faq = [];
    const faqQuestion = formData.get('faqQuestion')?.toString().trim();
    const faqAnswer = formData.get('faqAnswer')?.toString().trim();
    if (faqQuestion && faqAnswer) faq.push({ question: faqQuestion, answer: faqAnswer });

    const payload = {
      title: formData.get('title'),
      slug: effectiveSlug || undefined,
      summary: formData.get('summary') || undefined,
      description: formData.get('description') || undefined,
      icon: formData.get('icon') || undefined,
      displayOrder: Number(formData.get('displayOrder') || 0),
      isPublished: formData.get('isPublished') === 'on',
      metaTitle: formData.get('metaTitle') || undefined,
      metaDescription: formData.get('metaDescription') || undefined,
      faq,
    };

    try {
      const response = await fetch(isEdit ? `/api/services/${service.id}` : '/api/services', {
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
            aria-labelledby="service-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="service-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${service.title}` : 'Add service'}
              </h2>
            </header>

            <form onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
              <div className="flex flex-col gap-5 px-6 py-5">
                {error ? (
                  <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <label htmlFor="title" className="text-sm font-medium text-ink-soft">
                    Title <span className="text-danger">*</span>
                  </label>
                  <input
                    id="title"
                    name="title"
                    required
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      if (!slugTouched) setSlug(slugify(event.target.value));
                    }}
                    className={inputClasses(Boolean(fieldErrors.title))}
                    placeholder="Search Engine Optimization"
                  />
                  {fieldErrors.title ? <p className="text-sm text-danger">{fieldErrors.title[0]}</p> : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="slug" className="text-sm font-medium text-ink-soft">
                    URL slug
                  </label>

                  <div className="flex items-stretch">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-line bg-surface-muted px-3 text-sm text-ink-subtle">
                      /services/
                    </span>
                    <input
                      id="slug"
                      name="slug"
                      value={effectiveSlug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(slugify(event.target.value));
                      }}
                      className={cn(inputClasses(Boolean(fieldErrors.slug)), 'rounded-l-none')}
                    />
                  </div>

                  {fieldErrors.slug ? (
                    <p className="text-sm text-danger">{fieldErrors.slug[0]}</p>
                  ) : (
                    <p className="text-xs text-ink-subtle">
                      This becomes the page address. Leave blank to generate it from the title.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="summary" className="text-sm font-medium text-ink-soft">
                    Short summary
                  </label>
                  <textarea
                    id="summary"
                    name="summary"
                    rows={2}
                    defaultValue={service?.summary || ''}
                    maxLength={500}
                    className={inputClasses(false, 'resize-y')}
                    placeholder="One sentence describing this service. Used on listing pages."
                  />
                  <p className="text-xs text-ink-subtle">Up to 500 characters.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" className="text-sm font-medium text-ink-soft">
                    Full description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={8}
                    defaultValue={service?.description || ''}
                    className={inputClasses(false, 'resize-y')}
                    placeholder="What this service involves, how you work, and what the client gets."
                  />
                  <p className="text-xs text-ink-subtle">
                    Leave a blank line between paragraphs. Headings are recognised automatically.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="icon" className="text-sm font-medium text-ink-soft">
                      Icon name
                    </label>
                    <input
                      id="icon"
                      name="icon"
                      defaultValue={service?.icon || ''}
                      className={inputClasses()}
                      placeholder="Search"
                    />
                    <p className="text-xs text-ink-subtle">
                      A Lucide icon name, e.g. Search, Megaphone, Code.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="displayOrder" className="text-sm font-medium text-ink-soft">
                      Display order
                    </label>
                    <input
                      id="displayOrder"
                      name="displayOrder"
                      type="number"
                      defaultValue={service?.displayOrder ?? 0}
                      className={inputClasses()}
                    />
                    <p className="text-xs text-ink-subtle">Lower numbers appear first.</p>
                  </div>
                </div>

                {/* SEO fields, grouped because they are a different concern from
                    the content itself. */}
                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Search engine listing
                  </legend>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="metaTitle" className="text-sm font-medium text-ink-soft">
                      Page title override
                    </label>
                    <input
                      id="metaTitle"
                      name="metaTitle"
                      defaultValue={service?.metaTitle || ''}
                      className={inputClasses()}
                      placeholder={`Defaults to: ${service?.title || 'the service title'}`}
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="metaDescription" className="text-sm font-medium text-ink-soft">
                      Meta description override
                    </label>
                    <textarea
                      id="metaDescription"
                      name="metaDescription"
                      rows={2}
                      defaultValue={service?.metaDescription || ''}
                      maxLength={400}
                      className={inputClasses(false, 'resize-y')}
                      placeholder="Defaults to the short summary. Aim for 150–160 characters."
                    />
                  </div>
                </fieldset>

                {/* One FAQ slot. Enough for most services, and a second could be
                    added without changing the shape. */}
                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Question (optional)
                  </legend>

                  <p className="mb-4 text-xs text-ink-subtle">
                    A published question appears on this page and in the structured data.
                  </p>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="faqQuestion" className="text-sm font-medium text-ink-soft">
                      Question
                    </label>
                    <input
                      id="faqQuestion"
                      name="faqQuestion"
                      defaultValue={service?.faq?.[0]?.question || ''}
                      className={inputClasses()}
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="faqAnswer" className="text-sm font-medium text-ink-soft">
                      Answer
                    </label>
                    <textarea
                      id="faqAnswer"
                      name="faqAnswer"
                      rows={3}
                      defaultValue={service?.faq?.[0]?.answer || ''}
                      className={inputClasses(false, 'resize-y')}
                    />
                  </div>
                </fieldset>

                <label className="flex items-start gap-3 rounded-md border border-line bg-surface-muted p-4">
                  <input
                    type="checkbox"
                    name="isPublished"
                    defaultChecked={service?.isPublished || false}
                    className="mt-0.5 size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-soft">Publish on the website</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      The service and its page become visible and are added to the sitemap.
                    </span>
                  </span>
                </label>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add service'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

const inputClasses = (hasError = false, extra = '') =>
  cn(
    'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
    extra,
  );

export default ServiceFormDialog;