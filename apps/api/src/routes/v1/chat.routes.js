import { Router } from 'express';
import { models } from '../../models/index.js';
import { v, idFrom, query } from '../../middleware/schemas.js';
import { requireAuth } from '../../services/token.service.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES } from '../../shared/enums.js';
import { storeImage } from '../../services/media.service.js';
import { toPublicMedia } from '../../serializers/public.js';
import { uploadSingle } from '../upload.js';
import * as chatService from '../../services/chat.service.js';

/**
 * User chat API.
 *
 * Conversations, messages, and the read cursor (which drives the unread badge).
 * All routes require the standard session; they are not admin-permission
 * gated — any authenticated user with an account can use chat.
 *
 * Realtime (the WebSocket) is not a route here: it is attached to the same
 * Node server via server.js → chat.ws.service.js.
 */
const router = Router();
const authenticate = requireAuth(models);

router.use(authenticate);

/**
 * GET /api/v1/chat/users — people this account can start a chat with.
 *
 * Not permission-gated beyond being signed in, and not the admin user list:
 * chat is for every staff account, not only those who can manage users.
 */
router.get('/users', async (request, response) => {
  const users = await chatService.listChatUsers(Number(request.user.id));
  response.json({ data: { users } });
});

/** GET /api/v1/chat/conversations — the chat list, newest activity first. */
router.get('/conversations', async (request, response) => {
  const conversations = await chatService.listConversations(Number(request.user.id));
  response.json({ data: { conversations } });
});

/** POST /api/v1/chat/conversations — create a private or group chat. */
router.post('/conversations', v('chatCreate'), async (request, response) => {
  const conversation = await chatService.createConversation(Number(request.user.id), request.body);
  response.status(201).json({ data: { conversation } });
});

/**
 * POST /api/v1/chat/uploads — attach an image to a message.
 *
 * Chat is not behind the admin media permission gate, so a normal signed-in
 * account can attach an image it uploaded to its own thread. Storage is the
 * shared image pipeline (validated, re-encoded WebP, no orphan on failure).
 */
router.post('/uploads', uploadSingle, async (request, response) => {
  const media = await storeImage(request.file, {
    folder: 'chat',
    uploadedById: request.user.id,
  });
  response.status(201).json({
    data: { media: { id: Number(media.id), ...toPublicMedia(media) } },
  });
});

/** GET /api/v1/chat/conversations/:id — detail, including membership and unread. */
router.get('/conversations/:id', v('idParam'), async (request, response) => {
  const conversation = await chatService.getConversation(Number(request.user.id), idFrom(request));
  response.json({ data: { conversation } });
});

/**
 * DELETE /api/v1/chat/conversations/:id — super admin deletes the conversation
 * and every message in it.
 */
router.delete(
  '/conversations/:id',
  requireRole(ROLES.SUPER_ADMIN),
  v('idParam'),
  async (request, response) => {
    const result = await chatService.deleteConversation(
      Number(request.user.id),
      idFrom(request),
    );
    response.json({ data: result });
  },
);

/**
 * DELETE /api/v1/chat/conversations/:id/messages — super admin clears a
 * conversation's thread without removing the conversation.
 */
router.delete(
  '/conversations/:id/messages',
  requireRole(ROLES.SUPER_ADMIN),
  v('idParam'),
  async (request, response) => {
    const result = await chatService.deleteConversationMessages(
      Number(request.user.id),
      idFrom(request),
    );
    response.json({ data: result });
  },
);

/**
 * GET /api/v1/chat/conversations/:id/messages — history, oldest first.
 *
 * `typingUsers` rides along so a polling client (the web admin) can show the
 * typing indicator without a second request.
 */
router.get('/conversations/:id/messages', v('chatMessagesQuery'), async (request, response) => {
  const userId = Number(request.user.id);
  const conversationId = idFrom(request);
  const messages = await chatService.listMessages(userId, conversationId, query(request));
  const typingUsers = chatService.typingUsers(conversationId, userId);
  response.json({ data: { messages, typingUsers } });
});

/**
 * POST /api/v1/chat/conversations/:id/typing — "I am typing".
 *
 * Called at most every few seconds by the composer; the server expires the
 * signal on its own. The socket broadcasts it to the other members.
 */
