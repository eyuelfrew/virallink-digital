import { Op } from 'sequelize';
import { Button } from 'teleproto';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import * as botApi from './telegram-bot-api.service.js';
import { encryptToken, decryptToken, generateWebhookSecret } from './telegram-crypto.service.js';
import { deleteUnreferencedMedia } from './media.service.js';

const {
  User,
  Media,
  TelegramUserAccount,
  TelegramAutoReplyAccount,
  TelegramAutoReplySettings,
  TelegramAutoReplyRule,
  TelegramCatalogItem,
  TelegramAutoReplyChatState,
  TelegramAutoReplyMetric,
  TelegramMenuButton,
} = models;

const CATALOG_LIMIT = 12;
const ALBUM_LIMIT = 10;
const MIN_REPLY_INTERVAL_MS = 1500;
const MENU_DEFAULT_TITLE = 'What would you like to do?';
const MENU_COMMANDS = [
  { command: 'start', description: 'Start the chat' },
  { command: 'menu', description: 'Open the interactive menu' },
];
const SETTINGS_FIELDS = [
  'isEnabled',
  'welcomeMessage',
  'awayMessage',
  'awayMode',
  'awayCooldownMinutes',
  'catalogEnabled',
  'catalogIntro',
  'menuEnabled',
  'menuTitle',
  'replyToNewChats',
  'replyToReturningChats',
];
const CATALOG_FIELDS = ['name', 'description', 'price', 'currency', 'imageMediaId', 'imageMediaIds', 'isActive', 'displayOrder'];
const RULE_FIELDS = [
  'name',
  'trigger',
  'keywords',
  'replyText',
  'sendCatalog',
  'imageMediaIds',
  'audioMediaId',
  'showMenu',
  'cooldownMinutes',
  'priority',
  'stopProcessing',
  'isActive',
];
const MENU_FIELDS = [
  'parentId',
  'label',
  'action',
  'replyText',
  'url',
  'imageMediaIds',
  'displayOrder',
  'isActive',
];

// Re-exported so existing imports keep working; the implementation is shared
// with the personal-account service.
export { encryptToken, decryptToken, generateWebhookSecret };

export function envBotToken() {
  return env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_BOT_TOKEN : null;
}

function accountToken(account) {
  if (account.provider === 'env') {
    const token = envBotToken();
    if (!token) throw AppError.badRequest('The server Telegram bot is not configured');
    return token;
  }

  if (account.provider === 'account') {
    throw AppError.badRequest('This account is answered through a personal Telegram login, not a bot token');
  }

  if (!account.botToken) throw AppError.badRequest('This bot has no token stored');
  return decryptToken(account.botToken);
}

function personalAccountLabel(userAccount) {
  const fullName = [userAccount.accountFirstName, userAccount.accountLastName]
    .filter(Boolean)
    .join(' ');
  return fullName
    || (userAccount.accountUsername ? `@${userAccount.accountUsername}` : '')
    || 'Personal Telegram';
}

/**
 * Create or refresh the auto-reply row that mirrors a personal Telegram login.
 *
 * The rest of the feature (settings, catalog, rules) already keys
 * off `telegram_auto_reply_accounts`. Rather than duplicate those tables for the
 * personal case, a login gets one account row with provider = 'account'.
 */
export async function ensurePersonalAccount(userAccount) {
  let account = await TelegramAutoReplyAccount.findOne({
    where: { userAccountId: userAccount.id },
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });

  /*
   * Re-attach an account left behind by a previous "reset setup".
   *
   * Reset removes the credential row but deliberately keeps the auto-reply row so
   * the settings and rules survive. Signing in again takes that
   * row back over instead of creating a second empty one.
   */
  if (!account) {
    account = await TelegramAutoReplyAccount.findOne({
      where: { ownerUserId: userAccount.userId, provider: 'account', userAccountId: null },
      include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
      order: [['createdAt', 'ASC']],
    });
  }

  if (!account) {
    account = await TelegramAutoReplyAccount.create({
      ownerUserId: userAccount.userId,
      userAccountId: userAccount.id,
      name: personalAccountLabel(userAccount).slice(0, 120),
      provider: 'account',
      telegramUserId: userAccount.telegramUserId,
      botUsername: userAccount.accountUsername,
      accountFirstName: userAccount.accountFirstName,
      accountLastName: userAccount.accountLastName,
      accountUsername: userAccount.accountUsername,
      isCompany: false,
      isActive: true,
      webhookStatus: 'active',
      connectionStatus: userAccount.status === 'connected' ? 'connected' : 'disconnected',
      lastSyncedAt: new Date(),
      lastLoginAt: userAccount.lastConnectedAt,
    });
  } else {
    await account.update({
      ownerUserId: userAccount.userId,
      userAccountId: userAccount.id,
      provider: 'account',
      name: personalAccountLabel(userAccount).slice(0, 120),
      telegramUserId: userAccount.telegramUserId,
      botUsername: userAccount.accountUsername,
      accountFirstName: userAccount.accountFirstName,
      accountLastName: userAccount.accountLastName,
      accountUsername: userAccount.accountUsername,
      connectionStatus: userAccount.status === 'connected' ? 'connected' : 'disconnected',
      ...(userAccount.status === 'connected' ? { lastLoginAt: userAccount.lastConnectedAt } : {}),
    });
  }

  await ensureSettings(account.id);

  return TelegramAutoReplyAccount.findByPk(account.id, {
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });
}

export async function markPersonalAccountConnection(userAccount, { connected, error = null }) {
  const account = await TelegramAutoReplyAccount.findOne({ where: { userAccountId: userAccount.id } });
  if (!account) return null;

  await account.update({
    connectionStatus: connected ? 'connected' : 'disconnected',
    lastError: error ? String(error).slice(0, 500) : null,
    ...(connected ? { lastLoginAt: new Date() } : {}),
  });

  return account;
}

export async function ensureSettings(accountId) {
  const [settings] = await TelegramAutoReplySettings.findOrCreate({
    where: { accountId },
    defaults: { accountId },
  });
  return settings;
}

export async function getOrCreateEnvAccount() {
  if (!envBotToken()) return null;

  let account = await TelegramAutoReplyAccount.findOne({ where: { provider: 'env' } });

  if (!account) {
    account = await TelegramAutoReplyAccount.create({
      ownerUserId: null,
      name: 'Virallink company bot',
      provider: 'env',
      botUsername: env.TELEGRAM_BOT_USERNAME
        ? env.TELEGRAM_BOT_USERNAME.replace(/^@/, '')
        : null,
      webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || null,
      isCompany: true,
      isActive: true,
      webhookStatus: 'active',
      lastSyncedAt: new Date(),
    });
  } else {
    const username = env.TELEGRAM_BOT_USERNAME
      ? env.TELEGRAM_BOT_USERNAME.replace(/^@/, '')
      : account.botUsername;

    if (!account.isCompany || account.botUsername !== username) {
      await account.update({ isCompany: true, botUsername: username });
    }
  }

  await ensureSettings(account.id);

  /*
   * Keep the status honest while it is wrong.
   *
   * The server bot's webhook is registered at boot by the linking subsystem, so
   * the account row cannot know about it until something checks. Refreshing it
   * here costs one call to Telegram and only while the bot is broken — once the
   * status is 'active' this stops.
   */
  if (account.webhookStatus !== 'active') {
    await syncWebhook(account, { throwOnError: false }).catch(() => {});
  }

  return account;
}

/**
 * The settings of one connection, in the shape the admin form expects.
 *
 * An account with no settings row yet still gets the model's defaults rather
 * than null: an empty form is worse than a form full of defaults, because
 * saving an empty form would wipe whatever was configured.
 */
export function serializeSettings(settings) {
  const defaults = {
    isEnabled: true,
    welcomeMessage: '',
    awayMessage: '',
    awayMode: true,
    awayCooldownMinutes: 360,
    catalogEnabled: true,
    catalogIntro: '',
    menuEnabled: false,
    menuTitle: '',
    replyToNewChats: true,
    replyToReturningChats: true,
  };

  if (!settings) return defaults;

  return {
    isEnabled: settings.isEnabled,
    welcomeMessage: settings.welcomeMessage || '',
    awayMessage: settings.awayMessage || '',
    awayMode: settings.awayMode,
    awayCooldownMinutes: settings.awayCooldownMinutes,
    catalogEnabled: settings.catalogEnabled,
    catalogIntro: settings.catalogIntro || '',
    menuEnabled: settings.menuEnabled,
    menuTitle: settings.menuTitle || '',
    replyToNewChats: settings.replyToNewChats,
    replyToReturningChats: settings.replyToReturningChats,
  };
}

/**
 * Send a message on the account's own behalf, outside the auto-reply flow.
 *
 * This is the "is it working?" button: the auto-reply only speaks when
 * somebody writes first, sends the welcome message once per chat and holds
 * the away message back for its cooldown — all of which is right for a live
 * chat and unhelpful when somebody is trying to see whether the connection
 * works at all.
 *
 * A bot sends through the Bot API with the account's token. A personal
 * account sends through its own MTProto session, so it needs the live client;
 * the caller passes it in, because the account service and this one import
 * each other.
 */
export async function sendTestMessage(account, { chatId, text, client = null }) {
  const target = Number(chatId);
  const body = String(text || '').trim();

  if (!Number.isFinite(target) || target <= 0) {
    throw AppError.badRequest('Enter the chat id to send to');
  }
  if (!body) {
    throw AppError.badRequest('Enter a message to send');
  }

  if (account.provider === 'env') {
    const token = envBotToken();
    if (!token) {
      throw AppError.badRequest('The server Telegram bot is not configured');
    }

    try {
      await botApi.sendMessage(token, target, botApi.escapeHtml(body));
      return { sent: true, via: 'bot', chatId: target };
    } catch (error) {
      throw AppError.badRequest(`Telegram refused the message: ${error.message}`);
    }
  }

  if (!client) {
    throw AppError.badRequest(
      'That Telegram account is not connected right now. Sign it in again first.',
    );
  }

  try {
    await client.sendMessage(target, { message: body });
    return { sent: true, via: 'account', chatId: target };
  } catch (error) {
    throw AppError.badRequest(`Telegram refused the message: ${error.message}`);
  }
}

