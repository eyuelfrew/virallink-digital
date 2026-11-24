import { AdminHeader } from '@/components/admin/AdminUI';
import { requireSession } from '@/lib/auth';
import { adminData } from '../lib/adminData';
import { ChatsList } from '@/components/admin/ChatsList';

export const dynamic = 'force-dynamic';

/**
 * Chats — the staff-side chat surface.
 *
 * The conversations listed are the ones the signed-in admin is a member of.
 * Creating one picks a user from the staff directory and lands on the thread.
 */
export default async function ChatsPage() {
  const session = await requireSession();

  const [conversationsResult, usersResult] = await Promise.all([
    adminData('/chat/conversations'),
    adminData('/chat/users'),
  ]);

  const conversations = conversationsResult.data?.conversations ?? [];
  const users = (usersResult.data?.users ?? []).map((user) => ({
    id: user.id,
    name: user.name,
  }));

  return (
    <>
      <AdminHeader
        title="Chats"
        description="Private conversations and groups between Virallink users. Start one here and it appears on their phone too."
      />
      <ChatsList
        conversations={conversations}
        users={users}
        myId={session.id}
        session={session}
      />
    </>
  );
}