router.post('/conversations/:id/typing', async (request, response) => {
  const typingUsers = await chatService.setTyping(
    Number(request.user.id),
    idFrom(request),
    request.user.name,
  );
  response.json({ data: { typingUsers } });
});

/** POST /api/v1/chat/conversations/:id/messages — send a message. */
router.post('/conversations/:id/messages', v('chatSend'), async (request, response) => {
  const message = await chatService.sendMessage(Number(request.user.id), idFrom(request), request.body);
  response.status(201).json({ data: { message } });
});

/** POST /api/v1/chat/conversations/:id/messages/:messageId — edit your own message. */
router.post('/conversations/:id/messages/:messageId', v('chatEdit'), async (request, response) => {
  const message = await chatService.editMessage(
    Number(request.user.id),
    Number(request.params.messageId),
    request.body,
  );
  response.json({ data: { message } });
});

/**
 * DELETE /api/v1/chat/conversations/:id/messages/:messageId — delete your own
 * message; super admins may delete any message in the thread.
 */
router.delete('/conversations/:id/messages/:messageId', async (request, response) => {
  const messageId = Number(request.params.messageId);
  const isSuperAdmin = (request.user.roles || []).includes(ROLES.SUPER_ADMIN);
  const result = isSuperAdmin
    ? await chatService.adminDeleteMessage(Number(request.user.id), messageId)
    : await chatService.deleteMessage(Number(request.user.id), messageId);
  response.json({ data: result });
});

/**
 * DELETE /api/v1/chat/conversations/:id/messages/:messageId/admin — super admin
 * deletes any message in the thread (moderation).
 */
router.delete(
  '/conversations/:id/messages/:messageId/admin',
  requireRole(ROLES.SUPER_ADMIN),
  async (request, response) => {
    const result = await chatService.adminDeleteMessage(
      Number(request.user.id),
      Number(request.params.messageId),
    );
    response.json({ data: result });
  },
);

/** POST /api/v1/chat/conversations/:id/read — advance the unread cursor. */
router.post('/conversations/:id/read', v('chatRead'), async (request, response) => {
  const result = await chatService.markRead(
    Number(request.user.id),
    idFrom(request),
    request.body.messageId,
  );
  response.json({ data: result });
});

/**
 * Reactions
 */
router.post(
  '/conversations/:id/messages/:messageId/reactions',
  v('chatReaction'),
  async (request, response) => {
    const result = await chatService.addReaction(
      Number(request.user.id),
      idFrom(request),
      Number(request.params.messageId),
      request.body.emoji,
    );
    response.json({ data: result });
  },
);
router.delete(
  '/conversations/:id/messages/:messageId/reactions',
  v('chatReaction'),
  async (request, response) => {
    const result = await chatService.removeReaction(
      Number(request.user.id),
      idFrom(request),
      Number(request.params.messageId),
      request.body.emoji,
    );
    response.json({ data: result });
  },
);

/** Search within a thread (text + image captions/alt text). */
router.get('/conversations/:id/search', v('chatSearchQuery'), async (request, response) => {
  const messages = await chatService.searchMessages(
    Number(request.user.id),
    idFrom(request),
    { q: request.query.q },
  );
  response.json({ data: { messages } });
});

/** Fetch a public link preview for a sent URL. */
router.get('/link-preview', v('chatLinkPreviewQuery'), async (request, response) => {
  const preview = await chatService.getLinkPreview(request.query.url);
  response.json({ data: { preview } });
});

/** Pin/unpin a conversation in the chat list. */
router.patch('/conversations/:id/pin', v('chatPin'), async (request, response) => {
  const conversation = await chatService.pinConversation(
    Number(request.user.id),
    idFrom(request),
    request.body.pinned,
  );
  response.json({ data: { conversation } });
});

/** Mute/unmute a conversation. */
router.patch('/conversations/:id/mute', v('chatMute'), async (request, response) => {
  const result = await chatService.muteConversation(
    Number(request.user.id),
    idFrom(request),
    request.body.muted,
  );
  response.json({ data: result });
});

export default router;