export function serializeAccount(account, { includeOwner = false } = {}) {
  return {
    id: account.id,
    name: account.name,
    provider: account.provider,
    userAccountId: account.userAccountId,
    telegramBotId: account.telegramBotId,
    telegramUserId: account.telegramUserId,
    botUsername: account.botUsername,
    accountFirstName: account.accountFirstName,
    accountLastName: account.accountLastName,
    accountUsername: account.accountUsername,
    isCompany: account.isCompany,
    isActive: account.isActive,
    webhookStatus: account.webhookStatus,
    /*
     * Whether the server knows the public URL a bot's webhook can be
     * registered at. Without it a bot is marked active but receives nothing,
     * which looks like a broken bot rather than a missing setting.
     */
    webhookConfigured: Boolean(env.TELEGRAM_WEBHOOK_URL),
    connectionStatus: account.connectionStatus,
    lastError: account.lastError,
    lastSyncedAt: account.lastSyncedAt,
    lastLoginAt: account.lastLoginAt,
    settings: serializeSettings(account.settings),
    ...(includeOwner
      ? {
          owner: account.owner
            ? { id: account.owner.id, name: account.owner.name, email: account.owner.email }
            : null,
        }
      : {}),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function serializeRule(rule) {
  return {
    id: rule.id,
    accountId: rule.accountId,
    name: rule.name,
    trigger: rule.trigger,
    keywords: rule.keywords || '',
    replyText: rule.replyText || '',
    sendCatalog: rule.sendCatalog,
    imageMediaIds: normalizeMediaIds(rule.imageMediaIds),
    images: rule.images || [],
    audioMediaId: rule.audioMediaId ? Number(rule.audioMediaId) : null,
    audio: rule.audio || null,
    showMenu: Boolean(rule.showMenu),
    cooldownMinutes: rule.cooldownMinutes,
    priority: rule.priority,
    stopProcessing: rule.stopProcessing,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

/**
 * The state of one chat, as the admin sees it.
 *
 * There is no message, no name and no history in here — the auto-reply does
 * not keep a transcript of what clients write.
 */
export function serializeChatState(state) {
  if (!state) return null;

  return {
    id: state.id,
    accountId: state.accountId,
    chatId: state.chatId,
    lastReplyAt: state.lastReplyAt,
    lastAwayReplyAt: state.lastAwayReplyAt,
    lastRuleId: state.lastRuleId,
    lastRuleReplyAt: state.lastRuleReplyAt,
    isBlocked: state.isBlocked,
    autoReplyEnabled: state.autoReplyEnabled,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function serializeCatalogItem(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    price: item.price,
    currency: item.currency,
    imageMediaId: item.imageMediaId,
    image: item.image
      ? { id: item.image.id, url: item.image.url, altText: item.image.altText || null }
      : null,
    imageMediaIds: normalizeMediaIds(item.imageMediaIds),
    images: item.images || [],
    isActive: item.isActive,
    displayOrder: item.displayOrder,
  };
}

export function serializeMenuButton(button) {
  return {
    id: button.id,
    accountId: button.accountId,
    parentId: button.parentId ? Number(button.parentId) : null,
    label: button.label,
    action: button.action,
    replyText: button.replyText || '',
    url: button.url || '',
    imageMediaIds: normalizeMediaIds(button.imageMediaIds),
    images: button.images || [],
    displayOrder: button.displayOrder,
    isActive: button.isActive,
    createdAt: button.createdAt,
    updatedAt: button.updatedAt,
  };
}

/** Ordered, deduplicated media ids; Telegram albums hold at most 10 photos. */
function normalizeMediaIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= ALBUM_LIMIT) break;
  }
  return ids;
}

/**
 * A single media id, or null.
 *
 * The admin's field submits an empty string when the file was removed, which
 * means "unlink", not "leave alone" — the same convention the client logo
 * field uses.
 */
function normalizeMediaId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Resolve each row's imageMediaIds into preview objects for the admin UI. */
async function attachImages(rows) {
  const ids = [...new Set(rows.flatMap((row) => normalizeMediaIds(row.imageMediaIds)))];
  const map = new Map();
  if (ids.length) {
    const media = await Media.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'url', 'altText'],
    });
    for (const row of media) map.set(Number(row.id), row);
  }
  for (const row of rows) {
    row.images = normalizeMediaIds(row.imageMediaIds)
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((media) => ({ id: Number(media.id), url: media.url, altText: media.altText || null }));
  }

  await attachAudio(rows);
}

/**
 * Resolve each row's audio file into a preview object for the admin UI.
 *
 * The audio is a single file per rule, so this is one lookup for all the rows
 * rather than a map like the album images.
 */
async function attachAudio(rows) {
  const ids = [...new Set(rows.map((row) => Number(row.audioMediaId)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) {
    for (const row of rows) row.audio = null;
    return;
  }

  const media = await Media.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'url', 'mimeType', 'sizeBytes', 'altText'],
  });
  const map = new Map(media.map((row) => [Number(row.id), row]));

  for (const row of rows) {
    const found = row.audioMediaId ? map.get(Number(row.audioMediaId)) : null;
    row.audio = found
      ? {
          id: Number(found.id),
          url: found.url,
          mimeType: found.mimeType,
          sizeBytes: Number(found.sizeBytes || 0),
          altText: found.altText || null,
        }
      : null;
  }
}

export function webhookUrlFor(account) {
  const base = (env.TELEGRAM_WEBHOOK_URL || '').replace(/\/+$/, '');
  if (!base || !account?.id || !account?.webhookSecret) return null;
  return `${base}/api/v1/telegram/auto-reply/webhook/${account.id}/${account.webhookSecret}`;
}

/** Best-effort: the command picker is a convenience, not a requirement. */
async function registerMenuCommands(token) {
  try {
    await botApi.setMyCommands(token, MENU_COMMANDS);
  } catch (error) {
    logger.warn({ err: error.message }, 'telegram setMyCommands failed');
  }
}

export async function syncWebhook(account, { throwOnError = true } = {}) {
  /*
   * A personal account receives over MTProto. There is no webhook to register
   * and no URL to configure — it is connected by signing in.
   */
  if (account.provider === 'account') {
    await account.update({
      webhookStatus: 'active',
      lastError: null,
      lastSyncedAt: new Date(),
    });
    return account;
  }

  /*
   * The server bot from the environment.
   *
   * Its webhook belongs to the linking subsystem: `server.js` registers
   * TELEGRAM_WEBHOOK_URL at boot and forwards every update to this
   * auto-reply. Telegram keeps one webhook per bot, so registering a second,
   * different URL here would take the bot away from the route that handles
   * linking and password recovery.
   *
   * So this checks what Telegram actually has rather than pretending to set
   * it up. A bot with no webhook is marked as an error with a message that
   * says what to do, because "active but hears nothing" is the failure that
   * hides best.
   */
  if (account.provider === 'env') {
    const token = envBotToken();

    if (!token) {
      const message = 'The server Telegram bot is not configured';
      await account.update({
        webhookStatus: 'error',
        lastError: message,
        lastSyncedAt: new Date(),
      });
      if (throwOnError) throw AppError.badRequest(message);
      return account;
    }

    await registerMenuCommands(token);

    const info = await botApi.getWebhookInfo(token).catch(() => null);
    const registered = info?.url || '';

    if (!registered) {
      const message =
        'Telegram has no webhook registered for the server bot, so it cannot receive ' +
        'anything. Set TELEGRAM_WEBHOOK_URL to the public HTTPS API base, restart the API ' +
        'and sync again.';
      await account.update({
        webhookStatus: 'error',
        lastError: message,
        lastSyncedAt: new Date(),
      });
      if (throwOnError) throw AppError.badRequest(message);
      return account;
    }

    await account.update({
      webhookStatus: 'active',
      lastError: null,
      lastSyncedAt: new Date(),
    });
    return account;
  }

  /*
   * A bot connected with its own token owns its own webhook, and this is where
   * it is registered.
   */
  try {
    if (!account.webhookSecret) {
      await account.update({ webhookSecret: generateWebhookSecret() });
    }

    const url = webhookUrlFor(account);
    if (!url) {
      throw new Error(
        'Set TELEGRAM_WEBHOOK_URL to the public HTTPS API base before connecting a bot',
      );
    }

    const token = accountToken(account);
    await botApi.setWebhook(token, url, account.webhookSecret);
    await registerMenuCommands(token);

    await account.update({
      webhookStatus: 'active',
      lastError: null,
      lastSyncedAt: new Date(),
    });

    return account;
  } catch (error) {
    await account.update({
      webhookStatus: 'error',
      lastError: String(error.message || error).slice(0, 500),
      lastSyncedAt: new Date(),
    });

    if (throwOnError) throw AppError.badRequest(error.message);
    return account;
  }
}

export async function connectBot(userId, { token, name } = {}) {
  const cleanToken = String(token || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(cleanToken)) {
    throw AppError.badRequest('Enter a valid bot token from @BotFather');
  }

  if (envBotToken() && cleanToken === envBotToken()) {
    throw AppError.conflict('That token belongs to the company notification bot. Use a separate bot.');
  }

  const me = await botApi.getMe(cleanToken);
  if (!me?.is_bot || !me?.id) {
    throw AppError.badRequest('That token does not belong to a Telegram bot');
  }

  const existing = await TelegramAutoReplyAccount.findOne({
    where: { telegramBotId: me.id },
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });

  if (existing && existing.ownerUserId !== userId) {
    throw AppError.conflict('That bot is already connected to another account');
  }

  let account = existing;

  if (!account) {
    account = await TelegramAutoReplyAccount.create({
      ownerUserId: userId,
      name: String(name || me.first_name || me.username || 'Telegram bot').slice(0, 120),
      provider: 'custom',
      telegramBotId: me.id,
      botUsername: me.username || null,
      botToken: encryptToken(cleanToken),
      webhookSecret: generateWebhookSecret(),
      isCompany: false,
      isActive: true,
      webhookStatus: 'pending',
    });
  } else {
    await account.update({
      name: String(name || account.name || me.first_name || 'Telegram bot').slice(0, 120),
      botToken: encryptToken(cleanToken),
      botUsername: me.username || account.botUsername,
    });
  }

  await ensureSettings(account.id);
  await syncWebhook(account, { throwOnError: false });

  return TelegramAutoReplyAccount.findByPk(account.id, {
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });
}

export async function connectCompanyBot({ token, name } = {}) {
  const cleanToken = String(token || '').trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(cleanToken)) {
    throw AppError.badRequest('Enter a valid bot token from @BotFather');
  }

  const me = await botApi.getMe(cleanToken);
  if (!me?.is_bot || !me?.id) {
    throw AppError.badRequest('That token does not belong to a Telegram bot');
  }

  const existing = await TelegramAutoReplyAccount.findOne({ where: { telegramBotId: me.id } });
  if (existing) throw AppError.conflict('That bot is already connected');

  const account = await TelegramAutoReplyAccount.create({
    ownerUserId: null,
    name: String(name || me.first_name || me.username || 'Company bot').slice(0, 120),
    provider: 'custom',
    telegramBotId: me.id,
    botUsername: me.username || null,
    botToken: encryptToken(cleanToken),
    webhookSecret: generateWebhookSecret(),
    isCompany: true,
    isActive: true,
    webhookStatus: 'pending',
  });

  await ensureSettings(account.id);
  await syncWebhook(account, { throwOnError: false });

  return TelegramAutoReplyAccount.findByPk(account.id, {
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });
}

export async function disconnectBot(account) {
  if (account.provider === 'env') {
    throw AppError.badRequest('Disable auto-reply for the company bot instead of disconnecting it');
  }

  if (account.provider === 'account') {
    throw AppError.badRequest(
      'This is a personal Telegram login. Disconnect it from My Telegram instead of deleting it here.',
    );
  }

  try {
    await botApi.deleteWebhook(accountToken(account));
  } catch (error) {
    logger.warn({ err: error.message, accountId: account.id }, 'failed to delete telegram webhook');
  }

  await account.destroy();
  return { id: account.id, deleted: true };
}

export async function setAccountActive(account, isActive) {
  if (!isActive && account.provider === 'custom') {
    try {
      await botApi.deleteWebhook(accountToken(account));
    } catch (error) {
      logger.warn({ err: error.message, accountId: account.id }, 'failed to disable telegram webhook');
    }
  }

  await account.update({ isActive: Boolean(isActive) });

  if (isActive) await syncWebhook(account, { throwOnError: false });

  return TelegramAutoReplyAccount.findByPk(account.id, {
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });
}

export async function updateSettings(accountId, payload) {
  const settings = await ensureSettings(accountId);
  const fields = {};

  for (const field of SETTINGS_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }

  await settings.update(fields);
  return settings;
}

