'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS } from '@virallink/shared/enums';

export function ProjectFormDialog({ project = null, triggerLabel = 'Add project' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);

  const isEdit = Boolean(project?.id);

  useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      return;
    }

    Promise.all([
      fetch('/api/services').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
      fetch('/api/clients').then((r) => r.json()).then((d) => d.data || []).catch(() => []),
    ]).then(([svc, cli]) => {
      setServices(svc);
      setClients(cli);
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
      clientId: formData.get('clientId') ? Number(formData.get('clientId')) : null,
      serviceId: formData.get('serviceId') ? Number(formData.get('serviceId')) : null,
      summary: formData.get('summary') || undefined,
      description: formData.get('description') || undefined,
      challenge: formData.get('challenge') || undefined,
      solution: formData.get('solution') || undefined,
      results: formData.get('results') || undefined,
      technologies: (formData.get('technologies') || '').split(',').map((t) => t.trim()).filter(Boolean),
      projectUrl: formData.get('projectUrl') || null,
      status: formData.get('status'),
      isFeatured: formData.get('isFeatured') === 'on',
      isPublished: formData.get('isPublished') === 'on',
      publishedAt: formData.get('publishedAt') || null,
      startedAt: formData.get('startedAt') || null,
      completedAt: formData.get('completedAt') || null,
      deadlineAt: formData.get('deadlineAt') || null,
      displayOrder: Number(formData.get('displayOrder') || 0),
      metaTitle: formData.get('metaTitle') || undefined,
      metaDescription: formData.get('metaDescription') || undefined,
    };

    try {
      const response = await fetch(isEdit ? `/api/portfolio/${project.id}` : '/api/portfolio', {
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
            aria-labelledby="project-dialog-title"
            className="relative my-auto w-full max-w-2xl rounded-lg border border-line bg-surface shadow-xl"
          >
            <header className="border-b border-line px-6 py-4">
              <h2 id="project-dialog-title" className="text-lg font-semibold">
                {isEdit ? `Edit ${project.title}` : 'Add project'}
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
                  <Field name="title" label="Title" required defaultValue={project?.title} error={fieldErrors.title?.[0]} />
                  <Field name="slug" label="URL slug" defaultValue={project?.slug} hint="Leave blank to generate from title." error={fieldErrors.slug?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="clientId"
                    label="Client"
                    defaultValue={project?.clientId || ''}
                    emptyLabel="No client"
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <SelectField
                    name="serviceId"
                    label="Service"
                    defaultValue={project?.serviceId || ''}
                    emptyLabel="No service"
                    options={services.map((s) => ({ value: s.id, label: s.title }))}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="summary" className="text-sm font-medium text-ink-soft">Short summary</label>
                  <textarea id="summary" name="summary" rows={2} defaultValue={project?.summary || ''} maxLength={500} className={inputClasses(false, 'resize-y')} />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="description" label="Description" className="text-sm font-medium text-ink-soft">Description</label>
                  <textarea id="description" name="description" rows={4} defaultValue={project?.description || ''} className={inputClasses(false, 'resize-y')} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="challenge" className="text-sm font-medium text-ink-soft">Challenge</label>
                    <textarea id="challenge" name="challenge" rows={3} defaultValue={project?.challenge || ''} className={inputClasses(false, 'resize-y')} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="solution" className="text-sm font-medium text-ink-soft">Solution</label>
                    <textarea id="solution" name="solution" rows={3} defaultValue={project?.solution || ''} className={inputClasses(false, 'resize-y')} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="results" className="text-sm font-medium text-ink-soft">Results</label>
                  <textarea id="results" name="results" rows={3} defaultValue={project?.results || ''} className={inputClasses(false, 'resize-y')} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="technologies" label="Technologies" defaultValue={project?.technologies?.join(', ') || ''} hint="Comma-separated, e.g. Next.js, MySQL, Tailwind" />
                  <Field name="projectUrl" label="Project URL" type="url" defaultValue={project?.projectUrl} error={fieldErrors.projectUrl?.[0]} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    name="status"
                    label="Status"
                    defaultValue={project?.status || 'in_progress'}
                    options={Object.values(PROJECT_STATUS).map((s) => ({ value: s, label: s.replace('_', ' ') }))}
                  />
                  <Field name="displayOrder" label="Display order" type="number" defaultValue={project?.displayOrder ?? 0} />
                </div>

                <div className="grid gap-5 sm:grid-cols-4">
                  <Field name="startedAt" label="Started" type="date" defaultValue={project?.startedAt ? String(project.startedAt).slice(0, 10) : ''} />
                  <Field name="completedAt" label="Completed" type="date" defaultValue={project?.completedAt ? String(project.completedAt).slice(0, 10) : ''} />
                  <Field name="deadlineAt" label="Deadline" type="date" defaultValue={project?.deadlineAt ? String(project.deadlineAt).slice(0, 10) : ''} />
                  <Field name="publishedAt" label="Published" type="date" defaultValue={project?.publishedAt ? String(project.publishedAt).slice(0, 10) : ''} />
                </div>

                <fieldset className="rounded-md border border-line p-4">
                  <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">Search engine listing</legend>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="metaTitle" className="text-sm font-medium text-ink-soft">Page title override</label>
                    <input id="metaTitle" name="metaTitle" defaultValue={project?.metaTitle || ''} className={inputClasses()} />
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <label htmlFor="metaDescription" className="text-sm font-medium text-ink-soft">Meta description override</label>
                    <textarea id="metaDescription" name="metaDescription" rows={2} defaultValue={project?.metaDescription || ''} maxLength={400} className={inputClasses(false, 'resize-y')} />
                  </div>
                </fieldset>

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" name="isPublished" defaultChecked={project?.isPublished || false} className="size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500" />
                    <span className="text-sm font-medium text-ink-soft">Published</span>
                  </label>
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" name="isFeatured" defaultChecked={project?.isFeatured || false} className="size-4 rounded border-line-strong text-brand-500 focus:ring-brand-500" />
                    <span className="text-sm font-medium text-ink-soft">Featured</span>
                  </label>
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                  {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add project'}
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

function SelectField({ name, label, options, defaultValue, emptyLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">{label}</label>
      <select id={name} name={name} defaultValue={defaultValue ?? ''} className={inputClasses()}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
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

export default ProjectFormDialog;