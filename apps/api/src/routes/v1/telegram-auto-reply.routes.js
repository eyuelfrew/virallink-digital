import { Router } from 'express';
import { idFrom, query, v } from '../../middleware/schemas.js';
import { requirePermission } from '../../middleware/rbac.js';
import { PERMISSIONS } from '../../shared/permissions.js';
import { AppError } from '../../utils/AppError.js';
import * as telegram from '../../services/telegram-auto-reply.service.js';
import * as telegramAccount from '../../services/telegram-account.service.js';

const router = Router();

function has(request, permission) {
  return Boolean(request.user?.permissions?.includes(permission));
}

function canManage(request) {
  return has(request, PERMISSIONS.TELEGRAM_MANAGE);
}

function canRead(request) {
  return has(request, PERMISSIONS.TELEGRAM_READ);
}

async function accountFor(request, id) {
  if (canManage(request)) return telegram.getAccount(id);
  return telegram.getOwnedAccount(request.user.id, id);
}

function paramId(request, name = 'id') {
  const raw = request.params[name];
  if (!raw || !/^\d+$/.test(String(raw))) throw AppError.badRequest('Invalid identifier');
  return Number(raw);
}

async function accountStatusResponse(response, userId, extra = {}) {
  const status = await telegramAccount.getStatus(userId);
  response.json({ data: { ...status, ...extra } });
}
/* ================================================================== */
/* Personal Telegram account (MTProto)                                 */
/*                                                                     */
/* Deliberately authenticated only: every account holder may connect    */
/* their own Telegram and configure their own chats, not just admins.   */
/* ================================================================== */

router.get('/account/status', async (request, response) => {
  response.json({ data: await telegramAccount.getStatus(request.user.id) });
});

router.put('/account/config', v('telegramAccountConfig'), async (request, response) => {
  const status = await telegramAccount.saveCredentials(request.user.id, request.body);
  response.json({ data: { ...status, saved: true } });
});

router.post('/account/send-code', async (request, response) => {
  const result = await telegramAccount.sendLoginCode(request.user.id, {
    forceSms: Boolean(request.body?.forceSms),
  });
  await accountStatusResponse(response, request.user.id, result);
});

/**
 * POST /account/qr-start
 *
 * Begin a QR sign-in. The response carries `pending_login.qr_data_url` (a PNG
 * data URL) and `pending_login.qr_url` (the tg:// link). The browser shows the
 * image and polls /account/status; the API keeps the login attempt in memory.
 */
router.post('/account/qr-start', async (request, response) => {
  const status = await telegramAccount.startQrLogin(request.user.id);
  response.json({ data: { ...status, qr_started: true } });
});

router.post('/account/verify-code', v('telegramAccountCode'), async (request, response) => {
  const result = await telegramAccount.verifyLoginCode(request.user.id, request.body.code);
  await accountStatusResponse(response, request.user.id, result);
});

router.post('/account/verify-password', v('telegramAccountPassword'), async (request, response) => {
  const result = await telegramAccount.verifyLoginPassword(request.user.id, request.body.password);
  await accountStatusResponse(response, request.user.id, result);
});

router.post('/account/cancel-login', async (request, response) => {
  const result = await telegramAccount.cancelLogin(request.user.id);
  await accountStatusResponse(response, request.user.id, result);
});

router.post('/account/connect', async (request, response) => {
  await telegramAccount.connect(request.user.id);
  await accountStatusResponse(response, request.user.id, { connected: true });
});

router.post('/account/disconnect', async (request, response) => {
  await telegramAccount.disconnect(request.user.id);
  await accountStatusResponse(response, request.user.id);
});

router.delete('/account/session', async (request, response) => {
  const status = await telegramAccount.clearSession(request.user.id);
  response.json({ data: { ...status, session_cleared: true } });
});

router.delete('/account/config', async (request, response) => {
  const status = await telegramAccount.resetAccount(request.user.id);
  response.json({ data: { ...status, reset: true } });
});

/* ================================================================== */
/* Auto-reply bots / accounts                                         */
/* ================================================================== */

router.get('/', async (request, response) => {
  const accounts = await telegram.listAccounts({
    userId: request.user.id,
    canManage: false,
  });
  response.json({ data: accounts });
});