/* -------------------------------------------------------------------------- */
/* Reply rules                                                                */
/* -------------------------------------------------------------------------- */

export async function listRules(accountId) {
  const rules = await TelegramAutoReplyRule.findAll({
    where: { accountId },
    order: [
      ['priority', 'DESC'],
      ['id', 'ASC'],
    ],
  });

  await attachImages(rules);
  return rules.map(serializeRule);
}

export async function createRule(accountId, payload) {
  const fields = {};
  for (const field of RULE_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }
  if (fields.keywords === '') fields.keywords = null;
  if (fields.replyText === '') fields.replyText = null;
  if (fields.imageMediaIds !== undefined) fields.imageMediaIds = normalizeMediaIds(fields.imageMediaIds);
  if (fields.audioMediaId !== undefined) fields.audioMediaId = normalizeMediaId(fields.audioMediaId);

  const rule = await TelegramAutoReplyRule.create({ accountId, ...fields });
  await attachImages([rule]);
  return rule;
}

export async function updateRule(accountId, ruleId, payload) {
  const rule = await TelegramAutoReplyRule.findOne({ where: { id: ruleId, accountId } });
  if (!rule) throw AppError.notFound('Reply rule not found');

  const fields = {};
  for (const field of RULE_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }
  if (fields.keywords === '') fields.keywords = null;
  if (fields.replyText === '') fields.replyText = null;
  if (fields.imageMediaIds !== undefined) fields.imageMediaIds = normalizeMediaIds(fields.imageMediaIds);
  if (fields.audioMediaId !== undefined) fields.audioMediaId = normalizeMediaId(fields.audioMediaId);

  await rule.update(fields);
  await attachImages([rule]);
  return rule;
}

export async function deleteRule(accountId, ruleId) {
  const rule = await TelegramAutoReplyRule.findOne({ where: { id: ruleId, accountId } });
  if (!rule) throw AppError.notFound('Reply rule not found');

  const mediaIds = [...normalizeMediaIds(rule.imageMediaIds), rule.audioMediaId].filter(Boolean);

  await rule.destroy();

  // The album images and the audio went with the rule.
  await deleteUnreferencedMedia(mediaIds, {
    ignore: [{ table: 'telegram_auto_reply_rules', id: rule.id }],
  });

  return { id: Number(ruleId), deleted: true };
}

/* -------------------------------------------------------------------------- */
/* Interactive menu buttons                                                    */
/* -------------------------------------------------------------------------- */

export async function listMenuButtons(accountId) {
  const buttons = await TelegramMenuButton.findAll({
    where: { accountId },
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  await attachImages(buttons);
  return buttons.map(serializeMenuButton);
}

async function assertMenuParent(accountId, parentId, selfId = null) {
  if (parentId === null || parentId === undefined) return;
  if (selfId && Number(parentId) === Number(selfId)) {
    throw AppError.badRequest('A button cannot be its own parent');
  }

  const parent = await TelegramMenuButton.findOne({ where: { id: parentId, accountId } });
  if (!parent) throw AppError.badRequest('Parent menu button not found');
  if (parent.action !== 'submenu') {
    throw AppError.badRequest('The parent button must use the "Open a submenu" action');
  }

  let cursor = parent;
  for (let depth = 0; cursor?.parentId && depth < 10; depth += 1) {
    if (selfId && Number(cursor.parentId) === Number(selfId)) {
      throw AppError.badRequest('That nesting would create a loop in the menu');
    }
    cursor = await TelegramMenuButton.findByPk(cursor.parentId);
  }
}

function validateMenuAction(button) {
  switch (button.action) {
    case 'url':
      if (!button.url || !/^https?:\/\//i.test(String(button.url))) {
        throw AppError.badRequest('A link button needs an http(s) URL');
      }
      break;
    case 'text':
      if (!String(button.replyText || '').trim()) {
        throw AppError.badRequest('A text button needs a reply message');
      }
      break;
    case 'album':
      if (!normalizeMediaIds(button.imageMediaIds).length) {
        throw AppError.badRequest('An album button needs at least one image');
      }
      break;
    default:
      break;
  }
}

function menuButtonFields(payload) {
  const fields = {};
  for (const field of MENU_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }
  if (fields.replyText === '') fields.replyText = null;
  if (fields.url === '') fields.url = null;
  if (fields.parentId === '') fields.parentId = null;
  if (fields.imageMediaIds !== undefined) fields.imageMediaIds = normalizeMediaIds(fields.imageMediaIds);
  return fields;
}

export async function createMenuButton(accountId, payload) {
  const fields = menuButtonFields(payload);
  await assertMenuParent(accountId, fields.parentId ?? null);

  const candidate = { action: 'text', replyText: null, url: null, imageMediaIds: null, ...fields };
  validateMenuAction(candidate);

  const button = await TelegramMenuButton.create({ accountId, ...fields });
  await attachImages([button]);
  return button;
}

export async function updateMenuButton(accountId, buttonId, payload) {
  const button = await TelegramMenuButton.findOne({ where: { id: buttonId, accountId } });
  if (!button) throw AppError.notFound('Menu button not found');

  const fields = menuButtonFields(payload);
  if (fields.parentId !== undefined) await assertMenuParent(accountId, fields.parentId, buttonId);

  const candidate = { ...button.get({ plain: true }), ...fields };
  validateMenuAction(candidate);

  await button.update(fields);
  await attachImages([button]);
  return button;
}

export async function deleteMenuButton(accountId, buttonId) {
  const button = await TelegramMenuButton.findOne({ where: { id: buttonId, accountId } });
  if (!button) throw AppError.notFound('Menu button not found');

  const mediaIds = normalizeMediaIds(button.imageMediaIds);

  await button.destroy();

  // The album images went with the button.
  await deleteUnreferencedMedia(mediaIds, {
    ignore: [{ table: 'telegram_menu_buttons', id: button.id }],
  });

  return { id: Number(buttonId), deleted: true };
}

function ruleKeywords(rule) {
  return String(rule.keywords || '')
    .split(/[\n,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function ruleMatches(rule, { text, isNew }) {
  const haystack = String(text || '').trim();
  const lower = haystack.toLowerCase();

  switch (rule.trigger) {
    case 'any':
      return true;
    case 'new_chat':
      return isNew;
    case 'returning_chat':
      return !isNew;
    case 'keyword': {
      const keywords = ruleKeywords(rule).map((keyword) => keyword.toLowerCase());
      return keywords.some((keyword) => lower.includes(keyword));
    }
    case 'exact': {
      const keywords = ruleKeywords(rule).map((keyword) => keyword.toLowerCase());
      return keywords.some((keyword) => lower === keyword);
    }
    case 'regex': {
      const pattern = String(rule.keywords || '').trim();
      if (!pattern) return false;
      try {
        return new RegExp(pattern, 'i').test(haystack);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Pick the rules that should answer this message.
 *
 * Rules run highest priority first. A rule with `stopProcessing` ends the list,
 * which is what makes "answer a price question with the catalog, otherwise fall
 * through to the default plan" expressible without writing conditions in code.
 * Cooldowns are tracked per chat against the last matching rule so one
 * chat cannot be spammed by the same automatic answer.
 */
export async function matchRules(accountId, { text, isNew, state, now = new Date() }) {
  const rules = await TelegramAutoReplyRule.findAll({
    where: { accountId, isActive: true },
    order: [
      ['priority', 'DESC'],
      ['id', 'ASC'],
    ],
  });

  if (!rules.length) return [];

  const lastRuleId = state?.lastRuleId ? Number(state.lastRuleId) : null;
  const lastRuleAt = state?.lastRuleReplyAt
    ? new Date(state.lastRuleReplyAt).getTime()
    : 0;

  const matched = [];

  for (const rule of rules) {
    if (!ruleMatches(rule, { text, isNew })) continue;

    const cooldownMs = Math.max(Number(rule.cooldownMinutes) || 0, 0) * 60000;
    if (cooldownMs > 0 && lastRuleId === Number(rule.id)) {
      if (now.getTime() - lastRuleAt < cooldownMs) continue;
    }

    matched.push(rule);
    if (rule.stopProcessing) break;
  }

  return matched;
}

export async function listAccounts({ userId, canManage = false } = {}) {
  await getOrCreateEnvAccount();

  const where = canManage ? {} : { ownerUserId: userId };
  const accounts = await TelegramAutoReplyAccount.findAll({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      { model: TelegramAutoReplySettings, as: 'settings' },
    ],
    order: [
      ['isCompany', 'DESC'],
      ['createdAt', 'ASC'],
    ],
  });

  return accounts.map((account) =>
    serializeAccount(account, { includeOwner: canManage }),
  );
}

export async function getOwnedAccount(userId, accountId) {
  const account = await TelegramAutoReplyAccount.findOne({
    where: { id: accountId, ownerUserId: userId },
    include: [{ model: TelegramAutoReplySettings, as: 'settings' }],
  });
  if (!account) throw AppError.notFound('Telegram bot not found');
  return account;
}

export async function getAccount(accountId) {
  const account = await TelegramAutoReplyAccount.findByPk(accountId, {
    include: [
      { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      { model: TelegramAutoReplySettings, as: 'settings' },
    ],
  });
  if (!account) throw AppError.notFound('Telegram bot not found');
  return account;
}

/**
 * The chats that are blocked, and the chats that have auto-reply switched off.
 *
 * This is the only chat list the admin sees, and it is deliberately thin: a
 * chat id and two switches. There is no transcript, no name and no history —
 * the auto-reply does not keep one.
 */
export async function listBlockedChats({ accountId, userId, canManage = false }) {
  const where = {};

  if (accountId) {
    if (!canManage) await getOwnedAccount(userId, accountId);
    where.accountId = accountId;
  } else if (!canManage) {
    const accounts = await TelegramAutoReplyAccount.findAll({
      where: { ownerUserId: userId },
      attributes: ['id'],
    });
    if (!accounts.length) return [];
    where.accountId = { [Op.in]: accounts.map((account) => account.id) };
  }

  where[Op.or] = [{ isBlocked: true }, { autoReplyEnabled: false }];

  const rows = await TelegramAutoReplyChatState.findAll({
    where,
    attributes: ['id', 'accountId', 'chatId', 'isBlocked', 'autoReplyEnabled', 'lastReplyAt', 'lastAwayReplyAt'],
    order: [['updatedAt', 'DESC']],
    limit: 200,
  });

  return rows.map(serializeChatState);
}

/**
 * Block a chat, or switch its auto-reply off.
 *
 * The chat id is all that is needed — nothing about the person is kept.
 */
export async function setChatBlocked(accountId, chatId, { isBlocked, autoReplyEnabled }) {
  const id = Number(chatId);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest('Enter a valid chat id');

  const fields = {};
  if (isBlocked !== undefined) fields.isBlocked = Boolean(isBlocked);
  if (autoReplyEnabled !== undefined) fields.autoReplyEnabled = Boolean(autoReplyEnabled);

  if (!Object.keys(fields).length) {
    throw AppError.badRequest('Say what to change');
  }

  const [state] = await TelegramAutoReplyChatState.findOrCreate({
    where: { accountId, chatId: id },
    defaults: { accountId, chatId: id },
  });

  await state.update(fields);
  return serializeChatState(state);
}

export async function listCatalog({ activeOnly = false } = {}) {
  const items = await TelegramCatalogItem.findAll({
    where: activeOnly ? { isActive: true } : {},
    include: [{ model: Media, as: 'image' }],
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  await attachImages(items);
  return items.map(serializeCatalogItem);
}

export async function createCatalogItem(payload) {
  const fields = {};
  for (const field of CATALOG_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }
  if (fields.price === '') fields.price = null;
  if (fields.description === '') fields.description = null;
  if (fields.imageMediaId === '') fields.imageMediaId = null;
  if (fields.imageMediaIds !== undefined) fields.imageMediaIds = normalizeMediaIds(fields.imageMediaIds);

  const item = await TelegramCatalogItem.create(fields);
  const created = await TelegramCatalogItem.findByPk(item.id, { include: [{ model: Media, as: 'image' }] });
  await attachImages([created]);
  return created;
}

export async function updateCatalogItem(id, payload) {
  const item = await TelegramCatalogItem.findByPk(id);
  if (!item) throw AppError.notFound('Catalog item not found');

  const fields = {};
  for (const field of CATALOG_FIELDS) {
    if (payload[field] !== undefined) fields[field] = payload[field];
  }
  if (fields.price === '') fields.price = null;
  if (fields.description === '') fields.description = null;
  if (fields.imageMediaId === '') fields.imageMediaId = null;
  if (fields.imageMediaIds !== undefined) fields.imageMediaIds = normalizeMediaIds(fields.imageMediaIds);

  await item.update(fields);
  const updated = await TelegramCatalogItem.findByPk(item.id, { include: [{ model: Media, as: 'image' }] });
  await attachImages([updated]);
  return updated;
}

export async function deleteCatalogItem(id) {
  const item = await TelegramCatalogItem.findByPk(id);
  if (!item) throw AppError.notFound('Catalog item not found');

  const mediaIds = [item.imageMediaId, ...normalizeMediaIds(item.imageMediaIds)].filter(Boolean);

  await item.destroy();

  // The images went with the item: nothing else points at them.
  await deleteUnreferencedMedia(mediaIds, {
    ignore: [{ table: 'telegram_catalog_items', id: item.id }],
  });

  return { id: Number(id), deleted: true };
}

function absoluteMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith('/')) return null;
  return `${env.SITE_URL.replace(/\/+$/, '')}${url}`;
}

/**
 * The extension each audio type is uploaded and sent under.
 *
 * Kept in step with the media service, which decides the stored extension from
 * the same list.
 */
const AUDIO_FILE_EXTENSIONS = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

function formatPrice(price, currency) {
  if (price === null || price === undefined || price === '') return 'Price on request';
  const numeric = Number(price);
  if (!Number.isFinite(numeric)) return 'Price on request';

  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: currency || 'ETB',
    minimumFractionDigits: 2,
  }).format(numeric);
}

function catalogCaption(item) {
  const lines = [`<b>${botApi.escapeHtml(item.name)}</b>`];

  if (item.description) {
    lines.push(botApi.escapeHtml(String(item.description).slice(0, 700)));
  }

  lines.push(`<b>${botApi.escapeHtml(formatPrice(item.price, item.currency))}</b>`);
  return lines.join('\n');
}

async function sendText(token, chatId, text) {
  if (!text) return false;
  try {
    await botApi.sendMessage(token, chatId, botApi.escapeHtml(text));
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId }, 'telegram auto-reply text failed');
    return false;
  }
}

/** Public URLs for the given media ids, in the admin's chosen order. */
async function mediaUrlsFor(mediaIds) {
  const ids = normalizeMediaIds(mediaIds);
  if (!ids.length) return [];

  const media = await Media.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'url'],
  });
  const map = new Map(media.map((row) => [Number(row.id), row]));
  return ids.map((id) => absoluteMediaUrl(map.get(id)?.url)).filter(Boolean);
}

/** Download a media URL into a named blob so teleproto treats it as a photo
 *  (its isImage check only recognises .png/.jpg/.jpeg extensions) instead of
 *  an unnamed document. */
async function fetchMediaBuffer(url) {
  const absolute = absoluteMediaUrl(url);
  if (!absolute) return null;
  try {
    const response = await fetch(absolute);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      name: 'photo.jpg',
      size: buffer.length,
      arrayBuffer: async () => buffer,
    };
  } catch (error) {
    logger.warn({ err: error.message, url: absolute }, 'telegram personal media fetch failed');
    return null;
  }
}

/**
 * Download an audio file into a named blob.
 *
 * Unlike the photo path, the name has to keep the real extension: teleproto
 * decides what kind of message to send from the file name, and a `.ogg` it
 * cannot recognise becomes an unnamed document instead of a voice note.
 */
async function fetchAudioBuffer(url, mimeType) {
  const absolute = absoluteMediaUrl(url);
  if (!absolute) return null;

  const extension = AUDIO_FILE_EXTENSIONS[mimeType] || 'mp3';

  try {
    const response = await fetch(absolute);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      name: `audio.${extension}`,
      size: buffer.length,
      arrayBuffer: async () => buffer,
    };
  } catch (error) {
    logger.warn({ err: error.message, url: absolute }, 'telegram personal audio fetch failed');
    return null;
  }
}

