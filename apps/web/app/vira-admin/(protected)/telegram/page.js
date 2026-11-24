import { requirePermission } from '@/lib/auth';
import { adminData } from '../lib/adminData';
import { AdminHeader } from '@/components/admin/AdminUI';
import { TelegramAutoReplyPanel } from '@/components/admin/TelegramAutoReplyPanel';

export const metadata = { title: 'Telegram auto-reply' };

export default async function TelegramAutoReplyPage() {
  const session = await requirePermission('telegram.read');

  const result = await adminData('/telegram-auto-reply/accounts');
  const accounts = result.ok ? result.data || [] : [];
  const canWriteCatalog = Boolean(session.permissions?.includes('telegram.write'));
  // Uploading an audio file goes through the media library, which is a
  // separate permission from writing telegram rules.
  const canUploadMedia = Boolean(session.permissions?.includes('media.write'));

  return (
    <>
      <AdminHeader title="Telegram auto-reply" description="Connect bots and personal accounts, then configure auto-reply, menus, rules, conversations and catalog in tabs." />
      <TelegramAutoReplyPanel
        mode="admin"
        initialAccounts={accounts}
        canWriteCatalog={canWriteCatalog}
        canUploadMedia={canUploadMedia}
        showAccountPanel
      />
    </>
  );
}
