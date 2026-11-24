import { redirect } from 'next/navigation';
import { ADMIN_PATH } from '@/lib/config';
import { getSession } from '@/lib/auth';
import ForgotPasswordForm from './ForgotPasswordForm';
import { BrandMark } from '@/components/brand/BrandLogo';

/**
 * Password recovery.
 *
 * A public page by necessity — it has to be reachable by somebody who cannot
 * sign in. Like the login page it is excluded from the middleware's session gate,
 * and it carries the same three layers of noindex: the page metadata, the
 * robots.txt rule, and the X-Robots-Tag header.
 *
 * The recovery code is delivered over Telegram, so this only helps people who
 * have linked their account. The page says so plainly rather than leaving
 * somebody to wait for a message that will never arrive.
 */
export const metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ForgotPasswordPage() {
  // Somebody who is already signed in does not need to recover a password.
  // Send them to the page where they can change the one they know.
  const session = await getSession();
  if (session) {
    redirect(`${ADMIN_PATH}/change-password`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-line bg-surface p-8 shadow-sm">
          <div className="text-center">
            <BrandMark className="mx-auto size-12" />
            <h1 className="mt-3 text-h3">Reset your password</h1>
            <p className="mt-2 text-sm text-ink-muted">
              We will send a one-time code to your Telegram chat.
            </p>
          </div>

          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-subtle">
          <a href={`${ADMIN_PATH}/login`} className="transition-colors hover:text-ink">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