/**
 * Send a photo album (2-10 images in one Telegram media group). A single image
 * falls back to sendPhoto so captions keep working; with no images the caption
 * is sent as plain text instead of dropping the reply entirely.
 */
async function sendAlbum(token, chatId, mediaIds, caption = '') {
  const urls = await mediaUrlsFor(mediaIds);
  if (!urls.length) {
    return caption && (await sendText(token, chatId, caption)) ? 1 : 0;
  }

  try {
    if (urls.length === 1) {
      await botApi.sendPhoto(token, chatId, urls[0], caption || undefined);
    } else {
      await botApi.sendMediaGroup(
        token,
        chatId,
        urls.map((url, index) => ({ url, caption: index === 0 ? caption || undefined : undefined })),
      );
    }
    return 1;
  } catch (error) {
    logger.warn({ err: error.message, chatId }, 'telegram album failed');
    return caption && (await sendText(token, chatId, caption)) ? 1 : 0;
  }
}

/**
 * Send the rule's audio file to a bot chat.
 *
 * An OGG/Opus file is sent as a voice note — the round bubble in the chat.
 * Anything else is sent as an audio file with a play button.
 *
 * Telegram fetches the file itself, so the media has to be reachable from the
 * public internet. That is the same constraint the photo album has always
 * had; on a local setup the API cannot reach the site, so the audio is skipped
 * rather than failing the reply.
 */
async function sendAudioFile(token, chatId, mediaId) {
  const media = await Media.findOne({
    where: { id: mediaId },
    attributes: ['id', 'url', 'mimeType'],
  });

  if (!media) return false;

  const url = absoluteMediaUrl(media.url);
  if (!url) return false;

  try {
    if (media.mimeType === 'audio/ogg' || media.mimeType === 'audio/webm') {
      await botApi.sendVoice(token, chatId, url);
    } else {
      await botApi.sendAudio(token, chatId, url, { title: 'Virallink' });
    }
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId, mediaId }, 'telegram auto-reply audio failed');
    return false;
  }
}

/**
 * Send the rule's audio file from a personal Telegram account.
 *
 * The personal transport uploads the bytes itself rather than handing Telegram
 * a URL, so a file on a local disk still works.
 */
async function sendAccountAudio(client, chatId, mediaId) {
  const media = await Media.findOne({
    where: { id: mediaId },
    attributes: ['id', 'url', 'mimeType'],
  });

  if (!media) return false;

  const buffer = await fetchAudioBuffer(media.url, media.mimeType);
  if (!buffer) {
    logger.warn({ chatId, mediaId }, 'telegram personal audio could not be fetched');
    return false;
  }

  try {
    await client.sendFile(chatId, {
      file: buffer,
      // OGG/Opus is sent as a voice note; everything else as an audio file.
      voiceNote: media.mimeType === 'audio/ogg',
      forceDocument: false,
    });
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId, mediaId }, 'telegram personal auto-reply audio failed');
    return false;
  }
}

