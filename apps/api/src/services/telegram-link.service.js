import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import env from '../config/env.js';
import { botUsername, deepLink, isEnabled } from './telegram.service.js';

const { User } = models;

/**
 * Linking a Telegram account to a Virallink user.
 *
 * The bot can only identify a person by the numeric chat id Telegram sends it,
 * and a person cannot be trusted to report that id themselves — someone could
 * claim another user's. So the flow is inverted: the signed-in user asks for a
 * one-time code, opens the bot with that code in a deep link, and the bot
 * learns the chat id from the update it receives. The code is short-lived and
 * cleared the moment it is redeemed.
 */

function generateCode() {
  // 32 hex chars from 128 bits: long enough that guessing is pointless during
  // the TTL window, short enough to survive a URL.
  return crypto.randomBytes(16).toString('hex');
}

/** The link state the UI renders. Never includes the code or chat id. */
export function linkStatus(user) {
  return {
    configured: isEnabled(),
    botUsername: botUsername(),
    linked: Boolean(user.telegramChatId),
    username: user.telegramUsername || null,
    linkedAt: user.telegramLinkedAt || null,
    alertsEnabled: user.telegramAlertsEnabled !== false,
  };
}

/** Issue (or reissue) a link code for a user and return the deep link to open. */
export async function createLinkCode(userId) {
  if (!isEnabled()) {
    throw AppError.badRequest('Telegram is not configured on this server');
  }

  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('User not found');

  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.TELEGRAM_LINK_CODE_TTL_MINUTES * 60 * 1000);

  await user.update({ telegramLinkCode: code, telegramLinkCodeExpiresAt: expiresAt });

  return {
    code,
    url: deepLink(code),
    botUsername: botUsername(),
    expiresAt,
    ttlMinutes: env.TELEGRAM_LINK_CODE_TTL_MINUTES,
  };
}

/**
 * Redeem a link code from a bot update.
 *
 * Returns the linked user, or null when the code is unknown or expired (the
 * bot replies with a friendly message either way). If the chat was previously
 * linked to a different account, that older link is released first so one chat
 * maps to exactly one user.
 */
export async function linkByCode(code, { chatId, username } = {}) {
  if (!code) return null;

  const user = await User.findOne({ where: { telegramLinkCode: code } });
  if (!user || !user.telegramLinkCodeExpiresAt || user.telegramLinkCodeExpiresAt.getTime() < Date.now()) {
    return null;
  }

  await User.update(
    { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
    { where: { telegramChatId: chatId, id: { [Op.ne]: user.id } } },
  );

  await user.update({
    telegramChatId: chatId,
    telegramUsername: username || null,
    telegramLinkedAt: new Date(),
    telegramLinkCode: null,
    telegramLinkCodeExpiresAt: null,
  });

  return user;
}

/** Detach Telegram from a user without touching anything else on the account. */
export async function unlink(userId) {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('User not found');

  await user.update({
    telegramChatId: null,
    telegramUsername: null,
    telegramLinkedAt: null,
    telegramLinkCode: null,
    telegramLinkCodeExpiresAt: null,
  });

  return linkStatus(user);
}

/** Look up the user linked to a chat id, used by future interactive commands. */
export async function findUserByChatId(chatId) {
  return User.findOne({ where: { telegramChatId: chatId } });
}
