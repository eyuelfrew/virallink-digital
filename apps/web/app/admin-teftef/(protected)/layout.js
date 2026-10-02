import { redirect } from 'next/navigation';
import { ADMIN_PATH } from '@/lib/config';
import { requireSession } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * Protected admin layout.
 *
 * Requires a session before rendering anything. Combined with proxy.js (which
 * redirects requests with no cookie at all) and the API's own authorisation, a
 * forged cookie gets this far and then nothing: every data call below fails with a
 * 401.
 *
 * This layout deliberately does NOT include the public header, footer or nav. The
 * admin is a separate surface, and inheriting public chrome would risk an admin
 * URL ending up in a public navigation.
 */
export async function generateMetadata() {
  return {
    title: { default: 'Management console', template: '%s — Virallink admin' },
    // Layer 2 of the noindex strategy, applied to every admin page.
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noarchive: true },
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ProtectedLayout({ children }) {
  const session = await requireSession();

  // Defensive: a session object without a name means something went wrong
  // upstream, and rendering a shell with no user would be confusing.
  if (!session?.email) redirect(`${ADMIN_PATH}/login`);

  return <AdminShell session={session}>{children}</AdminShell>;
}