async function sendCatalog(token, chatId, { intro, items }) {
  let sent = 0;

  if (intro) {
    if (await sendText(token, chatId, intro)) sent += 1;
  }

  for (const item of items.slice(0, CATALOG_LIMIT)) {
    const caption = catalogCaption(item);
    const albumUrls = await mediaUrlsFor(item.imageMediaIds);
    const imageUrl = absoluteMediaUrl(item.image?.url);

    try {
      if (albumUrls.length > 1) {
        await botApi.sendMediaGroup(
          token,
          chatId,
          albumUrls.map((url, index) => ({ url, caption: index === 0 ? caption : undefined })),
        );
      } else if (imageUrl) {
        await botApi.sendPhoto(token, chatId, imageUrl, caption);
      } else {
        await botApi.sendMessage(token, chatId, caption);
      }
      sent += 1;
    } catch (error) {
      logger.warn({ err: error.message, chatId, itemId: item.id }, 'telegram catalog item failed');

      // Fall back to the single image, then to text, so a failed album does not
      // drop the item entirely.
      let recovered = false;
      if (albumUrls.length > 1 && imageUrl) {
        try {
          await botApi.sendPhoto(token, chatId, imageUrl, caption);
          recovered = true;
        } catch (photoError) {
          logger.warn({ err: photoError.message, chatId, itemId: item.id }, 'telegram catalog single-photo fallback failed');
        }
      }
      if (!recovered) {
        try {
          await botApi.sendMessage(token, chatId, caption);
          recovered = true;
        } catch (fallbackError) {
          logger.warn({ err: fallbackError.message, chatId, itemId: item.id }, 'telegram catalog text fallback failed');
        }
      }
      if (recovered) sent += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  return sent;
}

/* -------------------------------------------------------------------------- */
/* Interactive menus                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The transport-neutral view of one menu level: a title, the active buttons at
 * that level, and where a "Back" button should point. Both the Bot API and the
 * MTProto senders render this same structure.
 */
export async function getMenuView(accountId, settings, parentId = null) {
  const buttons = await TelegramMenuButton.findAll({
    where: { accountId, isActive: true, parentId: parentId ?? null },
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (!buttons.length) return null;

  let title = String(settings?.menuTitle || '').trim() || MENU_DEFAULT_TITLE;
  let backTarget = null;

  if (parentId) {
    const parent = await TelegramMenuButton.findByPk(parentId);
    if (parent) {
      title = String(parent.replyText || '').trim() || parent.label;
      backTarget = parent.parentId ? `menu:${parent.parentId}` : 'menu:home';
    }
  }

  return { title: title.slice(0, 1000), buttons, backTarget };
}

function chunkRows(items, size = 2) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function menuCallbackData(button) {
  return button.action === 'menu' ? 'menu:home' : `menu:${button.id}`;
}

async function sendBotMenu(token, chatId, accountId, settings, { parentId = null, editMessageId = null } = {}) {
  const view = await getMenuView(accountId, settings, parentId);
  if (!view) {
    logger.info({ accountId, chatId, parentId }, 'telegram menu skipped: no active buttons');
    return false;
  }

  const rows = chunkRows(
    view.buttons.map((button) =>
      button.action === 'url'
        ? { text: button.label, url: button.url }
        : { text: button.label, callback_data: menuCallbackData(button) },
    ),
  );
  if (view.backTarget) rows.push([{ text: '← Back', callback_data: view.backTarget }]);
  const replyMarkup = { inline_keyboard: rows };
  const text = botApi.escapeHtml(view.title);

  try {
    if (editMessageId) {
      await botApi.editMessageText(token, chatId, editMessageId, text, { replyMarkup });
    } else {
      await botApi.sendMessage(token, chatId, text, { replyMarkup });
    }
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId, accountId }, 'telegram menu send failed');
    if (!editMessageId) return false;

    try {
      await botApi.sendMessage(token, chatId, text, { replyMarkup });
      return true;
    } catch (fallbackError) {
      logger.warn({ err: fallbackError.message, chatId }, 'telegram menu fallback failed');
      return false;
    }
  }
}

/**
 * Decode a `menu:` callback payload. Shared by both transports so a button
 * behaves identically whether it is tapped on a bot or a personal account.
 */
export async function resolveMenuTarget(accountId, data) {
  const value = String(data || '');
  if (!value.startsWith('menu:')) return null;
  if (value === 'menu:home') return { kind: 'home' };

  const buttonId = Number(value.slice('menu:'.length));
  if (!Number.isInteger(buttonId) || buttonId <= 0) return null;

  const button = await TelegramMenuButton.findOne({
    where: { id: buttonId, accountId, isActive: true },
  });
  if (!button) return null;
  if (button.action === 'submenu') return { kind: 'submenu', button };
  if (button.action === 'menu') return { kind: 'home' };
  return { kind: 'action', button };
}

/** Run a tapped button's action through the injected transport functions. */
async function dispatchMenuButton(button, { sendText, sendCatalog, sendAlbum, catalogIntro = '' }) {
  switch (button.action) {
    case 'catalog': {
      const items = await listCatalog({ activeOnly: true });
      return items.length ? sendCatalog({ intro: catalogIntro, items }) : 0;
    }
    case 'text':
      return (await sendText(button.replyText)) ? 1 : 0;
    case 'album':
      return sendAlbum(normalizeMediaIds(button.imageMediaIds), button.replyText || '');
    case 'url':
      return button.url && (await sendText(button.url)) ? 1 : 0;
    default:
      return 0;
  }
}

const CATALOG_INTENT = /(price|prices|cost|catalog|menu|product|products|service|services|offer|ዋጋ|ዝርዝር|አገልግሎት|ምርት)/i;

/**
 * When the away message may be sent in a chat again.
 *
 * The away message is the auto-reply's fallback for a chat no rule answers,
 * and it is throttled per chat so a chatty visitor cannot be flooded. That
 * throttle is also the reason a person testing the away message sees nothing
 * for hours, so the state is computed in one place and shown in the admin.
 *
 * `blocked` is false when there is no cooldown at all (0 minutes) — the away
 * message then answers every unanswered message.
 */
export function awayCooldownState(state, settings, now = new Date()) {
  const cooldownMinutes = Math.max(Number(settings?.awayCooldownMinutes) || 0, 0);
  const cooldownMs = cooldownMinutes * 60000;
  const lastSentAt = state?.lastAwayReplyAt ? new Date(state.lastAwayReplyAt) : null;
  const lastMs = lastSentAt ? lastSentAt.getTime() : 0;
  const nextAllowedAt = lastMs ? new Date(lastMs + cooldownMs) : null;

  return {
    cooldownMinutes,
    lastSentAt: lastSentAt ? lastSentAt.toISOString() : null,
    nextAllowedAt: nextAllowedAt ? nextAllowedAt.toISOString() : null,
    blocked: nextAllowedAt ? now.getTime() < nextAllowedAt.getTime() : false,
  };
}

/**
 * What the auto-reply would do with a message, without sending anything.
 *
 * The admin needs this because the auto-reply is deliberately quiet: a
 * message that gets no answer is usually correct, and "nothing happened" is
 * indistinguishable from "broken" unless the reason is spelled out.
 *
 * It mirrors the decision the handlers make, using the same matcher
 * (`matchRules`) and the same cooldown helper, so what it says is what the
 * auto-reply would do.
 */
export async function previewReply(accountId, { chatId = null, text = null, now = new Date() }) {
  const settings = await ensureSettings(accountId);

  let state = null;
  if (chatId) {
    state = await TelegramAutoReplyChatState.findOne({
      where: { accountId: accountId, chatId: Number(chatId) },
    });
  }

  /*
   * The message to test.
   *
   * Nothing that a client wrote is stored, so the preview cannot read back
   * what they last said — the administrator supplies it. That is also the
   * better way to test: type the message you expect and see what it triggers.
   */
  const messageText = String(text ?? '').trim();

  const isNew = !state;
  const rules = messageText
    ? await matchRules(accountId, { text: messageText, isNew, state, now })
    : [];
  const catalogItems = settings.catalogEnabled ? await listCatalog({ activeOnly: true }) : [];

  const plan = {
    kind: 'none',
    rule: null,
    parts: [],
    blockedBy: null,
    away: null,
  };

  if (!messageText) {
    /*
     * Nothing to test. The chat's own state still decides what would happen
     * when it writes.
     */
    plan.kind = isNew ? 'new_chat' : 'none';
    if (isNew) {
      if (settings.welcomeMessage) {
        plan.parts.push({ type: 'text', label: 'Welcome message', text: settings.welcomeMessage });
      }
      if (settings.catalogEnabled && catalogItems.length) {
        plan.parts.push({ type: 'catalog', label: 'Catalog', count: catalogItems.length });
      }
      plan.blockedBy = 'Type a message to test. This chat has not written before, so its first message would be treated as a new chat.';
    } else {
      plan.blockedBy = 'Type a message to test what this chat would be answered with.';
    }
    return { plan, chat: serializeChatState(state), settings };
  }

  if (state?.isBlocked) {
    plan.kind = 'blocked';
    plan.blockedBy = 'This chat is blocked.';
    return { plan, chat: serializeChatState(state), settings };
  }

  if (state?.autoReplyEnabled === false) {
    plan.kind = 'disabled';
    plan.blockedBy = 'Auto-reply is switched off for this chat.';
    return { plan, chat: serializeChatState(state), settings };
  }

  if (isNew && !settings.replyToNewChats) {
    plan.kind = 'new_chats_disabled';
    plan.blockedBy = 'The account does not answer new chats.';
    return { plan, chat: serializeChatState(state), settings };
  }

  if (!isNew && !settings.replyToReturningChats) {
    plan.kind = 'returning_chats_disabled';
    plan.blockedBy = 'The account does not answer chats that already spoke to it.';
    return { plan, chat: serializeChatState(state), settings };
  }

  if (rules.length) {
    const rule = rules[0];
    plan.kind = 'rule';
    plan.rule = {
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      keywords: rule.keywords || '',
    };
    if (rule.replyText) plan.parts.push({ type: 'text', label: 'Reply text', text: rule.replyText });
    if (normalizeMediaIds(rule.imageMediaIds).length) {
      plan.parts.push({
        type: 'album',
        label: 'Image album',
        count: normalizeMediaIds(rule.imageMediaIds).length,
      });
    }
    if (rule.audioMediaId) plan.parts.push({ type: 'audio', label: 'Audio' });
    if (rule.sendCatalog && catalogItems.length) {
      plan.parts.push({ type: 'catalog', label: 'Catalog', count: catalogItems.length });
    }
    if (rule.showMenu) plan.parts.push({ type: 'menu', label: 'Chat menu' });
    return { plan, chat: serializeChatState(state), settings };
  }

  if (isNew) {
    plan.kind = 'new_chat';
    if (settings.welcomeMessage) {
      plan.parts.push({ type: 'text', label: 'Welcome message', text: settings.welcomeMessage });
    }
    if (settings.catalogEnabled && catalogItems.length) {
      plan.parts.push({ type: 'catalog', label: 'Catalog', count: catalogItems.length });
    }
    if (settings.awayMode && settings.awayMessage) {
      plan.parts.push({ type: 'text', label: 'Away message', text: settings.awayMessage });
    }
    if (!plan.parts.length) plan.blockedBy = 'Nothing is configured for a new chat.';
    return { plan, chat: serializeChatState(state), settings };
  }

  if (settings.catalogEnabled && CATALOG_INTENT.test(messageText)) {
    plan.kind = 'catalog';
    if (catalogItems.length) {
      plan.parts.push({ type: 'catalog', label: 'Catalog', count: catalogItems.length });
    } else {
      plan.blockedBy = 'The catalogue is empty.';
    }
    return { plan, chat: serializeChatState(state), settings };
  }

  if (settings.awayMode && settings.awayMessage) {
    plan.kind = 'away';
    plan.away = awayCooldownState(state, settings, now);
    if (plan.away.blocked) {
      plan.blockedBy = `The away message is on cooldown until ${plan.away.nextAllowedAt}.`;
    } else {
      plan.parts.push({ type: 'text', label: 'Away message', text: settings.awayMessage });
    }
    return { plan, chat: serializeChatState(state), settings };
  }

  plan.kind = 'none';
  plan.blockedBy = 'Nothing matches this message — no rule, and the away message is off.';
  return { plan, chat: serializeChatState(state), settings };
}

/**
 * Let the away message answer again in a chat.
 *
 * The cooldown exists so a chatty visitor is not flooded, but it also means a
 * person testing the away message waits hours for the next one. This clears
 * the timestamp so the next message in that chat is answered.
 */
export async function resetAwayCooldown(accountId, { chatId = null } = {}) {
  const where = { accountId };
  if (chatId) where.chatId = Number(chatId);

  const [rows] = await TelegramAutoReplyChatState.update(
    { lastAwayReplyAt: null },
    { where },
  );

  return { cleared: rows ?? 0, chatId: chatId ? Number(chatId) : null };
}

/**
 * Record that a chat spoke, and return its state.
 *
 * Nothing that was written is kept. The row holds the timestamps the
 * auto-reply needs — the away cooldown, a rule's cooldown, the gap between
 * two replies — the two per-chat switches, and Telegram's own message id so a
 * retried update is not answered twice.
 *
 * Shared by the Bot API webhook and the personal-account listener so both
 * transports keep the same "new chat" semantics. Returns null when a
 * duplicate update arrives (Telegram retries webhooks) or when the upsert
 * raced another process.
 */
async function recordChatState(account, chat, messageId, now) {
  let state = await TelegramAutoReplyChatState.findOne({
    where: { accountId: account.id, chatId: chat.id },
  });

  const isNew = !state;

  if (state) {
    const lastId = Number(state.lastTelegramMessageId);
    if (Number.isFinite(messageId) && Number.isFinite(lastId) && messageId <= lastId) {
      return null;
    }
  }

  const stateFields = {
    lastTelegramMessageId: Number.isFinite(messageId) ? messageId : null,
  };

  try {
    if (state) {
      await state.update(stateFields);
    } else {
      state = await TelegramAutoReplyChatState.create({
        accountId: account.id,
        chatId: chat.id,
        ...stateFields,
      });
    }
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      state = await TelegramAutoReplyChatState.findOne({
        where: { accountId: account.id, chatId: chat.id },
      });
      if (!state) return null;
      await state.update(stateFields);
    } else {
      throw error;
    }
  }

  return { state, isNew };
}

/**
 * Aggregate analytics. Counts only — no chat id, sender, username or message
 * text. Each incoming message contributes one `incoming` event and one outcome
 * event, so the admin can see how much the auto-reply did and where it stayed
 * quiet without any transcript being stored.
 */
export const ANALYTICS_CATEGORIES = Object.freeze({
  INCOMING: 'incoming',
  RULE: 'rule',
  MENU: 'menu',
  WELCOME: 'welcome',
  CATALOG: 'catalog',
  AWAY: 'away',
  SILENCE: 'silence',
  BLOCKED: 'blocked',
  DISABLED: 'disabled',
  INTERVAL: 'interval',
  NEW_CHATS_OFF: 'new_chats_off',
  RETURNING_CHATS_OFF: 'returning_chats_off',
});

const REPLY_CATEGORIES = new Set([
  ANALYTICS_CATEGORIES.RULE,
  ANALYTICS_CATEGORIES.MENU,
  ANALYTICS_CATEGORIES.WELCOME,
  ANALYTICS_CATEGORIES.CATALOG,
  ANALYTICS_CATEGORIES.AWAY,
]);

function analyticsDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Increment today's aggregate row. Best effort: a metrics failure must never
 * stop a reply from being sent, so errors are logged and swallowed.
 */
export async function recordAnalytics(accountId, category, { ruleId = null, sent = 0, now = new Date() } = {}) {
  const bucketDate = analyticsDay(now);
  const normalizedRuleId = Number(ruleId) > 0 ? Number(ruleId) : 0;
  const values = {
    eventCount: 1,
    sentCount: Math.max(0, Number(sent) || 0),
  };

  try {
    const [row, created] = await TelegramAutoReplyMetric.findOrCreate({
      where: { accountId, bucketDate, category, ruleId: normalizedRuleId },
      defaults: values,
    });
    if (!created) await row.increment(values);
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      // Two Passenger workers can race the upsert. Retry the increment once.
      try {
        const row = await TelegramAutoReplyMetric.findOne({
          where: { accountId, bucketDate, category, ruleId: normalizedRuleId },
        });
        if (row) await row.increment(values);
        return;
      } catch {
        // Fall through to the warning below.
      }
    }
    logger.warn({ accountId, category, err: error?.message }, 'telegram analytics skipped');
  }
}

