'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  Loader2,
  MessageSquarePlus,
  Pin,
  PinOff,
  Search,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';
import { ChatAvatar, listTimeLabel } from './chatUi';

/**
 * The Chats page body: searchable conversation cards, plus a composer that
 * starts either a private chat or a group. Creation is a direct API call
 * (`POST /api/v1/chat/conversations`), then we land on the new thread.
 */
export function ChatsList({ conversations, users, myId, session }) {
  const router = useRouter();
  const isSuperAdmin = session?.roles?.includes('SUPER_ADMIN') ?? false;
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('direct');
  const [userQuery, setUserQuery] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [error, setError] = useState(null);

  const people = useMemo(
    () => users.filter((user) => Number(user.id) !== Number(myId)),
    [users, myId],
  );

  const unreadTotal = conversations.reduce(
    (sum, conversation) => sum + (conversation.unreadCount || 0),
    0,
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (unreadOnly && !(conversation.unreadCount > 0)) return false;
      if (!term) return true;
      const name = (
        conversation.isGroup ? conversation.title : conversation.peer?.name
      )?.toLowerCase();
      const preview = (conversation.lastMessage?.text || '').toLowerCase();
      return (name && name.includes(term)) || preview.includes(term);
    });
  }, [conversations, query, unreadOnly]);

  const filteredPeople = useMemo(() => {
    const term = userQuery.trim().toLowerCase();
    if (!term) return people;
    return people.filter((user) =>
      String(user.name || '').toLowerCase().includes(term),
    );
  }, [people, userQuery]);

  function openComposer(nextMode = 'direct') {
    setMode(nextMode);
    setUserQuery('');
    setGroupTitle('');
    setSelectedIds([]);
    setPendingId(null);
    setError(null);
    setOpen(true);
  }

  function closeComposer() {
    if (pendingId !== null || creatingGroup) return;
    setOpen(false);
  }

  async function createChat(body, pendingKey) {
    setPendingId(pendingKey);
    setError(null);
    try {
      const response = await fetch(browserApiUrl('/api/chat/conversations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The chat service did not respond.',
        );
      }
      const id = payload?.data?.conversation?.id;
      setOpen(false);
      router.refresh();
      if (id) router.push(`/vira-admin/chats/${id}`);
    } catch (createError) {
      setError(String(createError?.message || createError));
    } finally {
      setPendingId(null);
      setCreatingGroup(false);
    }
  }

  async function togglePin(conversation) {
    if (pendingId !== null) return;
    const response = await fetch(browserApiUrl(`/api/chat/conversations/${conversation.id}/pin`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !conversation.pinnedAt }),
      credentials: 'include',
    });
    if (response.ok) router.refresh();
  }

  function startDirect(userId) {
    if (pendingId !== null) return;
    createChat({ memberIds: [userId] }, userId);
  }

  function createGroup() {
    if (creatingGroup || pendingId !== null) return;
    const title = groupTitle.trim();
    if (!title) {
      setError('Give the group a name.');
      return;
    }
    if (!selectedIds.length) {
      setError('Pick at least one member.');
      return;
    }
    setCreatingGroup(true);
    createChat({ isGroup: true, title, memberIds: selectedIds }, 'group');
  }

  function toggleMember(userId) {
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Conversations</p>
          <p className="text-xs text-ink-muted">
            {conversations.length}{' '}
            {conversations.length === 1 ? 'conversation' : 'conversations'}
            {unreadTotal > 0 ? ` · ${unreadTotal} unread` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openComposer('group')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
          >
            <Users className="size-3.5" />
            New group
          </button>
          <button
            type="button"
            onClick={() => openComposer('direct')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 px-3.5 text-xs font-semibold text-white shadow-md shadow-brand-900/15 transition hover:brightness-110"
          >
            <MessageSquarePlus className="size-3.5" />
            New chat
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
              unreadOnly
                ? 'border-line bg-surface text-ink-muted hover:border-brand-300'
                : 'border-brand-500 bg-brand-500 text-white',
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
              unreadOnly
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-line bg-surface text-ink-muted hover:border-brand-300',
            )}
          >
            Unread{unreadTotal > 0 ? ` · ${unreadTotal}` : ''}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <MessageSquarePlus className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">
            {query.trim() || unreadOnly
              ? 'Nothing matches'
              : 'No conversations yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">
            {query.trim() || unreadOnly
              ? 'Try a different search or clear the unread filter.'
              : 'Start a private chat or a group — the other person sees it on their phone immediately.'}
          </p>
          {!query.trim() && !unreadOnly ? (
            <button
              type="button"
              onClick={() => openComposer('direct')}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
            >
              <MessageSquarePlus className="size-3.5" />
              Start a chat
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((conversation) => {
            const unread = conversation.unreadCount > 0;
            const last = conversation.lastMessage;
            const preview = (last?.text || '').trim();
            const fromMe = Number(last?.userId) === Number(myId);
            const senderPrefix =
              !fromMe &&
              conversation.isGroup &&
              last?.senderName
                ? `${last.senderName}: `
                : '';
            const label = conversation.isGroup
              ? conversation.title || 'Group'
              : conversation.peer?.name || 'Chat';

            return (
              <li key={conversation.id}>
                <Link
                  href={`/vira-admin/chats/${conversation.id}`}
                  className={cn(
                    'group flex items-center gap-3.5 rounded-2xl border bg-surface px-4 py-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md',
                    unread ? 'border-brand-300' : 'border-line',
                  )}
                >
                  <ChatAvatar
                    name={label}
                    size={48}
                    group={conversation.isGroup}
                  />
                  {isSuperAdmin ? (
                    <button
                      type="button"
                      onClick={() => void togglePin(conversation)}
                      title={conversation.pinnedAt ? 'Unpin' : 'Pin'}
                      aria-label={conversation.pinnedAt ? 'Unpin' : 'Pin'}
                      className={cn(
                        'inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                        conversation.pinnedAt
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line bg-surface text-ink-muted hover:border-brand-300',
                      )}
                    >
                      {conversation.pinnedAt ? (
                        <PinOff className="size-3.5" />
                      ) : (
                        <Pin className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          'truncate text-sm',
                          unread
                            ? 'font-bold text-ink'
                            : 'font-semibold text-ink',
                        )}
                      >
                        {label}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[0.68rem]',
                          unread
                            ? 'font-semibold text-brand-600'
                            : 'text-ink-subtle',
                        )}
                      >
                        {listTimeLabel(conversation.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          'truncate text-xs',
                          unread
                            ? 'font-medium text-ink'
                            : 'text-ink-muted',
                        )}
                      >
                        {preview
                          ? `${fromMe ? 'You: ' : senderPrefix}${preview}`
                          : 'No messages yet'}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {unread ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 px-1.5 text-[0.65rem] font-bold text-white">
                            {conversation.unreadCount > 99
                              ? '99+'
                              : conversation.unreadCount}
                          </span>
                        ) : null}
                        <ArrowUpRight className="size-3.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={closeComposer}
            aria-hidden="true"
          />
          <div className="relative my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <header className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-5 text-white">
              <span className="pointer-events-none absolute -right-6 -top-10 size-28 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold tracking-tight">
                    New conversation
                  </h2>
                  <p className="mt-0.5 text-xs text-white/75">
                    The other person sees it on their phone straight away.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeComposer}
                  className="rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div className="flex gap-1 border-b border-line bg-surface-muted p-2">
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={cn(
                  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
                  mode === 'direct'
                    ? 'bg-surface text-brand-700 shadow-sm'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                <MessageSquarePlus className="size-3.5" />
                Direct chat
              </button>
              <button
                type="button"
                onClick={() => setMode('group')}
                className={cn(
                  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
                  mode === 'group'
                    ? 'bg-surface text-brand-700 shadow-sm'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                <Users className="size-3.5" />
                Group
              </button>
            </div>

            <div className="px-6 py-4">
              {mode === 'group' ? (
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  placeholder="Group name"
                  maxLength={100}
                  className="mb-3 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
                />
              ) : null}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="search"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Search people…"
                  className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="mt-2 max-h-64 overflow-y-auto">
                {filteredPeople.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-muted">
                    No people match that search.
                  </p>
                ) : (
                  filteredPeople.map((user) => {
                    const selected = selectedIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        disabled={pendingId !== null || creatingGroup}
                        onClick={() =>
                          mode === 'group'
                            ? toggleMember(user.id)
                            : startDirect(user.id)
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-60"
                      >
                        <ChatAvatar name={user.name} size={36} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                          {user.name}
                        </span>
                        {mode === 'group' ? (
                          <span
                            className={cn(
                              'flex size-5 items-center justify-center rounded-md border transition-colors',
                              selected
                                ? 'border-brand-500 bg-brand-500 text-white'
                                : 'border-line-strong bg-surface text-transparent',
                            )}
                          >
                            <Check className="size-3" />
                          </span>
                        ) : pendingId === user.id ? (
                          <Loader2 className="size-4 animate-spin text-brand-500" />
                        ) : (
                          <ArrowUpRight className="size-4 text-ink-subtle" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {error ? (
                <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-3.5">
              <p className="text-[0.7rem] text-ink-subtle">
                {mode === 'group'
                  ? `${selectedIds.length} selected`
                  : `${people.length} people available`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeComposer}
                  className="h-9 rounded-full border border-line px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  Cancel
                </button>
                {mode === 'group' ? (
                  <button
                    type="button"
                    onClick={createGroup}
                    disabled={
                      creatingGroup ||
                      !groupTitle.trim() ||
                      selectedIds.length === 0
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 px-4 text-xs font-semibold text-white shadow-md shadow-brand-900/15 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {creatingGroup ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Users className="size-3.5" />
                    )}
                    Create group
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ChatsList;
