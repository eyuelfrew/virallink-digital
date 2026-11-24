import { redirect } from 'next/navigation';
import { ADMIN_PATH } from '@/lib/config';
import { requireSession } from '@/lib/auth';
import ChangePasswordForm from './ChangePasswordForm';
import { BrandMark } from '@/components/brand/BrandLogo';

/**
 * Change your own password.
 *
 * Deliberately outside the `(protected)` route group. The protected layout
 * redirects anybody whose password was set by an administrator straight here,
 * so if this page were inside that group it would redirect to itself.
 *
 * It still needs a session — `requireSession` sends anybody without one to the
 * sign-in form — but it carries none of the console's chrome. This is a
 * focused page somebody may only ever see once.
 */
export const metadata = {
  title: 'Change your password',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ChangePasswordPage() {
  const session = await requireSession();

  // Not signed in: requireSession has already redirected.
  if (!session) redirect(`${ADMIN_PATH}/login`);

  const forced = session.mustChangePassword === true;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-line bg-surface p-8 shadow-sm">
          <div className="text-center">
            <BrandMark className="mx-auto size-12" />
            <h1 className="mt-3 text-h3">
              {forced ? 'Choose your password' : 'Change your password'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {forced
                ? 'Set a password only you know, then sign in again.'
                : 'Changing your password signs out every session on your account.'}
            </p>
          </div>

          <div className="mt-8">
            <ChangePasswordForm forced={forced} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-subtle">
          <a href={`${ADMIN_PATH}/account`} className="transition-colors hover:text-ink">
            Back to your account
          </a>
        </p>
      </div>
    </main>
  );
}