router.get('/accounts', requirePermission(PERMISSIONS.TELEGRAM_READ), async (_request, response) => {
  const accounts = await telegram.listAccounts({ canManage: true });
  response.json({ data: accounts });
});

router.post('/connect', v('telegramConnect'), async (request, response) => {
  const account = await telegram.connectBot(request.user.id, request.body);
  response.status(201).json({ data: telegram.serializeAccount(account) });
});

router.post(
  '/company/connect',
  requirePermission(PERMISSIONS.TELEGRAM_MANAGE),
  v('telegramConnect'),
  async (request, response) => {
    const account = await telegram.connectCompanyBot(request.body);
    response.status(201).json({ data: telegram.serializeAccount(account) });
  },
);

router.get('/catalog', requirePermission(PERMISSIONS.TELEGRAM_READ), v('telegramCatalogList'), async (request, response) => {
  const items = await telegram.listCatalog({ activeOnly: Boolean(query(request).activeOnly) });
  response.json({ data: items });
});

router.post('/catalog', requirePermission(PERMISSIONS.TELEGRAM_WRITE), v('telegramCatalog'), async (request, response) => {
  const item = await telegram.createCatalogItem(request.body);
  response.status(201).json({ data: telegram.serializeCatalogItem(item) });
});

router.put(
  '/catalog/:id',
  requirePermission(PERMISSIONS.TELEGRAM_WRITE),
  v('idParam'),
  v('updateTelegramCatalog'),
  async (request, response) => {
    const item = await telegram.updateCatalogItem(idFrom(request), request.body);
    response.json({ data: telegram.serializeCatalogItem(item) });
  },
);

router.delete(
  '/catalog/:id',
  requirePermission(PERMISSIONS.TELEGRAM_WRITE),
  v('idParam'),
  async (request, response) => {
    const result = await telegram.deleteCatalogItem(idFrom(request));
    response.json({ data: result });
  },
);

/* ------------------------------------------------------------------ */
/* Per-chat controls                                                   */
/* ------------------------------------------------------------------ */

/*
 * The chats that are blocked, and the chats whose auto-reply is off.
 *
 * There is no conversation list: the auto-reply keeps no transcript, so there
 * is nothing to list. A chat id and its two switches are all it holds.
 */
router.get('/blocked-chats', async (request, response) => {
  const canManage = has(request, PERMISSIONS.TELEGRAM_READ);
  const accountId = request.query.accountId ? Number(request.query.accountId) : null;

  const chats = await telegram.listBlockedChats({
    accountId: Number.isInteger(accountId) ? accountId : null,
    userId: request.user.id,
    canManage,
  });

  response.json({ data: chats });
});

/**
 * GET /:id/analytics — aggregate auto-reply metrics.
 *
 * Counts only: no chat id, sender, username or message text is exposed. The
 * response is totals, a daily series and the most-used rules, scoped to this
 * account. Owners need telegram.read; managers can read any account.
 */
router.get(
  '/:id/analytics',
  requirePermission(PERMISSIONS.TELEGRAM_READ),
  v('idParam'),
  v('telegramAnalytics'),
  async (request, response) => {
    const account = await accountFor(request, idFrom(request));
    const { days } = query(request);
    response.json({ data: await telegram.getAnalytics(account.id, { days }) });
  },
);

/** Block a chat, or switch its auto-reply off. */
router.post('/:id/chat-switch', v('idParam'), v('telegramChatSwitch'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const state = await telegram.setChatBlocked(account.id, request.body.chatId, {
    isBlocked: request.body.isBlocked,
    autoReplyEnabled: request.body.autoReplyEnabled,
  });
  response.json({ data: state });
});

/* ------------------------------------------------------------------ */
/* Reply rules                                                         */
/* ------------------------------------------------------------------ */

router.get('/:id/rules', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  response.json({ data: await telegram.listRules(account.id) });
});

router.post('/:id/rules', v('idParam'), v('telegramRule'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const rule = await telegram.createRule(account.id, request.body);
  response.status(201).json({ data: telegram.serializeRule(rule) });
});

router.put(
  '/:id/rules/:ruleId',
  v('telegramRuleParams'),
  v('updateTelegramRule'),
  async (request, response) => {
    const account = await accountFor(request, idFrom(request));
    const rule = await telegram.updateRule(account.id, paramId(request, 'ruleId'), request.body);
    response.json({ data: telegram.serializeRule(rule) });
  },
);

