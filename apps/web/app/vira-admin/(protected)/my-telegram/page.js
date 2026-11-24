import { requireSession } from '@/lib/auth';
import { adminData } from '../lib/adminData';
import { AdminHeader } from '@/components/admin/AdminUI';
import { TelegramAutoReplyPanel } from '@/components/admin/TelegramAutoReplyPanel';

export const metadata = { title: 'My Telegram' };

export default async function MyTelegramPage() {
  const session = await requireSession();

  const result = await adminData('/telegram-auto-reply');
  const accounts = result.ok ? result.data || [] : [];
  // The audio a rule replies with is a media file, so uploading one needs the
  // media permission rather than the telegram one.
  const canUploadMedia = Boolean(session.permissions?.includes('media.write'));

  return (
    <>
      <AdminHeader title="My Telegram" description="Sign in with your own Telegram account, then manage auto-reply, menus, rules and conversations in tabs." />
      <TelegramAutoReplyPanel
        mode="self"
        initialAccounts={accounts}
        canUploadMedia={canUploadMedia}
        showAccountPanel
      />
    </>
  );
}