/**
 * Read aggregate analytics for one account. Returns totals, a daily series and
 * the most-used rules. Rule names are joined from the rule table, never from a
 * message — no free text ever enters this response.
 */
export async function getAnalytics(accountId, { days = 30 } = {}) {
  const windowDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const today = analyticsDay(new Date());
  const from = new Date(Date.now() - (windowDays - 1) * 86400000).toISOString().slice(0, 10);

  const rows = await TelegramAutoReplyMetric.findAll({
    where: { accountId, bucketDate: { [Op.gte]: from } },
    order: [
      ['bucketDate', 'ASC'],
      ['category', 'ASC'],
      ['ruleId', 'ASC'],
    ],
    raw: true,
  });

  const totals = { messages: 0, replies: 0, silent: 0, ruleReplies: 0 };
  const daily = new Map();
  const ruleTotals = new Map();

  for (const row of rows) {
    const date = String(row.bucketDate).slice(0, 10);
    const events = Number(row.eventCount) || 0;
    const sent = Number(row.sentCount) || 0;
    const category = row.category;

    if (!daily.has(date)) daily.set(date, { date, messages: 0, replies: 0, silent: 0 });
    const bucket = daily.get(date);

    if (category === ANALYTICS_CATEGORIES.INCOMING) {
      totals.messages += events;
      bucket.messages += events;
    } else {
      totals.replies += sent;
      bucket.replies += sent;
      if (sent === 0) {
        totals.silent += events;
        bucket.silent += events;
      }
      if (category === ANALYTICS_CATEGORIES.RULE) totals.ruleReplies += events;
    }

    const ruleId = Number(row.ruleId) || 0;
    if (ruleId > 0 && REPLY_CATEGORIES.has(category)) {
      if (!ruleTotals.has(ruleId)) ruleTotals.set(ruleId, { ruleId, events: 0, replies: 0 });
      const entry = ruleTotals.get(ruleId);
      entry.events += events;
      entry.replies += sent;
    }
  }

  const ruleIds = [...ruleTotals.keys()];
  const rules = ruleIds.length
    ? await TelegramAutoReplyRule.findAll({
        where: { id: ruleIds },
        attributes: ['id', 'name'],
        raw: true,
      })
    : [];
  const names = new Map(rules.map((rule) => [Number(rule.id), rule.name]));

  const topRules = [...ruleTotals.values()]
    .map((entry) => ({ ...entry, name: names.get(entry.ruleId) || `Rule ${entry.ruleId}` }))
    .sort((a, b) => b.events - a.events || a.ruleId - b.ruleId)
    .slice(0, 10);

  return {
    window: { days: windowDays, from, to: today },
    totals,
    daily: [...daily.values()],
    topRules,
  };
}

/**
 * Send the action list produced by a matched rule.
 *
 * The send functions are injected so the same rule engine works for a bot token
 * and for an MTProto client without branching inside it. `captionOnAlbum` is
 * enabled only for personal accounts: their rule reply text is attached to the
 * image as a caption instead of arriving as a separate message. Bot behaviour
 * stays unchanged until we deliberately work on it.
 */
async function runMatchedRules(
  rules,
  { sendText, sendCatalog, sendAlbum, sendAudio, sendMenu, catalogIntro = '', captionOnAlbum = false },
) {
  let sent = 0;
  let lastRule = null;

  for (const rule of rules) {
    const albumIds = normalizeMediaIds(rule.imageMediaIds);
    const captionOnImage = captionOnAlbum && albumIds.length > 0 && Boolean(sendAlbum);

    if (albumIds.length && sendAlbum) {
      sent += await sendAlbum(albumIds, captionOnImage ? rule.replyText || '' : '');
    }

    // With images on a personal account the reply text is the image caption;
    // sending it here too would duplicate it. sendAlbum falls back to plain
    // text itself when no image can be delivered.
    if (rule.replyText && !captionOnImage) {
      if (await sendText(rule.replyText)) sent += 1;
    }

    // The voice note or sound bite, after the text and the album.
    if (rule.audioMediaId && sendAudio) {
      if (await sendAudio(rule.audioMediaId)) sent += 1;
    }

    if (rule.sendCatalog) {
      const items = await listCatalog({ activeOnly: true });
      if (items.length) {
        sent += await sendCatalog({ intro: catalogIntro, items });
      }
    }

    if (rule.showMenu && sendMenu) {
      if (await sendMenu()) sent += 1;
    }

    lastRule = rule;
  }

  return { sent, lastRule };
}

export async function handleAutoReplyUpdate(update, account) {
  if (!account?.isActive) return;

  const message = update?.message;
  if (!message || message.from?.is_bot) return;

  const chat = message.chat;
  if (!chat?.id || chat.type !== 'private') return;

  let text = String(message.text || message.caption || '').trim();
  if (!text) return;

  let isMenuCommand = false;
  if (text.startsWith('/')) {
    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    if (command === '/start') {
      text = text.slice('/start'.length).trim() || 'start';
    } else if (command === '/menu') {
      isMenuCommand = true;
      text = '/menu';
    } else {
      return;
    }
  }

  const settings = await ensureSettings(account.id);
  if (!settings.isEnabled) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.DISABLED);
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) skipped: auto-reply disabled');
    return;
  }

  const now = new Date();
  await recordAnalytics(account.id, ANALYTICS_CATEGORIES.INCOMING, { now });
  const messageId = Number(message.message_id);
  logger.info(
    {
      accountId: account.id,
      chatId: chat.id,
      fromId: message.from?.id,
      fromUsername: message.from?.username,
      messageId,
      text: text.slice(0, 200),
      isMenuCommand,
    },
    'telegram auto-reply (bot) incoming message',
  );
  const recorded = await recordChatState(account, chat, messageId, now);

  if (!recorded) return;

  const { state, isNew } = recorded;

  if (state.isBlocked || state.autoReplyEnabled === false) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.BLOCKED, { now });
    logger.info(
      { accountId: account.id, chatId: chat.id, isBlocked: state.isBlocked, autoReplyEnabled: state.autoReplyEnabled },
      'telegram auto-reply (bot) skipped: chat blocked or auto-reply off',
    );
    return;
  }
  if (isNew && !settings.replyToNewChats) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.NEW_CHATS_OFF, { now });
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) skipped: new chats disabled');
    return;
  }
  if (!isNew && !settings.replyToReturningChats) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.RETURNING_CHATS_OFF, { now });
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) skipped: returning chats disabled');
    return;
  }

  if (
    !isNew &&
    state.lastReplyAt &&
    now.getTime() - new Date(state.lastReplyAt).getTime() < MIN_REPLY_INTERVAL_MS
  ) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.INTERVAL, { now });
    logger.info(
      { accountId: account.id, chatId: chat.id },
      'telegram auto-reply (bot) skipped: reply interval not elapsed',
    );
    return;
  }

  const token = accountToken(account);
  let sent = 0;
  let awaySent = false;
  let silenceReason = null;
  let outcome = ANALYTICS_CATEGORIES.SILENCE;

  if (isMenuCommand) {
    let menuSent = false;
    if (await sendBotMenu(token, chat.id, account.id, settings)) {
      menuSent = true;
      await state.update({ lastReplyAt: now });
      logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) menu command handled');
    } else {
      await sendText(token, chat.id, 'No chat menu is configured for this account yet.');
      logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) menu command could not be shown (no buttons or send failed)');
    }
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.MENU, { sent: menuSent ? 1 : 0, now });
    return;
  }

  /* Rules take precedence over the default welcome/catalog/away behaviour. */
  const rules = await matchRules(account.id, { text, isNew, state, now });
  if (rules.length) {
    logger.info(
      { accountId: account.id, chatId: chat.id, ruleCount: rules.length, ruleIds: rules.map((rule) => rule.id), ruleNames: rules.map((rule) => rule.name) },
      'telegram auto-reply (bot) rules matched',
    );
    const result = await runMatchedRules(rules, {
      sendText: (value) => sendText(token, chat.id, value),
      sendCatalog: ({ intro, items }) => sendCatalog(token, chat.id, { intro, items }),
      sendAlbum: (ids, caption) => sendAlbum(token, chat.id, ids, caption),
      sendAudio: (mediaId) => sendAudioFile(token, chat.id, mediaId),
      sendMenu: () => sendBotMenu(token, chat.id, account.id, settings),
      catalogIntro: settings.catalogIntro,
    });

    logger.info(
      { accountId: account.id, chatId: chat.id, sent: result.sent, lastRuleId: result.lastRule?.id },
      'telegram auto-reply (bot) rules handled',
    );
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.RULE, {
      ruleId: result.lastRule?.id,
      sent: result.sent,
      now,
    });

    if (result.sent > 0) {
      await state.update({
        lastReplyAt: now,
        lastRuleId: result.lastRule?.id || null,
        lastRuleReplyAt: now,
      });
    }
    return;
  }

  if (isNew) {
    outcome = ANALYTICS_CATEGORIES.WELCOME;
    if (settings.welcomeMessage) {
      if (await sendText(token, chat.id, settings.welcomeMessage)) sent += 1;
    }

    if (settings.catalogEnabled) {
      const items = await listCatalog({ activeOnly: true });
      if (items.length) {
        sent += await sendCatalog(token, chat.id, {
          intro: settings.catalogIntro,
          items,
        });
      }
    }

    if (settings.awayMode && settings.awayMessage) {
      if (await sendText(token, chat.id, settings.awayMessage)) {
        sent += 1;
        awaySent = true;
      }
    }
  } else if (settings.catalogEnabled && CATALOG_INTENT.test(text)) {
    outcome = ANALYTICS_CATEGORIES.CATALOG;
    const items = await listCatalog({ activeOnly: true });
    if (items.length) {
      sent += await sendCatalog(token, chat.id, {
        intro: settings.catalogIntro,
        items,
      });
    }
  } else if (settings.awayMode && settings.awayMessage) {
    const away = awayCooldownState(state, settings, now);

    if (!away.blocked) {
      outcome = ANALYTICS_CATEGORIES.AWAY;
      if (await sendText(token, chat.id, settings.awayMessage)) {
        sent += 1;
        awaySent = true;
      }
    } else {
      silenceReason = `the away message is on cooldown until ${away.nextAllowedAt}`;
    }
  } else {
    silenceReason =
      'no rule matched, the away message is switched off, and this is not a catalogue question';
  }

  if (isNew && settings.menuEnabled) {
    if (await sendBotMenu(token, chat.id, account.id, settings)) sent += 1;
  }

  if (sent > 0) {
    await state.update({
      lastReplyAt: now,
      ...(awaySent ? { lastAwayReplyAt: now } : {}),
    });
  }
  await recordAnalytics(account.id, outcome, { sent, now });

  /*
   * Say why nothing was sent.
   *
   * "handled, sent: 0" on its own is unreadable: the auto-reply is quiet by
   * design, so the interesting question is always why it stayed quiet. The
   * reason is logged with the message so it can be read straight off the log.
   */
  if (sent === 0 && silenceReason) {
    logger.info(
      { accountId: account.id, chatId: chat.id, reason: silenceReason },
      'telegram auto-reply (bot) sent nothing',
    );
  }

  logger.info(
    { accountId: account.id, chatId: chat.id, sent, isNew, menuEnabled: settings.menuEnabled },
    'telegram auto-reply (bot) handled',
  );
}

