'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Route-level error boundary.
 *
 * Next.js requires this to be a Client Component. It catches a failure in the
 * segment it wraps and shows something useful instead of the framework's default
 * screen.
 *
 * The message shown to a visitor is deliberately vague — a stack trace or an
 * internal error string would leak implementation detail. `digest` is safe to show
 * because it correlates with the server log without revealing anything.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    // Recorded on the server too; this surfaces it in the browser console during
    // development and gives a failed page a trace.
    console.error('Page error:', error?.message);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center">
      <div className="container-page">
        <div className="mx-auto max-w-xl text-center">
          <p className="font-mono text-sm font-medium uppercase tracking-wider text-danger">Something went wrong</p>

          <h1 className="mt-4 text-h2">This page could not be loaded</h1>

          <p className="mt-4 text-ink-muted">
            The error has been logged. Try again — if it keeps happening, please get in touch and quote the
            reference below.
          </p>

          {error?.digest ? (
            <p className="mt-5 font-mono text-sm text-ink-subtle">Reference: {error.digest}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>

            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}