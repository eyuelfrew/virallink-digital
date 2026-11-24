'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  ImagePlus,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { browserApiUrl } from '@/lib/config';
import {
  ChatAvatar,
  clockLabel,
  dayLabel,
  isSameDay,
  parseDate,
} from './chatUi';

/**
 * The chat thread.
 *
 * The browser calls the API directly with the session cookie included. It polls
 * every 2.5s while the tab is visible — the same interval carries the typing
 * signal, so a phone typing over the WebSocket shows up here too. Sending a
 * keystroke posts a throttled typing signal that the API broadcasts to the phone.
 *
 * Own messages can be edited or deleted inline; the API enforces that only the
 * sender may do so.
 */

const POLL_MS = 2500;
const TYPING_THROTTLE_MS = 2500;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const PAGE_SIZE = 50;
const REACTION_PALETTE = ['👍', '❤️', '😂', '😀', '🤣', '🤩', '😍', '🥰', '🙌', '🎉', '🤯', '🙃'];

export function ChatWindow({
  conversation,
  messages: initialMessages,
  session,
  isSuperAdmin = false,
}) {
  const myId = Number(session?.id ?? 0);
  const isGroup = Boolean(conversation?.isGroup);
  const title = isGroup
    ? conversation.title || 'Group'
    : conversation.peer?.name || 'Chat';
  const memberCount = conversation.members?.length ?? 0;

  const [messages, setMessages] = useState(initialMessages);
  const [typingUsers, setTypingUsers] = useState([]);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [reactionMessageId, setReactionMessageId] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [adminDeletingId, setAdminDeletingId] = useState(null);

  const listRef = useRef(null);
  const stickRef = useRef(true);
  const lastTypingAtRef = useRef(0);
  const lastReadRef = useRef(0);
  const imageInputRef = useRef(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const loadMessages = useCallback(async ({ cursor } = {}) => {
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set('cursor', String(cursor));
      const response = await fetch(
        browserApiUrl(`/api/chat/conversations/${conversation.id}/messages?${query.toString()}`),
        { cache: 'no-store', credentials: 'include' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;

      const next = Array.isArray(payload?.data?.messages)
        ? payload.data.messages
        : [];
      if (cursor) {
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          const older = next.filter((message) => !known.has(message.id));
          if (!older.length) return current;
          return [...older, ...current].sort(
            (a, b) => Number(a.id) - Number(b.id),
          );
        });
      } else {
        setMessages((current) => {
          const sameContent = (a, b) =>
            a.id === b.id &&
            a.text === b.text &&
            a.edited === b.edited &&
            a.image?.url === b.image?.url &&
            JSON.stringify(a.readBy || []) === JSON.stringify(b.readBy || []);
          const unchanged =
            current.length === next.length &&
            current.every((message, index) =>
              sameContent(message, next[index]),
            );
          return unchanged ? current : next;
        });
      }
      hasMoreRef.current = next.length === PAGE_SIZE;
      setTypingUsers(
        Array.isArray(payload?.data?.typingUsers)
          ? payload.data.typingUsers
          : [],
      );
    } catch {
      // The next poll retries; do not flash an error for a transient blip.
    }
  }, [conversation.id]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || messages.length === 0)
      return;
    const cursor = messages[0].id;
    loadingMoreRef.current = true;
    try {
      await loadMessages({ cursor });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [loadMessages, messages]);

  function handleScroll(event) {
    const element = event.currentTarget;
    if (element.scrollTop < 140) void loadMore();
  }

  useEffect(() => {
    loadMessages();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadMessages();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadMessages]);

  // Reading the thread advances the unread cursor — including messages that
  // arrive while it is open.
  useEffect(() => {
    const latest = messages[messages.length - 1]?.id ?? 0;
    if (!latest || latest <= lastReadRef.current) return;
    lastReadRef.current = latest;
    fetch(browserApiUrl(`/api/chat/conversations/${conversation.id}/read`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    }).catch(() => {});
  }, [conversation.id, messages]);

  // Stick to the bottom unless the reader has scrolled up.
  useEffect(() => {
    const element = listRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, typingUsers]);

  function handleScroll(event) {
    const element = event.currentTarget;
    stickRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  }

  function handleDraftChange(event) {
    const value = event.target.value;
    setDraft(value);

    const now = Date.now();
    if (
      value.trim() &&
      now - lastTypingAtRef.current > TYPING_THROTTLE_MS
    ) {
      lastTypingAtRef.current = now;
      fetch(browserApiUrl(`/api/chat/conversations/${conversation.id}/typing`), {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  async function togglePin() {
    const response = await fetch(browserApiUrl(`/api/chat/conversations/${conversation.id}/pin`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !conversation.pinnedAt }),
      credentials: 'include',
    });
    if (response.ok) window.location.reload();
  }

  function clearPendingImage() {
    setPendingImage((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(browserApiUrl('/api/chat/uploads'), {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || 'The image could not be uploaded.',
      );
    }
    return payload?.data?.media;
  }

  async function handleToggleReaction(message, emoji) {
    const already = (message.reactions || []).some(
      (reaction) => Number(reaction.userId) === myId && reaction.emoji === emoji,
    );
    try {
      const response = await fetch(
        browserApiUrl(`/api/chat/conversations/${conversation.id}/messages/${message.id}/reactions`),
        {
          method: already ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
          credentials: 'include',
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The reaction could not be saved.',
        );
      }
      await loadMessages();
    } catch (reactionError) {
      setError(String(reactionError?.message || reactionError));
    } finally {
      setReactionMessageId(null);
    }
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !pendingImage) || sending) return;
    setSending(true);
    setError(null);
    let imageMediaId = null;
    try {
      if (pendingImage) {
        const media = await uploadImage(pendingImage.file);
        imageMediaId = Number(media?.id || 0) || null;
        if (!imageMediaId) throw new Error('The image could not be saved.');
      }
      const response = await fetch(browserApiUrl(`/api/chat/conversations/${conversation.id}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(text ? { text } : {}),
          ...(imageMediaId ? { imageMediaId } : {}),
        }),
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The chat service did not respond.',
        );
      }
      const sent = payload?.data?.message;
      if (sent) {
        setMessages((current) =>
          current.some((message) => message.id === sent.id)
            ? current
            : [...current, sent],
        );
      }
      clearPendingImage();
      setDraft('');
      stickRef.current = true;
      await loadMessages();
    } catch (sendError) {
      setError(String(sendError?.message || sendError));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void send();
  }

  function startEdit(message) {
    setEditingId(message.id);
    setEditDraft(message.text || '');
    setError(null);
  }

  async function saveEdit(message) {
    const text = editDraft.trim();
    if (!text || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const response = await fetch(
        browserApiUrl(`/api/chat/conversations/${conversation.id}/messages/${message.id}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          credentials: 'include',
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The message could not be saved.',
        );
      }
      const updated = payload?.data?.message;
      if (updated) {
        setMessages((current) =>
          current.map((row) => (row.id === updated.id ? updated : row)),
        );
      }
      setEditingId(null);
      setEditDraft('');
      await loadMessages();
    } catch (editError) {
      setError(String(editError?.message || editError));
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeMessage(message) {
    if (deletingId) return;
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    setDeletingId(message.id);
    setError(null);
    try {
      const response = await fetch(
        browserApiUrl(`/api/chat/conversations/${conversation.id}/messages/${message.id}`),
        { method: 'DELETE', credentials: 'include' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The message could not be deleted.',
        );
      }
      setMessages((current) =>
        current.filter((row) => row.id !== message.id),
      );
      await loadMessages();
    } catch (deleteError) {
      setError(String(deleteError?.message || deleteError));
    } finally {
      setDeletingId(null);
    }
  }

  async function removeAnyMessage(message) {
    if (adminDeletingId) return;
    if (!window.confirm('Delete this message as admin? This cannot be undone.'))
      return;
    setAdminDeletingId(message.id);
    setError(null);
    try {
      const response = await fetch(
        browserApiUrl(`/api/chat/conversations/${conversation.id}/messages/${message.id}`),
        { method: 'DELETE', credentials: 'include' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || 'The message could not be deleted.',
        );
      }
      setMessages((current) =>
        current.filter((row) => row.id !== message.id),
      );
      await loadMessages();
    } catch (deleteError) {
      setError(String(deleteError?.message || deleteError));
    } finally {
      setAdminDeletingId(null);
    }
  }

  const typingNames = typingUsers
    .filter((user) => Number(user.userId) !== myId)
    .map((user) => String(user.name || 'Someone').trim())
    .filter(Boolean);
  const typingLabel =
    typingNames.length === 0
      ? ''
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : `${typingNames.length} people are typing…`;

  return (
    <div className="flex h-[calc(100vh-10.5rem)] min-h-[540px] flex-col gap-3">
      {/* Conversation header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-5 py-4 text-white shadow-lg shadow-brand-900/10">
        <span className="pointer-events-none absolute -right-8 -top-12 size-36 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-16 right-16 size-32 rounded-full bg-accent-400/15" />
        <div className="relative flex items-center gap-3">
          <ChatAvatar name={title} size={46} group={isGroup} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold tracking-tight">{title}</p>
            <p className="mt-0.5 flex min-h-4 items-center gap-1.5 text-xs text-white/75">
              {typingLabel ? (
                <>
                  <span className="flex items-end gap-0.5" aria-hidden="true">
                    <span className="size-1 animate-bounce rounded-full bg-white/90" />
                    <span className="size-1 animate-bounce rounded-full bg-white/90 [animation-delay:150ms]" />
                    <span className="size-1 animate-bounce rounded-full bg-white/90 [animation-delay:300ms]" />
                  </span>
                  <span className="truncate font-medium text-white">
                    {typingLabel}
                  </span>
                </>
              ) : isGroup ? (
                `${memberCount} members`
              ) : (
                'Private conversation'
              )}
            </p>
          </div>
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => void togglePin()}
              title={conversation.pinnedAt ? 'Unpin' : 'Pin'}
              aria-label={conversation.pinnedAt ? 'Unpin' : 'Pin'}
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                conversation.pinnedAt
                  ? 'border-white/60 bg-white text-brand-700'
                  : 'border-white/15 bg-white/10 text-white hover:border-white/40',
              )}
            >
              {conversation.pinnedAt ? (
                <PinOff className="size-3.5" />
              ) : (
                <Pin className="size-3.5" />
              )}
            </button>
          ) : null}

          <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide sm:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Live
          </span>
        </div>
      </div>

      {/* Messages + composer */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-surface-muted px-3 py-4 sm:px-5"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Send className="size-6" />
              </span>
              <p className="text-sm font-semibold text-ink">
                Start the conversation
              </p>
              <p className="max-w-xs text-xs text-ink-muted">
                Messages here are private to the people in this chat — they
                appear on their phones too.
              </p>
            </div>
          ) : (
            messages.map((message, index) => {
              const mine = Number(message.userId) === myId;
              const previous = messages[index - 1];
              const next = messages[index + 1];
              const created = parseDate(message.createdAt);
              const previousAt = parseDate(previous?.createdAt);
              const nextAt = parseDate(next?.createdAt);

              const newDay = !previous || !isSameDay(created, previousAt);
              const firstOfGroup =
                newDay ||
                !previous ||
                Number(previous.userId) !== Number(message.userId) ||
                (created && previousAt && created - previousAt > GROUP_WINDOW_MS);
              const lastOfGroup =
                !next ||
                Number(next.userId) !== Number(message.userId) ||
                !isSameDay(created, nextAt) ||
                (created && nextAt && nextAt - created > GROUP_WINDOW_MS);

              const senderName = message.senderName || 'Member';
              const isEditing = editingId === message.id;
              const image = message.image ? message.image : null;
              const readers = (message.readBy || [])
                .filter((reader) => Number(reader.userId) !== myId)
                .map((reader) => String(reader.name || reader.userId));
              const seenLabel =
                readers.length === 0
                  ? 'Sent'
                  : isGroup && readers.length < memberCount - 1
                    ? `Seen by ${readers.length}`
                    : 'Seen';
              const reactions = message.reactions || [];
              const hasMyReaction = reactions.some(
                (reaction) =>
                  Number(reaction.userId) === myId && reaction.emoji,
              );

              return (
                <Fragment key={message.id}>
                  {newDay ? (
                    <div className="my-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-line" />
                      <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-subtle">
                        {dayLabel(message.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}

                  {reactionMessageId === message.id ? (
                    <div className="fixed inset-0 z-40 flex items-start justify-center">
                      <button
                        type="button"
                        className="absolute inset-0 bg-ink/10"
                        onClick={() => setReactionMessageId(null)}
                        aria-label="Close reactions"
                      />
                      <div className="relative mt-14 w-[320px] rounded-2xl border border-line bg-surface p-4 shadow-2xl">
                        <p className="text-sm font-bold text-ink">React</p>
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {REACTION_PALETTE.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="flex h-11 items-center justify-center rounded-xl border border-line bg-surface text-2xl hover:border-brand-500 hover:bg-brand-50"
                              onClick={() => handleToggleReaction(message, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="mt-3 w-full text-xs font-semibold text-ink-muted hover:text-ink"
                          onClick={() => setReactionMessageId(null)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {reactions.length > 0 ? (
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-1',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      {reactions.map((reaction) => (
                        <span
                          key={`${reaction.userId}-${reaction.emoji}`}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold',
                            hasMyReaction
                              ? 'border-brand-500/40 bg-brand-500/10 text-brand-700'
                              : 'border-line bg-surface-muted text-ink-muted',
                          )}
                          title={reaction.name || `user ${reaction.userId}`}
                        >
                          <span>{reaction.emoji}</span>
                          <span>{reaction.name || ''}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'flex items-end gap-2',
                      mine ? 'justify-end' : 'justify-start',
                      firstOfGroup ? 'mt-3' : 'mt-0.5',
                    )}
                  >
                    {!mine ? (
                      <span className="w-7 shrink-0">
                        {lastOfGroup ? (
                          <ChatAvatar name={senderName} size={28} />
                        ) : null}
                      </span>
                    ) : null}

                    <div
                      className={cn(
                        'group relative max-w-[82%] cursor-context-menu px-3.5 py-2.5 shadow-sm sm:max-w-[70%]',
                        mine
                          ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand-900/10'
                          : 'rounded-2xl rounded-bl-md border border-line bg-surface text-ink',
                      )}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setReactionMessageId(message.id);
                      }}
                    >
                      {isGroup && !mine && firstOfGroup ? (
                        <p className="mb-1 text-[0.7rem] font-bold text-brand-600">
                          {senderName}
                        </p>
                      ) : null}

                      {image && (
                        <img
                          src={image.url}
                          alt=""
                          className="mt-2 max-h-64 w-full rounded-lg object-cover"
                        />
                      )}

                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editDraft}
                            onChange={(event) =>
                              setEditDraft(event.target.value)
                            }
                            rows={2}
                            autoFocus
                            className="w-full resize-none rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-white/10 px-2 text-[0.7rem] font-semibold text-white hover:bg-white/20"
                            >
                              <X className="size-3" /> Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editDraft.trim() || savingEdit}
                              onClick={() => saveEdit(message)}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-white px-2 text-[0.7rem] font-bold text-brand-700 hover:bg-white/90 disabled:opacity-60"
                            >
                              {savingEdit ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Check className="size-3" />
                              )}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        message.text?.trim() && (
                          <>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {message.text}
                            </p>
                            <MessageUrlCard text={message.text} />
                          </>
                        )
                      )}

                      <div
                        className={cn(
                          'mt-1 flex items-center gap-1.5 text-[0.65rem]',
                          mine ? 'text-white/70' : 'text-ink-subtle',
                        )}
                      >
                        <span>{clockLabel(message.createdAt)}</span>
                        {message.edited ? <span>· edited</span> : null}
                        {mine && !isEditing ? (
                          <span
                            className="ml-1 inline-flex items-center gap-1"
                            title={
                              readers.length
                                ? readers.join(', ')
                                : undefined
                            }
                          >
                            {readers.length ? (
                              <CheckCheck className="size-3" />
                            ) : (
                              <Check className="size-3" />
                            )}
                            <span>{seenLabel}</span>
                          </span>
                        ) : null}
                        {isSuperAdmin ? (
                          <span className="ml-1 inline-flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              disabled={adminDeletingId === message.id}
                              onClick={() => removeAnyMessage(message)}
                              className="rounded p-0.5 hover:bg-white/20 disabled:opacity-50"
                              aria-label="Delete message as admin"
                              title="Delete message as admin"
                            >
                              {adminDeletingId === message.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                            </button>
                          </span>
                        ) : null}

                        {mine && !isEditing ? (
                          <span className="ml-1 inline-flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => startEdit(message)}
                              className="rounded p-0.5 hover:bg-white/20"
                              aria-label="Edit message"
                              title="Edit message"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === message.id}
                              onClick={() => removeMessage(message)}
                              className="rounded p-0.5 hover:bg-white/20 disabled:opacity-50"
                              aria-label="Delete message"
                              title="Delete message"
                            >
                              {deletingId === message.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3" />
                              )}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}

          {typingLabel ? (
            <div className="mt-3 flex items-end gap-2">
              <span className="w-7 shrink-0" />
              <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 shadow-sm">
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="flex items-end gap-1" aria-hidden="true">
                    <span className="size-1.5 animate-bounce rounded-full bg-ink-subtle" />
                    <span className="size-1.5 animate-bounce rounded-full bg-ink-subtle [animation-delay:150ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-ink-subtle [animation-delay:300ms]" />
                  </span>
                  {typingLabel}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="border-t border-danger/20 bg-danger-bg px-4 py-2 text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 border-t border-line bg-surface p-3"
        >
          {pendingImage ? (
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-muted px-3 py-2.5">
              <img
                src={pendingImage.previewUrl}
                alt=""
                className="h-9 w-14 shrink-0 rounded-lg object-cover"
              />
              <span className="text-xs font-semibold text-ink">Photo</span>
              <button
                type="button"
                onClick={clearPendingImage}
                aria-label="Cancel photo"
                title="Cancel photo"
                className="ml-auto rounded p-0.5 text-ink-muted transition hover:text-danger"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => imageInputRef.current?.click()}
              title="Attach a photo"
              aria-label="Attach a photo"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-brand-600 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
            >
              <ImagePlus className="size-5" />
            </button>

            <input
              type="text"
              value={draft}
              onChange={handleDraftChange}
              placeholder="Write a message…"
              aria-label="Message"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface-muted px-4 text-sm text-ink transition-colors placeholder:text-ink-subtle focus:border-brand-500 focus:bg-surface focus:outline-none"
            />

            <button
              type="submit"
              disabled={sending || (!draft.trim() && !pendingImage)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-900/20 transition hover:brightness-110 disabled:opacity-45"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </form>
      </div>
    </div>
  );
}

function MessageUrlCard({ text }) {
  const [preview, setPreview] = useState(null);
  const url = text.trim();

  useEffect(() => {
    if (!/https?:\/\//i.test(url)) {
      setPreview(null);
      return;
    }
    let active = true;
    fetch(
      browserApiUrl(`/api/chat/link-preview?url=${encodeURIComponent(url)}`),
      { cache: 'no-store', credentials: 'include' },
    )
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => active && setPreview(payload?.data?.preview || null))
      .catch(() => active && setPreview(null));
    return () => {
      active = false;
    };
  }, [url]);

  if (!preview) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2 block max-w-full overflow-hidden rounded-xl border border-line bg-surface p-3 hover:border-brand-300"
    >
      <span className="flex items-center gap-2">
        <ImagePlus className="size-4 shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-ink">
            {preview.title || preview.url}
          </span>
          {preview.description ? (
            <span className="mt-0.5 block line-clamp-2 text-[0.68rem] text-ink-muted">
              {preview.description}
            </span>
          ) : null}
          {preview.siteName ? (
            <span className="mt-1 block text-[0.65rem] text-ink-subtle">
              {preview.siteName}
            </span>
          ) : null}
        </span>
      </span>
      {preview.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt=""
          className="mt-2 h-28 w-full rounded-lg object-cover"
        />
      ) : null}
    </a>
  );
}

export default ChatWindow;
