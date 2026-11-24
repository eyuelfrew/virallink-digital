import { Op } from 'sequelize';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { toPublicMedia } from '../serializers/public.js';
import { deleteUnreferencedMedia } from './media.service.js';
import { enqueuePush } from './push.service.js';
import { isOnline } from './chat.presence.service.js';

const { User, Conversation, ConversationMember, Message, Media, MessageReaction } = models;

/*
 * User chat — private 1:1 conversations and multi-person groups.
 *
 * Message history, reply threads, edit-own-message and delete-own-message.
 * The WebSocket layer (services/chat.ws.service.js) subscribes to the events
 * this module emits and pushes them to the other members of the conversation.
 *
 * Ids travel as Numbers (BigInt values never reach JSON; every public
 * serializer converts them).
 */

/** The most others a group may have, beyond the creator. */
const MAX_GROUP_MEMBERS = 50;
/** The most messages one listMessages call returns. */
const MAX_MESSAGE_PAGE = 200;
const DEFAULT_MESSAGE_PAGE = 50;
/**
 * How long a "typing" signal stays live. Clients send at most one every few
 * seconds; if the signal is not refreshed it expires on its own, so a closed
 * tab or a dropped connection never leaves someone "typing" forever.
 */
const TYPING_TTL_MS = 6000;

/**
 * In-memory typing registry: conversationId -> Map<userId, { name, expiresAt }>.
 * Deliberately not persisted: typing is presence, not history, and it must not
 * outlive the process.
 */
const typingState = new Map();

/* -------------------------------------------------------------------------- */
/* Events (consumed by the WebSocket layer)                                    */
/* -------------------------------------------------------------------------- */

const listeners = new Set();

/** Subscribe to chat events. Used by the WebSocket layer. */
export function onChatEvent(listener) {
  listeners.add(listener);
}

