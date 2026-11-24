import { WebSocketServer, WebSocket } from 'ws';
import logger from '../config/logger.js';
import { models } from '../models/index.js';
import { verifyAccessToken } from './token.service.js';
import { onChatEvent } from './chat.service.js';
import { markOffline, markOnline } from './chat.presence.service.js';

const { User, ConversationMember } = models;

/*
 * Realtime chat transport.
 *
 * Attached to the same Node HTTP server as the REST API via `attachChatWebSocket`
 * in server.js. Mobile clients connect with an `Authorization: Bearer` header
 * (their access token) and receive one of:
 *
 *   { event: 'message.new',     conversationId, message }
 *   { event: 'message.updated', conversationId, message }
 *   { event: 'message.deleted', conversationId, messageId }
 *   { event: 'conversation.read', conversationId, userId, lastReadMessageId }
 *   { event: 'message.reactions', conversationId, messageId, reactions }
 *   { event: 'typing',          conversationId, user: { userId, name } }
 *   { event: 'conversation.created', conversation }
 *
 * A silent socket that cannot send is pruned; connections re-establish on the
 * client side, so a brief gap costs nothing.
 */

/** userId -> Set<WebSocket>. Kept in memory: a lost socket is lost anyway. */
const connections = new Map();
const PING_INTERVAL_MS = 30 * 1000;
let subscribed = false;

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    logger.warn({ err: error.message }, 'chat socket send failed');
    for (const set of connections.values()) set.delete(ws);
  }
}

async function broadcastToConversation(conversationId, payload) {
  const members = await ConversationMember.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  const recipients = new Set();
  for (const member of members) {
    for (const ws of connections.get(Number(member.userId)) || []) recipients.add(ws);
  }
  for (const ws of recipients) safeSend(ws, payload);
}

function broadcastToUsers(userIds, payload) {
  for (const userId of userIds) {
    for (const ws of connections.get(userId) || []) safeSend(ws, payload);
  }
}

/** Socket authentication: Bearer header or `?token=` query parameter. */
async function resolveSocketUser(request) {
  const header = request.headers?.authorization;
  const token =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const queryToken =
    typeof request.url === 'string' ? new URLSearchParams(request.url.split('?')[1] || '').get('token') : null;
  const presented = token || queryToken;
  if (!presented) return null;
  try {
    const payload = await verifyAccessToken(presented);
    const user = await User.findOne({ where: { id: payload.sub }, attributes: ['id', 'isActive'] });
    return user && user.isActive ? Number(user.id) : null;
  } catch {
    return null;
  }
}

function startKeepalive(ws, userId) {
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, PING_INTERVAL_MS);
  timer.unref?.();
  ws.on('close', () => {
    clearInterval(timer);
    const set = connections.get(userId);
    if (set) {
      set.delete(ws);
      if (!set.size) connections.delete(userId);
    }
    markOffline(userId);
    logger.info({ userId }, 'chat socket disconnected');
  });
  ws.on('error', (error) => logger.debug({ err: error.message, userId }, 'chat socket error'));
}

function subscribeToChatEvents() {
  if (subscribed) return;
  subscribed = true;
  onChatEvent(async (event) => {
    try {
      if (event.type === 'conversation.created') {
        broadcastToUsers(
          event.conversation.members.map((member) => member.userId),
          { event: 'conversation.created', conversation: event.conversation },
        );
      } else if (event.type === 'typing') {
        await broadcastToConversation(event.conversationId, {
          event: 'typing',
          conversationId: Number(event.conversationId),
          user: event.user,
        });
      } else if (event.type === 'conversation.read') {
        await broadcastToConversation(event.conversationId, {
          event: 'conversation.read',
          conversationId: Number(event.conversationId),
          userId: Number(event.userId),
          lastReadMessageId: Number(event.lastReadMessageId),
        });
      } else if (event.type === 'message.reactions') {
        await broadcastToConversation(event.conversationId, {
          event: 'message.reactions',
          conversationId: Number(event.conversationId),
          messageId: Number(event.messageId),
          reactions: Array.isArray(event.reactions)
            ? event.reactions.map((reaction) => ({
                emoji: reaction.emoji,
                userId: Number(reaction.userId),
                name: reaction.name,
                createdAt: reaction.createdAt,
              }))
            : [],
        });
      } else if (event.type === 'message.deleted') {
        await broadcastToConversation(event.conversationId, {
          event: 'message.deleted',
          conversationId: Number(event.conversationId),
          messageId: Number(event.messageId),
        });
      } else {
        // message.new / message.updated
        await broadcastToConversation(event.conversationId, {
          event: event.type,
          conversationId: Number(event.conversationId),
          message: event.message,
        });
      }
    } catch (error) {
      logger.error({ err: error.message }, 'chat event broadcast failed');
    }
  });
}

export function attachChatWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    resolveSocketUser(request)
      .then((userId) => {
        if (!userId) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          let set = connections.get(userId);
          if (!set) {
            set = new Set();
            connections.set(userId, set);
          }
          set.add(ws);
          markOnline(userId);
          startKeepalive(ws, userId);
          logger.info({ userId }, 'chat socket connected');
        });
      })
      .catch(() => socket.destroy());
  });

  subscribeToChatEvents();
  logger.info('chat websocket attached');
}
