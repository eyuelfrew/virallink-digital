import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { adminData } from '../../lib/adminData';
import { ChatWindow } from '@/components/admin/ChatWindow';

export const dynamic = 'force-dynamic';

/**
 * One chat thread. Server renders the initial messages; the client
 * (ChatWindow) polls, sends, types and edits directly against the API.
 */
export default async function ChatsThreadPage({ params }) {
  const session = await requireSession();
  const { id } = await params;

  const conversationResult = await adminData(`/chat/conversations/${id}`);
  const conversation = conversationResult.data?.conversation;

  if (!conversationResult.ok || !conversation) {
    notFound();
  }

  const messagesResult = await adminData(`/chat/conversations/${id}/messages`);
  const messages = messagesResult.data?.messages ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/vira-admin/chats"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <ArrowLeft className="size-3.5" />
          All chats
        </Link>
        <p className="text-[0.7rem] text-ink-subtle">
          Messages sync to the mobile app
        </p>
      </div>

      <ChatWindow
        conversation={conversation}
        messages={messages}
        session={session}
        isSuperAdmin={session.roles?.includes('SUPER_ADMIN') ?? false}
      />
    </div>
  );
}
