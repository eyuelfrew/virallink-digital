import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_PATH, INTERNAL_API_URL } from '@/lib/config';
import { getSession } from '@/lib/auth';
import LoginForm from './LoginForm';
import { SetupForm } from '@/components/admin/SetupForm';
import { BrandMark } from '@/components/brand/BrandLogo';

/**
 * Admin login.
 *
 * Three layers of noindex, applied here as well as globally:
 *   1. this page's metadata
 *   2. the robots.txt Disallow rule
 *   3. the X-Robots-Tag header set in next.config.mjs and .htaccess
 *
 * None of them is security. The login page is a legitimate, public URL by
 * necessity — it has to be reachable for anyone to sign in. What protects the data
 * is that every admin API call requires a valid session token.
 */
export const metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false, nocache: true },
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;

  // Already signed in: send them to the dashboard rather than showing the form.
  const session = await getSession();
  if (session) redirect(`${ADMIN_PATH}/dashboard`);

  const store = await cookies();

  // The admin cookie is scoped to the API origin's path, so a cookie set for the
  // site itself is cleared to avoid sending a stale session twice.
  const hasStaleCookie = Boolean(store.get('vl_access'));

  /*
   * A fresh install has a database but no person. This is resolved here, during
   * the server render, so the login form can offer first-run setup instead of
   * rejecting every sign-in with no explanation. The API independently refuses
   * once an account exists — hiding the form is a courtesy, not the guard.
   */
  let needsSetup = false;

  try {
    const response = await fetch(`${INTERNAL_API_URL.replace(/\/+$/, '')}/api/v1/auth/setup-status`, {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    needsSetup = payload?.data?.needsSetup === true;
  } catch {
    // API unreachable. Show the normal login form and let it report the failure,
    // rather than offering to create an administrator.
    needsSetup = false;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-line bg-surface p-8 shadow-sm">
          <div className="text-center">
            <BrandMark className="mx-auto size-12" />
            <h1 className="mt-3 text-h3">{needsSetup ? 'Get started' : 'Management console'}</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {needsSetup
                ? 'Create the first administrator account for this install.'
                : 'Sign in to manage the company platform.'}
            </p>
          </div>

          <div className="mt-8">
            {needsSetup ? (
              <SetupForm />
            ) : (
              <LoginForm
                next={typeof params?.next === 'string' ? params.next : ''}
                hasStaleCookie={hasStaleCookie}
              />
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-subtle">
          {needsSetup
            ? 'This form disappears once the first account exists.'
            : 'Authorised personnel only. All sign-in attempts are recorded.'}
        </p>
      </div>
    </main>
  );
}