/**
 * Handle a tap on an inline menu button (Bot API webhook `callback_query`).
 *
 * Navigation (home / submenu / back) edits the original menu message in place;
 * content actions (catalog, text, album) send new messages and leave the menu
 * available so the chat user can keep exploring.
 */
export async function handleAutoReplyCallback(update, account) {
  if (!account?.isActive) return;

  const callback = update?.callback_query;
  if (!callback?.id || callback.from?.is_bot) return;

  const chat = callback.message?.chat;
  if (!chat?.id || chat.type !== 'private') return;

  const data = String(callback.data || '');
  if (!data.startsWith('menu:')) return;

  logger.info(
    {
      accountId: account.id,
      chatId: chat.id,
      fromId: callback.from?.id,
      fromUsername: callback.from?.username,
      data: data.slice(0, 100),
    },
    'telegram auto-reply (bot) menu callback received',
  );

  const token = accountToken(account);
  try {
    await botApi.answerCallbackQuery(token, callback.id);
  } catch (error) {
    logger.warn({ err: error.message, chatId: chat.id }, 'telegram callback answer failed');
  }

  const settings = await ensureSettings(account.id);
  if (!settings.isEnabled) {
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (bot) skipped: auto-reply disabled');
    return;
  }

  const state = await TelegramAutoReplyChatState.findOne({
    where: { accountId: account.id, chatId: chat.id },
  });
  if (!state || state.isBlocked || state.autoReplyEnabled === false) {
    logger.info(
      { accountId: account.id, chatId: chat.id },
      'telegram auto-reply (bot) callback skipped: chat blocked or auto-reply off',
    );
    return;
  }

  const target = await resolveMenuTarget(account.id, data);
  if (!target) {
    logger.info({ accountId: account.id, chatId: chat.id, data }, 'telegram auto-reply (bot) callback skipped: unknown menu target');
    return;
  }

  const now = new Date();
  const messageId = Number(callback.message.message_id);
  let sent = 0;

  if (target.kind === 'home' || target.kind === 'submenu') {
    const parentId = target.kind === 'submenu' ? target.button.id : null;
    if (await sendBotMenu(token, chat.id, account.id, settings, { parentId, editMessageId: messageId })) {
      sent = 1;
    }
  } else {
    sent = await dispatchMenuButton(target.button, {
      sendText: (value) => sendText(token, chat.id, value),
      sendCatalog: ({ intro, items }) => sendCatalog(token, chat.id, { intro, items }),
      sendAlbum: (ids, caption) => sendAlbum(token, chat.id, ids, caption ? botApi.escapeHtml(caption) : ''),
      catalogIntro: settings.catalogIntro,
    });
  }

  if (sent > 0) {
    await state.update({ lastReplyAt: now });
  }

  logger.info(
    { accountId: account.id, chatId: chat.id, data, sent, targetKind: target.kind },
    'telegram auto-reply (bot) menu callback handled',
  );
}

function catalogPlainCaption(item) {
  const lines = [item.name];

  if (item.description) {
    lines.push(String(item.description).slice(0, 700));
  }

  lines.push(formatPrice(item.price, item.currency));
  return lines.join('\n');
}

async function sendAccountText(client, chatId, text) {
  if (!text) return false;
  try {
    await client.sendMessage(chatId, { message: String(text) });
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId }, 'telegram personal auto-reply text failed');
    return false;
  }
}

/** MTProto album: sendFile with an array uploads the photos as one media group. */
async function sendAccountAlbum(client, chatId, mediaIds, caption = '') {
  const urls = await mediaUrlsFor(mediaIds);
  if (!urls.length) {
    return caption && (await sendAccountText(client, chatId, caption)) ? 1 : 0;
  }

  const buffers = (await Promise.all(urls.map(fetchMediaBuffer))).filter(Boolean);
  if (!buffers.length) {
    logger.warn({ chatId }, 'telegram personal album: could not fetch any media');
    return caption && (await sendAccountText(client, chatId, caption)) ? 1 : 0;
  }

  try {
    await client.sendFile(chatId, {
      file: buffers.length === 1 ? buffers[0] : buffers,
      caption: caption || undefined,
      asImage: true,
      forceDocument: false,
    });
    return 1;
  } catch (error) {
    logger.warn({ err: error.message, chatId }, 'telegram personal album failed');
    return caption && (await sendAccountText(client, chatId, caption)) ? 1 : 0;
  }
}