async function emitChatEvent(event) {
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (error) {
      logger.error({ err: error.message }, 'chat event listener failed');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Serializers                                                                 */
/* -------------------------------------------------------------------------- */

function toPublicMessage(message) {
  return {
    id: Number(message.id),
    conversationId: Number(message.conversationId),
    userId: Number(message.userId),
    senderName: message.sender ? message.sender.name : null,
    text: message.text ?? null,
    image: message.image
      ? { id: Number(message.image.id), ...toPublicMedia(message.image) }
      : null,
    replyToId: message.replyToId ? Number(message.replyToId) : null,
    edited: message.editedAt ? new Date(message.editedAt).toISOString() : null,
    createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
    reactions: (message.reactions || [])
      .filter((reaction) => reaction.emoji)
      .map((reaction) => ({
        emoji: reaction.emoji,
        userId: Number(reaction.userId),
        name: reaction.user?.name ?? null,
        createdAt: reaction.createdAt ? new Date(reaction.createdAt).toISOString() : null,
      })),
  };
}

function toPublicConversation(conversation, { viewerId, names = new Map(), unreadCount = 0, lastMessage = null }) {
  const members = (conversation.members || [])
    .map((member) => ({
      userId: Number(member.userId),
      name: names.get(Number(member.userId)) ?? null,
      lastReadMessageId: Number(member.lastReadMessageId) || null,
    }))
    .sort((a, b) => a.userId - b.userId);
  const peer = members.find((member) => member.userId !== viewerId) ?? members[0];
  return {
    id: Number(conversation.id),
    isGroup: conversation.isGroup === true,
    title: conversation.isGroup ? conversation.title : null,
    lastMessageAt: conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : null,
    members,
    peer,
    unreadCount,
    lastMessage,
    pinnedAt: conversation.pinnedAt ? new Date(conversation.pinnedAt).toISOString() : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

async function assertMembership(userId, conversationId) {
  const member = await ConversationMember.findOne({
    where: { conversationId, userId },
    attributes: ['id'],
  });
  if (!member) throw AppError.notFound('Conversation not found');
}

async function loadConversationWithMembers(conversationId) {
  return Conversation.findByPk(conversationId, {
    include: [{ model: ConversationMember, as: 'members', required: true }],
  });
}

async function loadUserNames(conversations) {
  const ids = new Set();
  for (const conversation of conversations) {
    for (const member of conversation.members || []) ids.add(Number(member.userId));
  }
  if (!ids.size) return new Map();
  const users = await User.findAll({
    where: { id: { [Op.in]: [...ids] } },
    attributes: ['id', 'name'],
  });
  return new Map(users.map((user) => [Number(user.id), user.name]));
}

async function assertActiveUsers(userIds) {
  const uniqueIds = [...new Set(userIds)];
  const users = await User.findAll({
    where: { id: { [Op.in]: uniqueIds } },
    attributes: ['id', 'isActive'],
  });
  const byId = new Map(users.map((user) => [Number(user.id), user]));
  for (const id of uniqueIds) {
    const user = byId.get(Number(id));
    if (!user) throw AppError.notFound('One of the members does not exist');
    if (user.isActive !== true) throw AppError.badRequest('One of the members is not active');
  }
}

async function addMembers(conversationId, userIds) {
  for (const userId of userIds) {
    await ConversationMember.create({ conversationId, userId });
  }
}

async function newestMessageId(conversationId) {
  const latest = await Message.findOne({
    where: { conversationId },
    attributes: ['id'],
    order: [['id', 'DESC']],
  });
  return latest ? Number(latest.id) : null;
}

/**
 * Attach who has consumed each message.
 *
 * Read cursors are per member, so the receipt is derived by comparing the
 * member's `last_read_message_id` cursor to the message id. The cursor only
 * ever moves forward, so a `>=` comparison means "seen" for this thread.
 */
async function attachReadReceipts(messages) {
  if (!messages.length) return [];
  const conversationId = Number(messages[0].conversationId);
  const members = await ConversationMember.findAll({
    where: { conversationId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
  });
  const readers = members
    .map((member) => ({
      userId: Number(member.userId),
      name: member.user?.name ?? null,
      lastReadMessageId: Number(member.lastReadMessageId) || 0,
    }))
    .sort((a, b) => a.userId - b.userId);

  return messages.map((message) => {
    const id = Number(message.id);
    return {
      ...toPublicMessage(message),
      readBy: readers.filter((reader) => reader.lastReadMessageId >= id).map(({ userId, name }) => ({ userId, name })),
    };
  });
}

async function loadPublicMessage(messageId) {
  const message = await Message.findByPk(messageId, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'name'] },
      { model: Media, as: 'image' },
      {
        model: MessageReaction,
        as: 'reactions',
        required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
    ],
  });
  if (!message) return null;
  const [publicMessage] = await attachReadReceipts([message]);
  return publicMessage;
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * People the signed-in user can start a chat with.
 *
 * Chat is open to every authenticated account, so this deliberately does not
 * go through the admin `/users` endpoint (which requires `user.read`). Only an
 * id and a display name are exposed — nothing else from the account.
 */
export async function listChatUsers(viewerId) {
  const users = await User.findAll({
    where: { isActive: true, id: { [Op.ne]: Number(viewerId) } },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
    limit: 500,
  });
  return users.map((user) => ({ id: Number(user.id), name: user.name }));
}

/* -------------------------------------------------------------------------- */
/* Conversations                                                               */
/* -------------------------------------------------------------------------- */

export async function listConversations(userId) {
  const memberRows = await ConversationMember.findAll({
    where: { userId },
    attributes: ['conversationId'],
  });
  const conversationIds = memberRows.map((row) => Number(row.conversationId));
  if (!conversationIds.length) return [];

  const conversations = await Conversation.findAll({
    where: { id: { [Op.in]: conversationIds } },
    include: [{ model: ConversationMember, as: 'members', required: true }],
    order: [['lastMessageAt', 'DESC'], ['id', 'DESC']],
  });
  const names = await loadUserNames(conversations);

  const result = [];
  for (const conversation of conversations) {
    const publicConversation = toPublicConversation(conversation, {
      viewerId: Number(userId),
      names,
    });
    publicConversation.unreadCount = await unreadCountFor(userId, Number(conversation.id));
    const lastMessage = await Message.findOne({
      where: { conversationId: Number(conversation.id) },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name'] },
        { model: Media, as: 'image' },
        {
          model: MessageReaction,
          as: 'reactions',
          required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        },
      ],
      order: [['id', 'DESC']],
      attributes: ['id', 'conversationId', 'userId', 'text', 'replyToId', 'imageMediaId', 'editedAt'],
    });
    publicConversation.lastMessage = lastMessage ? toPublicMessage(lastMessage) : null;
    result.push(publicConversation);
  }
  return result;
}

export async function getConversation(userId, id) {
  await assertMembership(userId, id);
  const conversation = await loadConversationWithMembers(id);
  const names = await loadUserNames([conversation]);
  return toPublicConversation(conversation, {
    viewerId: Number(userId),
    names,
    unreadCount: await unreadCountFor(userId, id),
  });
}

/* -------------------------------------------------------------------------- */
/* Super-admin conversation control                                            */
/* -------------------------------------------------------------------------- */

/**
 * Delete a conversation and its thread. Super admin only.
 *
 * This is a hard delete: the conversation row, members and messages go away.
 * Image files that only those messages referenced are cleaned up so the
 * storage driver does not keep orphans.
 */
export async function deleteConversation(userId, id) {
  await assertMembership(userId, id);
  const messages = await Message.findAll({
    where: { conversationId: id },
    attributes: ['id', 'imageMediaId'],
  });
  const imageMediaIds = messages
    .map((message) => (message.imageMediaId ? Number(message.imageMediaId) : null))
    .filter((id) => id !== null);

  await Conversation.destroy({ where: { id }, force: true });
  if (imageMediaIds.length) {
    await deleteUnreferencedMedia(imageMediaIds).catch((error) =>
      logger.warn({ err: error.message, imageMediaIds }, 'failed to clean up chat conversation images'),
    );
  }
  return { id: Number(id) };
}

/**
 * Delete every message in a conversation. Super admin only.
 *
 * Images referenced only by those messages are cleaned up. Returns how many
 * rows were removed.
 */
export async function deleteConversationMessages(userId, conversationId) {
  await assertMembership(userId, conversationId);
  const messages = await Message.findAll({
    where: { conversationId },
    attributes: ['id', 'imageMediaId'],
  });
  const imageMediaIds = messages
    .map((message) => (message.imageMediaId ? Number(message.imageMediaId) : null))
    .filter((id) => id !== null);

  await Message.destroy({ where: { conversationId }, force: true });
  if (imageMediaIds.length) {
    await deleteUnreferencedMedia(imageMediaIds).catch((error) =>
      logger.warn({ err: error.message, imageMediaIds }, 'failed to clean up chat images'),
    );
  }
  return { conversationId: Number(conversationId), deleted: messages.length };
}

/** Messages the member has not yet read (cursor-based). */
export async function unreadCountFor(userId, conversationId) {
  const member = await ConversationMember.findOne({
    where: { conversationId, userId },
    attributes: ['lastReadMessageId'],
  });
  if (!member) return 0;
  const readThrough = member.lastReadMessageId ? Number(member.lastReadMessageId) : 0;
  return Message.count({
    where: {
      conversationId,
      userId: { [Op.ne]: Number(userId) },
      id: { [Op.gt]: readThrough },
    },
  });
}

export async function createConversation(userId, { isGroup = false, title = null, memberIds = [] } = {}) {
  if (isGroup) return createGroupConversation(userId, { title, memberIds });
  return createPrivateConversation(userId, memberIds);
}

async function createGroupConversation(userId, { title, memberIds }) {
  const trimmedTitle = String(title ?? '').trim();
  if (!trimmedTitle) throw AppError.badRequest('A group needs a name');
  if (trimmedTitle.length > 191) throw AppError.badRequest('A group name is too long');

  const others = [...new Set((memberIds || []).map(Number))].filter((id) => Number.isFinite(id));
  if (others.isEmpty) throw AppError.badRequest('Pick at least one member');
  const everyone = [...new Set([userId, ...others])];
  if (everyone.length - 1 > MAX_GROUP_MEMBERS) {
    throw AppError.badRequest('A group can hold up to 50 people');
  }
  await assertActiveUsers(everyone);

  const conversation = await Conversation.create({
    isGroup: true,
    title: trimmedTitle.slice(0, 191),
    creatorId: userId,
  });
  await addMembers(conversation.id, everyone);

  const publicConversation = await getConversation(userId, conversation.id);
  await emitChatEvent({ type: 'conversation.created', conversation: publicConversation });
  return publicConversation;
}

async function createPrivateConversation(userId, memberIds) {
  const uniqueIds = [...new Set((memberIds || []).map(Number))].filter((id) => Number.isFinite(id));
  if (uniqueIds.length !== 1 || uniqueIds[0] === userId) {
    throw AppError.badRequest('A private chat needs exactly one other person');
  }
  await assertActiveUsers(uniqueIds);

  // Two people, one private chat — creating a second one would splinter the
  // thread. Handing back the existing conversation beats duplicating rows.
  const existing = await findExistingPrivateConversation(userId, uniqueIds[0]);
  if (existing) return existing;

  const conversation = await Conversation.create({ isGroup: false, creatorId: userId });
  await addMembers(conversation.id, [userId, uniqueIds[0]]);
  return getConversation(userId, conversation.id);
}

async function findExistingPrivateConversation(userId, peerId) {
  const memberRows = await ConversationMember.findAll({
    where: { userId },
    attributes: ['conversationId'],
  });
  const conversationIds = memberRows.map((row) => Number(row.conversationId));
  if (!conversationIds.length) return null;

  const peerRows = await ConversationMember.findAll({
    where: { conversationId: { [Op.in]: conversationIds }, userId: peerId },
    attributes: ['conversationId'],
  });
  if (!peerRows.length) return null;

  const conversations = await Conversation.findAll({
    where: { id: { [Op.in]: conversationIds }, isGroup: false },
  });
  const peerSet = new Set(peerRows.map((row) => Number(row.conversationId)));
  const conversation = conversations.find((c) => peerSet.has(Number(c.id)));
  return conversation ? getConversation(userId, Number(conversation.id)) : null;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export async function listMessages(userId, conversationId, { cursor, limit = DEFAULT_MESSAGE_PAGE } = {}) {
  await assertMembership(userId, conversationId);
  const where = { conversationId };
  if (cursor) where.id = { [Op.lt]: Number(cursor) };
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_MESSAGE_PAGE, 1), MAX_MESSAGE_PAGE);
  const messages = await Message.findAll({
    where,
    include: [
      { model: User, as: 'sender', attributes: ['id', 'name'] },
      { model: Media, as: 'image' },
      {
        model: MessageReaction,
        as: 'reactions',
        required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
    ],
    order: [['id', 'DESC']],
    limit: safeLimit,
  });
  messages.reverse();
  return attachReadReceipts(messages);
}

/**
 * Absolute, publicly fetchable URL for a stored image.
 *
 * The database records the public site's `/media/<key>` path; Firebase needs
 * the API's own media route, so it is rewritten to `/api/v1/media/<key>`.
 */
function absoluteMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  const path = url.startsWith('/') ? url : `/${url}`;
  const base = new URL(env.SITE_URL);
  if (path.startsWith('/media/')) {
    return new URL(`/api/v1/media/${path.slice('/media/'.length)}`, base).toString();
  }
  return new URL(path, base).toString();
}

function truncatePushBody(body, limit = 180) {
  const text = String(body ?? '').trim();
  if (!text) return 'Message';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function notifyOfflineRecipients({ conversationId, senderId, publicMessage }) {
  if (!publicMessage) return;

  const conversation = await Conversation.findByPk(conversationId, {
    attributes: ['isGroup', 'title'],
  });
  const members = await ConversationMember.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  const recipientIds = [
    ...new Set(members.map((member) => Number(member.userId)).filter((id) => Number.isInteger(id) && id > 0)),
  ].filter((id) => id !== Number(senderId));

  const isGroup = conversation?.isGroup === true;
  const senderName = publicMessage.senderName || 'Someone';
  const text = publicMessage.text || '';
  const hasImage = Boolean(publicMessage.image);
  const imageUrl = absoluteMediaUrl(publicMessage.image?.url);
  const photoBody = hasImage ? '📷 Photo' : '';
  const body = text ? (isGroup ? `${senderName}: ${text}` : text) : (isGroup ? `${senderName} sent ${photoBody || 'a message'}` : photoBody || 'Message');

  for (const recipientId of recipientIds) {
    if (isOnline(recipientId)) continue;
    await enqueuePush({
      userId: recipientId,
      kind: 'chat_message',
      title: isGroup ? (conversation?.title || 'Group chat') : senderName,
      body: truncatePushBody(body),
      image: imageUrl,
      data: {
        type: 'chat_message',
        conversationId: Number(conversationId),
        messageId: Number(publicMessage.id),
      },
    });
  }
}

export async function sendMessage(userId, conversationId, { text, replyToId = null, imageMediaId = null } = {}) {
  await assertMembership(userId, conversationId);
  const cleanText = typeof text === 'string' ? text.trim() : '';

  let media = null;
  if (imageMediaId) {
    const found = await Media.findByPk(Number(imageMediaId), {
      attributes: ['id', 'kind', 'uploadedById'],
    });
    if (!found || found.kind !== 'image' || Number(found.uploadedById) !== Number(userId)) {
      throw AppError.badRequest('That image is not available');
    }
    media = found;
  }

  if (!cleanText && !media) {
    throw AppError.badRequest('Write a message or attach a photo');
  }

  const message = await Message.create({
    conversationId,
    userId,
    text: cleanText || null,
    replyToId: replyToId ?? null,
    imageMediaId: media ? Number(media.id) : null,
  });

  // Sending ends the typing state at once, so no client shows "typing…"
  // beside a message that has already arrived.
  clearTyping(userId, conversationId);
  await Conversation.update({ lastMessageAt: new Date() }, { where: { id: conversationId } });

  // The sender reads their own message through the send. This also means the
  // unread badge does not count messages the sender has already produced.
  const readCursor = await ConversationMember.findOne({
    where: { conversationId, userId },
    attributes: ['lastReadMessageId'],
  });
  if (Number(readCursor?.lastReadMessageId) < message.id) {
    await ConversationMember.update(
      { lastReadMessageId: Number(message.id) },
      { where: { conversationId, userId } },
    );
    await emitChatEvent({
      type: 'conversation.read',
      conversationId: Number(conversationId),
      userId: Number(userId),
      lastReadMessageId: Number(message.id),
    });
  }

  const publicMessage = await loadPublicMessage(message.id);
  await notifyOfflineRecipients({ conversationId, senderId: userId, publicMessage });
  await emitChatEvent({ type: 'message.new', conversationId, message: publicMessage });
  return publicMessage;
}

export async function editMessage(userId, messageId, { text }) {
  const message = await Message.findByPk(messageId, {
    include: [{ model: User, as: 'sender', attributes: ['id', 'name'] }],
  });
  if (!message || message.deletedAt) throw AppError.notFound('Message not found');
  if (Number(message.userId) !== Number(userId)) {
    throw AppError.forbidden('Only the sender can edit a message');
  }
  await assertMembership(userId, Number(message.conversationId));
  await message.update({ text, editedAt: new Date() });
  const publicMessage = await loadPublicMessage(messageId);
  await emitChatEvent({
    type: 'message.updated',
    conversationId: Number(message.conversationId),
    message: publicMessage,
  });
  return publicMessage;
}

export async function deleteMessage(userId, messageId) {
  const message = await Message.findByPk(messageId);
  if (!message || message.deletedAt) throw AppError.notFound('Message not found');
  if (String(Number(message.userId)) !== String(Number(userId))) {
    throw AppError.forbidden('Only the sender can delete a message');
  }
  await assertMembership(userId, Number(message.conversationId));
  await destroyMessage(message);
  await emitChatEvent({
    type: 'message.deleted',
    conversationId: Number(message.conversationId),
    messageId: Number(messageId),
  });
  return { messageId: Number(messageId) };
}

async function destroyMessage(message) {
  const imageMediaId = message.imageMediaId ? Number(message.imageMediaId) : null;
  await message.destroy();
  if (imageMediaId) {
    await deleteUnreferencedMedia([imageMediaId]).catch((error) =>
      logger.warn({ err: error.message, imageMediaId }, 'failed to clean up chat image'),
    );
  }
}

/**
 * Super-admin deletion of any message in a conversation.
 *
 * This is separate from the normal delete route: normal users must delete
 * their own messages, while super admins get a control plane for moderation.
 */
export async function adminDeleteMessage(userId, messageId) {
  const message = await Message.findByPk(messageId);
  if (!message || message.deletedAt) throw AppError.notFound('Message not found');
  await assertMembership(userId, Number(message.conversationId));
  await destroyMessage(message);
  await emitChatEvent({
    type: 'message.deleted',
    conversationId: Number(message.conversationId),
    messageId: Number(messageId),
  });
  return { messageId: Number(messageId) };
}

export async function markRead(userId, conversationId, messageId = null) {
  const row = await ConversationMember.findOne({ where: { conversationId, userId }, attributes: ['lastReadMessageId'] });
  if (!row) throw AppError.notFound('Conversation not found');

  const newest = await newestMessageId(conversationId);
  let target = messageId ? Number(messageId) : newest;
  if (newest) target = Math.min(target, newest);

  if (target) {
    const messageExists = await Message.count({ where: { id: target, conversationId } });
    if (!messageExists) throw AppError.badRequest('Message not found');
  }

  const current = Number(row.lastReadMessageId) || 0;
  const next = Math.max(current, target || 0);
  if (next <= current) {
    return { lastReadMessageId: current || null };
  }

  await ConversationMember.update(
    { lastReadMessageId: next },
    { where: { conversationId, userId } },
  );
  await emitChatEvent({
    type: 'conversation.read',
    conversationId: Number(conversationId),
    userId: Number(userId),
    lastReadMessageId: next,
  });
  return { lastReadMessageId: next };
}

/* -------------------------------------------------------------------------- */
/* Reactions
/* -------------------------------------------------------------------------- */

async function publicReactionSummaries(messageId) {
  const rows = await MessageReaction.findAll({
    where: { messageId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
  return rows.map((row) => ({
    emoji: row.emoji,
    userId: Number(row.userId),
    name: row.user?.name ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  }));
}

export async function addReaction(userId, conversationId, messageId, emoji) {
  await assertMembership(userId, conversationId);
  const message = await Message.findOne({ where: { id: Number(messageId), conversationId }, attributes: ['id', 'deletedAt'] });
  if (!message || message.deletedAt) throw AppError.notFound('Message not found');
  const cleanEmoji = String(emoji || '').trim().slice(0, 40);
  if (!cleanEmoji) throw AppError.badRequest('Choose an emoji');

  const existing = await MessageReaction.findOne({ where: { messageId: Number(messageId), userId, emoji: cleanEmoji } });
  if (existing) {
    const reactions = await publicReactionSummaries(Number(messageId));
    return { messageId: Number(messageId), reactions };
  }

  await MessageReaction.create({ messageId: Number(messageId), userId, emoji: cleanEmoji });
  const reactions = await publicReactionSummaries(Number(messageId));
  await emitChatEvent({ type: 'message.reactions', conversationId, messageId: Number(messageId), reactions });
  return { messageId: Number(messageId), reactions };
}

export async function removeReaction(userId, conversationId, messageId, emoji) {
  await assertMembership(userId, conversationId);
  const message = await Message.findOne({ where: { id: Number(messageId), conversationId }, attributes: ['id', 'deletedAt'] });
  if (!message || message.deletedAt) throw AppError.notFound('Message not found');
  const cleanEmoji = String(emoji || '').trim().slice(0, 40);
  if (!cleanEmoji) throw AppError.badRequest('Choose an emoji');

  await MessageReaction.destroy({ where: { messageId: Number(messageId), userId, emoji: cleanEmoji } });
  const reactions = await publicReactionSummaries(Number(messageId));
  await emitChatEvent({ type: 'message.reactions', conversationId, messageId: Number(messageId), reactions });
  return { messageId: Number(messageId), reactions };
}

/* -------------------------------------------------------------------------- */
/* Search, pin, mute
/* -------------------------------------------------------------------------- */

export async function searchMessages(userId, conversationId, { q } = {}) {
  await assertMembership(userId, conversationId);
  const term = String(q || '').trim();
  if (!term) return [];
  const messages = await Message.findAll({
    where: { conversationId },
    include: [
      { model: User, as: 'sender', attributes: ['id', 'name'] },
      { model: Media, as: 'image', attributes: ['id', 'altText', 'title', 'caption'] },
      {
        model: MessageReaction,
        as: 'reactions',
        required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      },
    ],
    order: [['id', 'DESC']],
  });
  const needle = term.toLowerCase();
  const filtered = messages.filter((message) => {
    const text = (message.text || '').toLowerCase();
    if (text.includes(needle)) return true;
    const image = message.image;
    return Boolean(
      image &&
      [image.altText, image.title, image.caption].some(
        (value) => typeof value === 'string' && value.toLowerCase().includes(needle),
      ),
    );
  });
  filtered.reverse();
  return attachReadReceipts(filtered);
}

export async function pinConversation(userId, conversationId, pinned = true) {
  await assertMembership(userId, conversationId);
  const conversation = await Conversation.findByPk(conversationId, { attributes: ['id', 'pinnedAt'] });
  if (!conversation) throw AppError.notFound('Conversation not found');
  await conversation.update({ pinnedAt: pinned ? new Date() : null });
  return toPublicConversation(conversation, {
    viewerId: userId,
    names: await loadUserNames([conversation]),
  });
}

export async function muteConversation(userId, conversationId, muted = true) {
  await assertMembership(userId, conversationId);
  const member = await ConversationMember.findOne({ where: { conversationId, userId } });
  if (!member) throw AppError.notFound('Conversation not found');
  await member.update({ isMuted: muted });
  return { muted };
}

/* -------------------------------------------------------------------------- */
/* Link preview
/* -------------------------------------------------------------------------- */

function extractMeta(html, name, attribute = 'name') {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    `<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escaped}["']`,
  ];
  for (const pattern of patterns) {
    const match = html.match(new RegExp(pattern, 'i'));
    if (match) return match[1]?.trim() || null;
  }
  return null;
}

function extractOpenGraph(html, property) {
  return extractMeta(html, property, 'property') ?? extractMeta(html, property, 'name');
}

export async function getLinkPreview(url) {
  const href = String(url || '').trim();
  if (!/^https?:\/\//i.test(href)) throw AppError.badRequest('Enter an http(s) URL');
  const target = href.slice(0, 2000);

  let response;
  try {
    response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Virallink-Chat/1' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const html = await response.text().catch(() => '');
  const body = html.slice(0, 40000);

  const title = extractOpenGraph(body, 'og:title') || extractMeta(body, 'title', 'title') || null;
  const description = extractOpenGraph(body, 'og:description') || extractMeta(body, 'description', 'description') || null;
  const imageUrl = extractOpenGraph(body, 'og:image') || extractMeta(body, 'image', 'image') || null;
  const siteName = extractOpenGraph(body, 'og:site_name') || null;

  if (!title && !description && !imageUrl) return null;
  return { url: target, title, description, imageUrl, siteName };
}

/* -------------------------------------------------------------------------- */
/* Typing                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Who is typing in a conversation right now, minus [excludeUserId].
 *
 * Expired entries are pruned as they are read, so callers never need to clean
 * up after a user who walked away.
 */
export function typingUsers(conversationId, excludeUserId = null) {
  const entry = typingState.get(Number(conversationId));
  if (!entry) return [];

  const now = Date.now();
  const result = [];
  for (const [userId, value] of entry) {
    if (value.expiresAt <= now) {
      entry.delete(userId);
    } else if (Number(userId) !== Number(excludeUserId)) {
      result.push({ userId: Number(userId), name: value.name ?? null });
    }
  }
  if (!entry.size) typingState.delete(Number(conversationId));
  return result;
}

/** Forget one user's typing signal (they sent a message or left). */
function clearTyping(userId, conversationId) {
  const entry = typingState.get(Number(conversationId));
  if (!entry) return;
  entry.delete(Number(userId));
  if (!entry.size) typingState.delete(Number(conversationId));
}

/**
 * Record a typing signal and push it to the conversation over the WebSocket.
 *
 * The client throttles this (one call every few seconds while the draft is
 * non-empty); the TTL above is what makes the indicator disappear again.
 */
export async function setTyping(userId, conversationId, name = null) {
  await assertMembership(userId, conversationId);

  let entry = typingState.get(Number(conversationId));
  if (!entry) {
    entry = new Map();
    typingState.set(Number(conversationId), entry);
  }
  entry.set(Number(userId), {
    name: name ?? null,
    expiresAt: Date.now() + TYPING_TTL_MS,
  });

  await emitChatEvent({
    type: 'typing',
    conversationId: Number(conversationId),
    user: { userId: Number(userId), name: name ?? null },
  });

  return typingUsers(conversationId, userId);
}
