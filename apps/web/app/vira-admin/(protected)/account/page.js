import { requireSession } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { TelegramLinkCard } from '@/components/admin/TelegramLinkCard';
import { ROLE_LABELS } from '@/shared/permissions';

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
              <dd className="mt-0.5 break-all font-medium text-ink">{session.email}</dd>
            </div>

            <div>
              <dt className="text-ink-muted">Roles</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {roleLabels.length ? roleLabels.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel title="Telegram notifications" description="Get task updates in Telegram.">
          <TelegramLinkCard initial={session.telegram ?? null} />
        </AdminPanel>
      </div>
    </>
  );
}
