'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * Contact form.
 *
 * A Client Component, because it needs interaction state: field-level errors,
 * a pending state, and a success message.
 *
 * Behaviour worth noting:
 *  - `noValidate` disables the browser's own validation bubbles, so errors are
 *    shown in the site's style and are announced to assistive technology. The
 *    server validates independently regardless.
 *  - Each field's error is wired with aria-describedby and aria-invalid, so a
 *    screen reader reads the reason, not just "invalid".
 *  - The honeypot field is visually hidden but present. A human never sees it;
 *    most bots fill every input they find.
 *  - A timeout is recorded so the server can tell an implausibly fast submission
 *    from a human one.
 */
export function ContactForm({ services = [] }) {
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const formRef = useRef(null);
  const loadedAt = useRef(Date.now());

  // Re-derive the timestamp when the form is shown again after a success, so a
  // second submission is not flagged as impossibly fast.
  useEffect(() => {
    if (status === 'success') loadedAt.current = Date.now();
  }, [status]);

  async function handleSubmit(event) {
    event.preventDefault();

    setStatus('submitting');
    setErrors({});
    setMessage('');

    const formData = new FormData(event.currentTarget);

    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone') || undefined,
      company: formData.get('company') || undefined,
      subject: formData.get('subject') || undefined,
      serviceId: formData.get('serviceId') ? Number(formData.get('serviceId')) : null,
      message: formData.get('message'),
      // Honeypot: filled by bots, ignored by the server logic.
      website: honeypot,
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Form-Loaded-At': String(loadedAt.current),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Field errors are keyed by field name and map straight onto the inputs.
        setErrors(data.details || {});
        setMessage(data.error || 'Your message could not be sent. Please try again.');
        setStatus('error');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'Thank you. We will be in touch.');
      formRef.current?.reset();
      setHoneypot('');
    } catch {
      setStatus('error');
      setMessage('We could not reach our messaging service. Please try again, or email us directly.');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-lg border border-success/30 bg-success-bg p-8"
      >
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />

        <h2 className="mt-4 text-h3">Message sent</h2>
        <p className="mt-2 text-ink-soft">{message}</p>

        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 text-sm font-semibold text-brand-600 underline-offset-4 hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Global error, announced once the form fails. */}
      {status === 'error' && message ? (
        <div
          role="alert"
          className="flex gap-3 rounded-md border border-danger/30 bg-danger-bg p-4 text-sm text-danger"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="name"
          label="Your name"
          required
          error={errors.name?.[0]}
          autoComplete="name"
        />
        <Field
          name="email"
          label="Email address"
          type="email"
          required
          error={errors.email?.[0]}
          autoComplete="email"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="phone" label="Phone (optional)" type="tel" error={errors.phone?.[0]} autoComplete="tel" />
        <Field name="company" label="Company (optional)" error={errors.company?.[0]} autoComplete="organization" />
      </div>

      {services.length ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="serviceId" className="text-sm font-medium text-ink-soft">
            What can we help with?{' '}
            <span className="font-normal text-ink-subtle">(optional)</span>
          </label>

          <select
            id="serviceId"
            name="serviceId"
            defaultValue=""
            className={inputClasses(false)}
          >
            <option value="">Not sure yet</option>
            {services.map((service) => (
              <option key={service.slug} value={service.id || ''}>
                {service.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Field name="subject" label="Subject (optional)" error={errors.subject?.[0]} />

      <div className="flex flex-col gap-2">
        <label htmlFor="message" className="text-sm font-medium text-ink-soft">
          Your message <span className="text-danger">*</span>
        </label>

        <textarea
          id="message"
          name="message"
          rows={6}
          required
          minLength={20}
          aria-invalid={errors.message ? 'true' : undefined}
          aria-describedby={errors.message ? 'message-error' : 'message-hint'}
          className={inputClasses(Boolean(errors.message), 'resize-y')}
          placeholder="A few lines about your project, your goals and any deadlines you are working to."
        />

        {errors.message ? (
          <p id="message-error" className="text-sm text-danger">
            {errors.message[0]}
          </p>
        ) : (
          <p id="message-hint" className="text-sm text-ink-subtle">
            Please include a little about what you are trying to achieve.
          </p>
        )}
      </div>

      {/*
        Honeypot. Positioned off-screen rather than display:none, because some
        bots skip hidden inputs entirely.
      */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={status === 'submitting'}
          className={cn(
            'inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand-500 px-6',
            'text-base font-semibold text-white transition-colors hover:bg-brand-600',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          {status === 'submitting' ? (
            <>
              <Spinner />
              Sending
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              Send message
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-ink-subtle">
        We use your details only to reply to this enquiry. See our{' '}
        <a href="/privacy" className="underline underline-offset-2 hover:text-brand-600">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}

/** Labelled input wired for accessibility. */
function Field({ name, label, type = 'text', required, error, autoComplete, placeholder }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-soft">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : hintId}
        className={inputClasses(Boolean(error))}
      />

      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <span id={hintId} className="sr-only">
          {required ? 'Required' : 'Optional'}
        </span>
      )}
    </div>
  );
}

const inputClasses = (hasError, extra = '') =>
  cn(
    'h-11 w-full rounded-md border bg-surface px-3 text-sm text-ink',
    'transition-colors placeholder:text-ink-subtle',
    // Focus ring comes from the global :focus-visible rule; this only sets colour.
    'focus:border-brand-500 focus:outline-none',
    hasError ? 'border-danger' : 'border-line',
    extra,
  );

/** Inline spinner. CSS animation, no library. */
function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default ContactForm;