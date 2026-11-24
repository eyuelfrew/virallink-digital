import { requirePermission } from '@/lib/auth';
import { AdminHeader, AdminPanel } from '@/components/admin/AdminUI';
import { adminData } from '../lib/adminData';
import SendNotificationForm from '@/components/admin/SendNotificationForm';

export const metadata = { title: 'Notifications' };

/**
 * Admin-side notification sender.
 *
 * An administrator can send a personal push notification (and a Telegram
 * message, when the recipient has one linked) to any active account. The
 * delivery is queued and drained like the other outboxes, so it survives a
 * recycled process on shared hosting.
 */
export default async function NotificationsPage() {
  await requirePermission('notification.write');

  const usersResult = await adminData('/users?pageSize=100');
  const users = (usersResult.data || [])
    .filter((user) => user.isActive !== false)
    .map((user) => ({
      id: user.id,
      name: user.name,
      handle: user.email || user.username || user.phone || `#${user.id}`,
    }));

  return (
    <>
      <AdminHeader
        title="Notifications"
        description="Send a personal notification to a user. Delivered by push, and by Telegram when the account is linked."
      />

      <AdminPanel title="Send notification" description="Choose a recipient, write a short message, and send.">
        <SendNotificationForm users={users} />
      </AdminPanel>
    </>
  );
}
