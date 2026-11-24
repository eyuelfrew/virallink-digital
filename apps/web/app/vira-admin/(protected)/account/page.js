import { requireSession } from '@/lib/auth';
import { ADMIN_PATH } from '@/lib/config';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { TelegramLinkCard } from '@/components/admin/TelegramLinkCard';
import ChangeHandlesForm from '@/components/admin/ChangeHandlesForm';
import { ROLE_LABELS } from '@/shared/permissions';
import Link from 'next/link';

export const metadata = { title: 'Account' };

/**
 * The signed-in person's own account.
 *
 * Guarded by `requireSession` rather than a permission: everything here belongs
 * to the caller, resolved from their session, so there is nothing a permission
 * gate would add. Linking Telegram is the first thing that lives here.
 */
export default async function AccountPage() {
  const session = await requireSession();

  const roleLabels = (session.roles || []).map((key) => ROLE_LABELS[key] || key);

  return (
    <>
      <AdminHeader title="Account" description="Your profile and notification settings." />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Profile">
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-ink-muted">Name</dt>
              <dd className="mt-0.5 font-medium text-ink">{session.name}</dd>
            </div>

            <div>
              <dt className="text-ink-muted">Email</dt>
              <dd className="mt-0.5 break-all font-medium text-ink">{session.email || '—'}</dd>
            </div>

            <div>
              <dt className="text-ink-muted">Username</dt>
              <dd className="mt-0.5 break-all font-medium text-ink">{session.username || '—'}</dd>
            </div>

            <div>
              <dt className="text-ink-muted">Phone</dt>
              <dd className="mt-0.5 break-all font-medium text-ink">{session.phone || '—'}</dd>
            </div>

            <div>
              <dt className="text-ink-muted">Roles</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {roleLabels.length ? roleLabels.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel
          title="Sign-in handles"
          description="The email, username or phone you use to sign in. At least one must remain."
        >
          <ChangeHandlesForm
            initial={{
              email: session.email,
              username: session.username,
              phone: session.phone,
            }}
          />
        </AdminPanel>

        <AdminPanel title="Telegram notifications" description="Get task updates in Telegram.">
          <TelegramLinkCard initial={session.telegram ?? null} />
        </AdminPanel>

        <AdminPanel
          title="Password"
          description="Changing your password signs out every session on your account."
        >
          <Link
            href={`${ADMIN_PATH}/change-password`}
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            Change password
          </Link>

          {session.mustChangePassword ? (
            <p className="mt-3 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
              An administrator set a temporary password on your account. Choose one of your
              own before going any further.
            </p>
          ) : null}
        </AdminPanel>
      </div>
    </>
  );
}