async function sendAccountCatalog(client, chatId, { intro, items }) {
  let sent = 0;

  if (intro) {
    if (await sendAccountText(client, chatId, intro)) sent += 1;
  }

  for (const item of items.slice(0, CATALOG_LIMIT)) {
    const caption = catalogPlainCaption(item);
    const albumUrls = await mediaUrlsFor(item.imageMediaIds);
    const imageUrl = absoluteMediaUrl(item.image?.url);

    try {
      if (albumUrls.length > 1) {
        const buffers = (await Promise.all(albumUrls.map(fetchMediaBuffer))).filter(Boolean);
        if (buffers.length) {
          await client.sendFile(chatId, { file: buffers, caption, asImage: true, forceDocument: false });
        } else if (imageUrl) {
          const buffer = await fetchMediaBuffer(imageUrl);
          if (buffer) {
            await client.sendFile(chatId, { file: buffer, caption });
          } else {
            await client.sendMessage(chatId, { message: caption });
          }
        } else {
          await client.sendMessage(chatId, { message: caption });
        }
      } else if (imageUrl) {
        const buffer = await fetchMediaBuffer(imageUrl);
        if (buffer) {
          await client.sendFile(chatId, { file: buffer, caption, asImage: true, forceDocument: false });
        } else {
          await client.sendMessage(chatId, { message: caption });
        }
      } else {
        await client.sendMessage(chatId, { message: caption });
      }
      sent += 1;
    } catch (error) {
      logger.warn({ err: error.message, chatId, itemId: item.id }, 'telegram personal catalog item failed');

      let recovered = false;
      if (albumUrls.length > 1 && imageUrl) {
        try {
          const buffer = await fetchMediaBuffer(imageUrl);
          if (buffer) {
            await client.sendFile(chatId, { file: buffer, caption, asImage: true, forceDocument: false });
            recovered = true;
          }
        } catch (photoError) {
          logger.warn({ err: photoError.message, chatId, itemId: item.id }, 'telegram personal catalog single-photo fallback failed');
        }
      }
      if (!recovered) {
        try {
          await client.sendMessage(chatId, { message: caption });
          recovered = true;
        } catch (fallbackError) {
          logger.warn({ err: fallbackError.message, chatId, itemId: item.id }, 'telegram personal catalog text fallback failed');
        }
      }
      if (recovered) sent += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return sent;
}

/**
 * Pending text menus, keyed by `${accountId}:${chatId}`.
 *
 * Telegram strips every kind of reply markup from a message sent by a user
 * account — inline keyboards and reply keyboards alike — so a personal account
 * cannot offer tappable buttons. The menu is therefore sent as a numbered list
 * and the chat user replies with the number of their choice.
 *
 * `path` is the chain of submenu parents leading to the level on screen, so
 * "back" can walk back up it.
 */
const pendingTextMenus = new Map();

/** How long a numbered menu stays answerable. */
const TEXT_MENU_TTL_MS = 15 * 60 * 1000;

function menuStateKey(accountId, chatId) {
  return `${accountId}:${chatId}`;
}

function setPendingTextMenu(accountId, chatId, path, buttons) {
  pendingTextMenus.set(menuStateKey(accountId, chatId), { path, buttons, at: Date.now() });
}

function getPendingTextMenu(accountId, chatId) {
  const key = menuStateKey(accountId, chatId);
  const entry = pendingTextMenus.get(key);

  if (!entry) return null;
  if (Date.now() - entry.at > TEXT_MENU_TTL_MS) {
    pendingTextMenus.delete(key);
    return null;
  }

  return entry;
}

function clearPendingTextMenu(accountId, chatId) {
  pendingTextMenus.delete(menuStateKey(accountId, chatId));
}

/**
 * Work out which menu entry a reply refers to.
 *
 * "0" goes back one level. Anything else must be the number of a visible
 * option. A reply that matches neither is an ordinary message and falls
 * through to the normal rules.
 */
function resolveTextMenuSelection(entry, text) {
  const trimmed = String(text || '').trim();

  if (trimmed === '0') return { kind: 'back' };
  if (!/^\d{1,2}$/.test(trimmed)) return null;

  const button = entry.buttons[Number(trimmed) - 1];
  return button ? { kind: 'button', button } : null;
}

/**
 * Render one menu level for a personal account as a numbered list.
 *
 * The title is followed by one numbered line per button and a short instruction.
 * The chosen level is remembered so the next reply can be matched back to it.
 */
async function sendAccountTextMenu(client, chatId, accountId, settings, { path = [] } = {}) {
  const parentId = path.length ? path[path.length - 1] : null;
  const view = await getMenuView(accountId, settings, parentId);

  if (!view) {
    logger.info({ accountId, chatId, parentId }, 'telegram personal menu skipped: no active buttons');
    return false;
  }

  const lines = [view.title, ''];

  view.buttons.forEach((button, index) => {
    lines.push(`${index + 1}. ${button.label}`);
  });

  if (path.length) lines.push('0. ← Back');
  lines.push('', 'Reply with the number of your choice.');

  try {
    await client.sendMessage(chatId, { message: lines.join('\n') });
    setPendingTextMenu(accountId, chatId, path, view.buttons);
    logger.info({ accountId, chatId, options: view.buttons.length, level: path.length }, 'telegram personal menu sent as text');
    return true;
  } catch (error) {
    logger.warn({ err: error.message, chatId, accountId }, 'telegram personal menu send failed');
    return false;
  }
}

/**
 * Act on a numbered reply to a personal-account menu.
 *
 * A submenu opens the next level, "menu" returns to the top, and anything
 * else runs the button's own action.
 */
async function runTextMenuSelection({ account, client, chat, settings, entry, selection }) {
  if (selection.kind === 'back') {
    const path = entry.path.slice(0, -1);
    return sendAccountTextMenu(client, chat.id, account.id, settings, { path });
  }

  const { button } = selection;

  if (button.action === 'submenu') {
    return sendAccountTextMenu(client, chat.id, account.id, settings, {
      path: [...entry.path, button.id],
    });
  }

  if (button.action === 'menu') {
    return sendAccountTextMenu(client, chat.id, account.id, settings, { path: [] });
  }

  return dispatchMenuButton(button, {
    sendText: (value) => sendAccountText(client, chat.id, value),
    sendCatalog: ({ intro, items }) => sendAccountCatalog(client, chat.id, { intro, items }),
    sendAlbum: (ids, caption) => sendAccountAlbum(client, chat.id, ids, caption),
    catalogIntro: settings.catalogIntro,
  });
}

/**
 * The personal-account equivalent of handleAutoReplyUpdate.
 *
 * Called by the MTProto listener in `telegram-account.service.js`. It uses the
 * same chat state, settings and rules, so switching an account from a bot
 * to a personal login does not lose its history or its configuration.
 */
export async function handleIncomingAccountMessage({ account, client, chat, sender, text, messageId }) {
  if (!account?.isActive) return;

  const now = new Date();
  const isMenuCommand = /^\/menu(?:@[A-Za-z0-9_]+)?$/i.test(String(text || '').trim());

  const settings = await ensureSettings(account.id);
  if (!settings.isEnabled) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.DISABLED, { now });
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (personal) skipped: auto-reply disabled');
    return;
  }

  await recordAnalytics(account.id, ANALYTICS_CATEGORIES.INCOMING, { now });

  logger.info(
    {
      accountId: account.id,
      chatId: chat.id,
      fromId: sender?.id,
      fromUsername: sender?.username,
      messageId,
      text: String(text || '').slice(0, 200),
      isMenuCommand,
    },
    'telegram auto-reply (personal) incoming message',
  );

  const recorded = await recordChatState(account, chat, messageId, now);
  if (!recorded) return;

  const { state, isNew } = recorded;

  if (state.isBlocked || state.autoReplyEnabled === false) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.BLOCKED, { now });
    logger.info(
      { accountId: account.id, chatId: chat.id, isBlocked: state.isBlocked, autoReplyEnabled: state.autoReplyEnabled },
      'telegram auto-reply (personal) skipped: chat blocked or auto-reply off',
    );
    return;
  }
  if (isNew && !settings.replyToNewChats) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.NEW_CHATS_OFF, { now });
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (personal) skipped: new chats disabled');
    return;
  }
  if (!isNew && !settings.replyToReturningChats) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.RETURNING_CHATS_OFF, { now });
    logger.info({ accountId: account.id, chatId: chat.id }, 'telegram auto-reply (personal) skipped: returning chats disabled');
    return;
  }

  if (
    !isNew &&
    state.lastReplyAt &&
    now.getTime() - new Date(state.lastReplyAt).getTime() < MIN_REPLY_INTERVAL_MS
  ) {
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.INTERVAL, { now });
    logger.info(
      { accountId: account.id, chatId: chat.id },
      'telegram auto-reply (personal) skipped: reply interval not elapsed',
    );
    return;
  }

  if (isMenuCommand) {
    await sendAccountTextMenu(client, chat.id, account.id, settings, { path: [] });
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.MENU, { sent: 1, now });
    return;
  }

  /*
   * A numbered reply to the menu that was last sent in this chat.
   *
   * Telegram strips reply markup from user accounts, so the personal menu is a
   * numbered list and the chat user answers with a number. Only a reply that
   * matches a visible option counts — anything else is an ordinary message and
   * falls through to the rules below.
   */
  const pendingMenu = getPendingTextMenu(account.id, chat.id);
  const selection = pendingMenu ? resolveTextMenuSelection(pendingMenu, text) : null;

  if (selection) {
    clearPendingTextMenu(account.id, chat.id);
    logger.info(
      { accountId: account.id, chatId: chat.id, action: selection.button?.action, buttonId: selection.button?.id },
      'telegram auto-reply (personal) menu choice received',
    );
    await runTextMenuSelection({ account, client, chat, settings, entry: pendingMenu, selection });
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.MENU, { sent: 1, now });
    return;
  }

  const rules = await matchRules(account.id, { text, isNew, state, now });
  if (rules.length) {
    logger.info(
      { accountId: account.id, chatId: chat.id, ruleCount: rules.length, ruleIds: rules.map((rule) => rule.id), ruleNames: rules.map((rule) => rule.name) },
      'telegram auto-reply (personal) rules matched',
    );
    const result = await runMatchedRules(rules, {
      sendText: (value) => sendAccountText(client, chat.id, value),
      sendCatalog: ({ intro, items }) => sendAccountCatalog(client, chat.id, { intro, items }),
      sendAlbum: (ids, caption) => sendAccountAlbum(client, chat.id, ids, caption),
      sendAudio: (mediaId) => sendAccountAudio(client, chat.id, mediaId),
      sendMenu: () => sendAccountTextMenu(client, chat.id, account.id, settings, { path: [] }),
      catalogIntro: settings.catalogIntro,
      // Personal accounts: attach the rule's reply text to its images as a
      // caption instead of sending it as a second message.
      captionOnAlbum: true,
    });

    logger.info(
      { accountId: account.id, chatId: chat.id, sent: result.sent, lastRuleId: result.lastRule?.id },
      'telegram auto-reply (personal) rules handled',
    );
    await recordAnalytics(account.id, ANALYTICS_CATEGORIES.RULE, {
      ruleId: result.lastRule?.id,
      sent: result.sent,
      now,
    });

    if (result.sent > 0) {
      await state.update({
        lastReplyAt: now,
        lastRuleId: result.lastRule?.id || null,
        lastRuleReplyAt: now,
      });
    }
    return;
  }

  let sent = 0;
  let awaySent = false;
  let silenceReason = null;
  let outcome = ANALYTICS_CATEGORIES.SILENCE;

  if (isNew) {
    outcome = ANALYTICS_CATEGORIES.WELCOME;
    if (settings.welcomeMessage) {
      if (await sendAccountText(client, chat.id, settings.welcomeMessage)) sent += 1;
    }

    if (settings.catalogEnabled) {
      const items = await listCatalog({ activeOnly: true });
      if (items.length) {
        sent += await sendAccountCatalog(client, chat.id, {
          intro: settings.catalogIntro,
          items,
        });
      }
    }

    if (settings.awayMode && settings.awayMessage) {
      if (await sendAccountText(client, chat.id, settings.awayMessage)) {
        sent += 1;
        awaySent = true;
      }
    }
  } else if (settings.catalogEnabled && CATALOG_INTENT.test(text)) {
    outcome = ANALYTICS_CATEGORIES.CATALOG;
    const items = await listCatalog({ activeOnly: true });
    if (items.length) {
      sent += await sendAccountCatalog(client, chat.id, {
        intro: settings.catalogIntro,
        items,
      });
    }
  } else if (settings.awayMode && settings.awayMessage) {
    const away = awayCooldownState(state, settings, now);

    if (!away.blocked) {
      outcome = ANALYTICS_CATEGORIES.AWAY;
      if (await sendAccountText(client, chat.id, settings.awayMessage)) {
        sent += 1;
        awaySent = true;
      }
    } else {
      silenceReason = `the away message is on cooldown until ${away.nextAllowedAt}`;
    }
  } else {
    silenceReason =
      'no rule matched, the away message is switched off, and this is not a catalogue question';
  }

  // The menu for a personal account is a numbered list rather than buttons,
  // so it can still be offered automatically to a new chat.
  if (isNew && settings.menuEnabled) {
    if (await sendAccountTextMenu(client, chat.id, account.id, settings, { path: [] })) sent += 1;
  }

  if (sent > 0) {
    await state.update({
      lastReplyAt: now,
      ...(awaySent ? { lastAwayReplyAt: now } : {}),
    });
  }
  await recordAnalytics(account.id, outcome, { sent, now });

  /*
   * Say why nothing was sent.
   *
   * "handled, sent: 0" on its own is unreadable: the auto-reply is quiet by
   * design, so the interesting question is always why it stayed quiet. The
   * reason is logged with the message so it can be read straight off the log.
   */
  if (sent === 0 && silenceReason) {
    logger.info(
      { accountId: account.id, chatId: chat.id, reason: silenceReason },
      'telegram auto-reply (personal) sent nothing',
    );
  }

  logger.info(
    { accountId: account.id, chatId: chat.id, sent, isNew, menuEnabled: settings.menuEnabled },
    'telegram auto-reply (personal) handled',
  );
}

/**
 * The personal-account equivalent of handleAutoReplyCallback.
 *
 * Telegram strips reply markup from a user account, so a callback query for a
 * personal account should never arrive. The handler is kept as a safety net: if
 * one does turn up, it acknowledges the tap and re-offers the menu as text.
 */
export async function handleAccountMenuCallback({ account, client, chatId, messageId, data, answer }) {
  if (!account?.isActive) return;

  if (typeof answer === 'function') {
    try {
      await answer();
    } catch (error) {
      logger.warn({ err: error.message, chatId }, 'telegram personal callback answer failed');
    }
  }

  logger.info(
    { accountId: account.id, chatId, data: String(data || '').slice(0, 100) },
    'telegram auto-reply (personal) menu callback received',
  );

  const settings = await ensureSettings(account.id);
  if (!settings.isEnabled) {
    logger.info({ accountId: account.id, chatId }, 'telegram auto-reply (personal) skipped: auto-reply disabled');
    return;
  }

  const state = await TelegramAutoReplyChatState.findOne({
    where: { accountId: account.id, chatId },
  });
  if (!state || state.isBlocked || state.autoReplyEnabled === false) {
    logger.info(
      { accountId: account.id, chatId },
      'telegram auto-reply (personal) callback skipped: chat blocked or auto-reply off',
    );
    return;
  }

  const target = await resolveMenuTarget(account.id, data);
  if (!target) {
    logger.info({ accountId: account.id, chatId, data }, 'telegram auto-reply (personal) callback skipped: unknown menu target');
    return;
  }

  const now = new Date();
  let sent = 0;

  if (target.kind === 'home' || target.kind === 'submenu') {
    const path = target.kind === 'submenu' ? [target.button.id] : [];
    if (await sendAccountTextMenu(client, chatId, account.id, settings, { path })) {
      sent = 1;
    }
  } else {
    sent = await dispatchMenuButton(target.button, {
      sendText: (value) => sendAccountText(client, chatId, value),
      sendCatalog: ({ intro, items }) => sendAccountCatalog(client, chatId, { intro, items }),
      sendAlbum: (ids, caption) => sendAccountAlbum(client, chatId, ids, caption),
      catalogIntro: settings.catalogIntro,
    });
  }

  if (sent > 0) {
    await state.update({ lastReplyAt: now });
  }

  logger.info(
    { accountId: account.id, chatId, data: String(data).slice(0, 100), sent, targetKind: target.kind },
    'telegram auto-reply (personal) menu callback handled',
  );
}

/**
 * Used by the personal-account runtime: find the auto-reply account row that
 * mirrors a credential row, or recreate it if the user deleted it from the UI.
 */
export async function getPersonalAutoReplyAccount(userAccount) {
  return ensurePersonalAccount(userAccount);
}

export async function getEnvAccountForWebhook() {
  return getOrCreateEnvAccount();
}