router.delete('/:id/rules/:ruleId', v('telegramRuleParams'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  response.json({ data: await telegram.deleteRule(account.id, paramId(request, 'ruleId')) });
});

/* ------------------------------------------------------------------ */
/* Interactive menu buttons                                            */
/* ------------------------------------------------------------------ */

router.get('/:id/menu-buttons', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  response.json({ data: await telegram.listMenuButtons(account.id) });
});

router.post('/:id/menu-buttons', v('idParam'), v('telegramMenuButton'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const button = await telegram.createMenuButton(account.id, request.body);
  response.status(201).json({ data: telegram.serializeMenuButton(button) });
});

router.put(
  '/:id/menu-buttons/:buttonId',
  v('telegramMenuButtonParams'),
  v('updateTelegramMenuButton'),
  async (request, response) => {
    const account = await accountFor(request, idFrom(request));
    const button = await telegram.updateMenuButton(account.id, paramId(request, 'buttonId'), request.body);
    response.json({ data: telegram.serializeMenuButton(button) });
  },
);

router.delete('/:id/menu-buttons/:buttonId', v('telegramMenuButtonParams'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  response.json({ data: await telegram.deleteMenuButton(account.id, paramId(request, 'buttonId')) });
});

router.put('/:id/settings', v('idParam'), v('telegramSettings'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const settings = await telegram.updateSettings(account.id, request.body);
  response.json({ data: telegram.serializeSettings(settings) });
});

/**
 * GET /:id/preview?chatId=123
 *
 * Say what the auto-reply would do with a message, without sending anything.
 *
 * The auto-reply is quiet by design, so "nothing came back" is usually the
 * right answer and there is no way to tell it apart from a broken connection.
 * This runs the same matcher and the same cooldown the handler uses and
 * reports the outcome, so an administrator can see the reason rather than
 * guessing.
 */
router.get('/:id/preview', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));

  const chatId = request.query.chatId ? Number(request.query.chatId) : null;
  if (chatId !== null && (!Number.isInteger(chatId) || chatId <= 0)) {
    throw new AppError.badRequest('Invalid chat id');
  }

  // Nothing a client wrote is stored, so the administrator supplies the
  // message to test — which is the better way to try it anyway.
  const text = request.query.text !== undefined ? String(request.query.text) : '';

  const result = await telegram.previewReply(account.id, { chatId, text });
  response.json({ data: result });
});

/**
 * POST /:id/reset-away
 *
 * Clear the away-message cooldown so the next message in a chat is answered
 * again. The cooldown is per chat, so a person testing the away message is
 * not held up by the one they triggered hours ago.
 */
router.post('/:id/reset-away', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));

  const chatId = request.body?.chatId ? Number(request.body.chatId) : null;
  const result = await telegram.resetAwayCooldown(account.id, { chatId });
  response.json({ data: result });
});

/**
 * POST /:id/test-message
 *
 * Send a message on the account's own behalf.
 *
 * The auto-reply only speaks when somebody writes first, and the welcome
 * message and the away message are both throttled, so there is no quick way
 * to see whether a connection works at all. This sends one message to one
 * chat, through the same transport the auto-reply uses.
 */
router.post('/:id/test-message', v('idParam'), v('telegramTestMessage'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));

  // A personal account sends through its own MTProto session, so it needs the
  // live client; a bot sends through the Bot API with the account's token.
  const client =
    account.provider === 'account'
      ? telegramAccount.getRuntime(account.ownerUserId)?.client || null
      : null;

  const result = await telegram.sendTestMessage(account, {
    chatId: request.body.chatId,
    text: request.body.text,
    client,
  });

  response.json({ data: result });
});

router.post('/:id/sync', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const synced = await telegram.syncWebhook(account);
  response.json({ data: telegram.serializeAccount(synced) });
});

router.patch('/:id/active', v('idParam'), v('telegramActive'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const updated = await telegram.setAccountActive(account, request.body.isActive);
  response.json({ data: telegram.serializeAccount(updated) });
});

router.delete('/:id', v('idParam'), async (request, response) => {
  const account = await accountFor(request, idFrom(request));
  const result = await telegram.disconnectBot(account);
  response.json({ data: result });
});

export default router;
