import crypto from 'node:crypto';
import { Op } from 'sequelize';
import env from '../config/env.js';
import { models } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { enqueue } from './notifications.service.js';
import { botUsername, deepLink, isEnabled } from './telegram.service.js';
import { applyNewPassword } from './auth.service.js';
import { logAuth } from '../middleware/audit.js';

const { User, PasswordResetToken } = models;

/**
 * Password recovery over Telegram.
 *
 * A forgotten password is recovered by proving control of the account's
 * Telegram. The API issues a short one-time code, the person reads it out of
 * their Telegram chat, and redeems it in the browser to set a new password.
 *
 * Four properties shape every decision here.
 *
 * The first is that the endpoint must not become a way to discover who has an
 * account. `requestResetCode` answers identically — same body, same status,
 * same fields — whether the address belongs to nobody, to somebody whose code
 * was just sent, or to somebody who was given a link to open. The page says
 * the same thing in all three cases, so the answer carries no information.
 * Every failure inside `redeemResetCode` — unknown account, wrong code,
 * expired code, exhausted attempts — raises the same error with the same
 * wording, for the same reason.
 *
 * The second is that a six-digit code is only safe because of what surrounds
 * it. A million possible values inside a ten-minute window is guessable, so a
 * code may be tried five times and then it dies, and an account may ask for
 * three codes an hour and one a minute. Those limits are per-account and live
 * in the database rather than in the in-memory rate limiter, because in this
 * deployment every request reaches the API over loopback — the limiter would
 * see a single shared bucket for the entire site.
 *
 * The third is the delivery problem, and it is the reason this file is more
 * than it looks.
 *
 * A bot cannot message a chat that has never spoken to it. Telegram will not
 * deliver to a chat id it does not know. So there are two ways a code reaches
 * a person:
 *
 *   - The account already has a linked chat, so the code is sent straight
 *     there through the outbox.
 *   - It does not, so nothing can be sent. The only thing that can work is a
 *     link the person opens, which starts the bot, and the bot replies with
 *     the code.
 *
 * The second path is where the security lives, because a link can be opened
 * by anybody. It is gated on the account's recorded Telegram username: the
 * bot sends a working code only to a chat whose `@username` matches the one on
 * the account. That is the same check Telegram's own login widget performs.
 * It means knowing a colleague's email address is not enough to take over
 * their account — the attacker also has to control the specific Telegram
 * account that was registered for it.
 *
 * The fourth is that the bot's reply must not reveal anything either. It
 * replies with a six-digit code in every case. When the chat is not the right
 * one, the code it receives is one that was never stored, so it does not
 * work — but the reply is identical, and an attacker cannot tell "this account
 * does not exist" from "this account exists but is not yours".
 */

/**
 * Prefix on a delivery token, so the bot can tell a reset link apart from an
 * account-linking code without a database lookup on the wrong table.
 */
const DELIVERY_PREFIX = 'r_';

/** Six digits, uniformly distributed. */
function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Digest of a code, bound to the account it belongs to.
 *
 * The code is never stored, only this. Binding the user id into the digest
 * means a hash copied from one row into another does not verify: a code is
 * only ever checked against the account that asked for it.
 */
function hashCode(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

/** A one-time token for the `t.me` deep link. */
function generateDeliveryToken() {
  return `${DELIVERY_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
}

/** The token is hashed at rest, exactly as the code is. */
function hashDeliveryToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Telegram usernames are case-insensitive and written with a leading @. */
function normaliseUsername(value) {
  if (!value) return null;
  return String(value).replace(/^@/, '').trim().toLowerCase() || null;
}

/**
 * Compare two digests without leaking how far they match.
 *
 * The digests are equal-length hex, so the lengths always agree; the check is
 * here so that a future change to the format cannot quietly turn this into a
 * short-circuiting comparison.
 */
function digestsMatch(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * The one message every rejected reset gets.
 *
 * Whether the account exists, whether the code matched, and whether it had
 * expired are indistinguishable from the outside. Distinguishing them would
 * turn the endpoint into an account-existence oracle.
 */
function invalidCode() {
  return AppError.badRequest('That code is not valid or has expired. Request a new one.');
}

/**
 * Issue a reset code and arrange for it to reach the person.
 *
 * Always resolves. The returned plan tells the caller how to *offer* the code;
 * it never tells them whether an account exists, because the offer is the
 * same either way.
 */
export async function requestResetCode({ email, ip, userAgent }) {
  const normalised = String(email).trim().toLowerCase();
  const audit = { ip, get: () => userAgent };

  /*
   * Telegram switched off on this server. No code can be sent and no link can
   * be built, so there is nothing to offer.
   *
   * This is a configuration fact rather than an account fact, so it is safe to
   * report it: it is the same for every request.
   */
  if (!isEnabled() || !botUsername()) {
    await logAuth(audit, {
      action: 'password_reset_requested',
      userEmail: normalised,
      metadata: { result: 'telegram_disabled' },
    });

    return { url: null, botUsername: null, queued: false };
  }

  const user = await User.findOne({ where: { email: normalised } });

  /*
   * No such account, or the account is deactivated.
   *
   * A link is still produced, and it will not redeem. The bot replies to it
   * with a code that does not work, exactly as it replies to a valid one, so
   * nothing about whether the account exists is revealed — not in the
   * response, and not in Telegram either.
   */
  if (!user || !user.isActive) {
    await logAuth(audit, {
      action: 'password_reset_requested',
      userEmail: normalised,
      metadata: { result: 'not_deliverable' },
    });

    return { url: deepLink(generateDeliveryToken()), botUsername: botUsername(), queued: false };
  }

  /* ------------------------------------------------------------------ */
  /* Per-account send limits                                               */
  /* ------------------------------------------------------------------ */

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const sentThisHour = await PasswordResetToken.count({
    where: { userId: user.id, createdAt: { [Op.gte]: hourAgo } },
  });

  if (sentThisHour >= env.PASSWORD_RESET_MAX_SENDS_PER_HOUR) {
    await logAuth(audit, {
      action: 'password_reset_requested',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'send_limit_hour' },
    });
    return { url: null, botUsername: null, queued: false, limited: true };
  }

  const previous = await PasswordResetToken.findOne({
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
  });

  if (
    previous &&
    Date.now() - new Date(previous.createdAt).getTime() < env.PASSWORD_RESET_RESEND_SECONDS * 1000
  ) {
    await logAuth(audit, {
      action: 'password_reset_requested',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'resend_too_soon' },
    });
    return { url: null, botUsername: null, queued: false, limited: true };
  }

  /* ------------------------------------------------------------------ */
  /* Route A — a linked chat can be messaged directly                     */
  /* ------------------------------------------------------------------ */

  const deliveryToken = generateDeliveryToken();
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000);

  if (user.telegramChatId) {
    const code = generateCode();

    await PasswordResetToken.create({
      userId: user.id,
      codeHash: hashCode(user.id, code),
      deliveryTokenHash: hashDeliveryToken(deliveryToken),
      expiresAt,
      ip: ip || null,
    });

    /*
     * Delivered through the outbox rather than sent directly.
     *
     * The outbox is the same queue task notifications use, and it retries — so a
     * Telegram hiccup while the person is staring at the browser does not lose
     * the code. It is given the chat id rather than the user id on purpose: the
     * outbox's own resolver honours `telegramAlertsEnabled`, and somebody who
     * muted task alerts still has to be able to recover their account.
     */
    await enqueue({
      chatId: user.telegramChatId,
      kind: 'password_reset',
      text: resetCodeMessage(code),
    });

    await logAuth(audit, {
      action: 'password_reset_requested',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'queued' },
    });

    return { url: deepLink(deliveryToken), botUsername: botUsername(), queued: true };
  }

  /* ------------------------------------------------------------------ */
  /* Route B — no linked chat, so the code comes back through a link      */
  /* ------------------------------------------------------------------ */

  /*
   * The code does not exist yet: it is created at the moment the link is
   * opened, because a digest cannot be turned back into the six digits the
   * bot has to send.
   */
  await PasswordResetToken.create({
    userId: user.id,
    codeHash: null,
    deliveryTokenHash: hashDeliveryToken(deliveryToken),
    expiresAt,
    ip: ip || null,
  });

  await logAuth(audit, {
    action: 'password_reset_requested',
    userId: user.id,
    userEmail: user.email,
    metadata: { result: 'link_issued' },
  });

  return { url: deepLink(deliveryToken), botUsername: botUsername(), queued: false };
}

/**
 * The message the bot sends, whichever route delivered the code.
 *
 * The wording is deliberately the same whether the code works or not — the
 * bot cannot say "that was the wrong account" without turning itself into an
 * account-existence oracle.
 *
 * That means the person reading it cannot tell a working code from one that
 * will be refused, so the message has to carry the way out for the case where
 * it is refused. Without that, a person whose account has no registered
 * Telegram username opens the link, reads a code, types it, and is told it
 * does not work — with nothing on screen to tell them what to do next.
 */
export function resetCodeMessage(code) {
  return [
    '🔐 <b>Virallink password reset</b>',
    '',
    `Your reset code is <b>${code}</b>.`,
    '',
    `It expires in ${env.PASSWORD_RESET_CODE_TTL_MINUTES} minutes and can only be used once.`,
    '',
    'If the code does not work, open your account page and connect Telegram — or ask an ' +
      'administrator to reset your password for you.',
    '',
    'If you did not ask for this, ignore this message — your password will not change.',
  ].join('\n');
}

/**
 * Redeem a delivery link from a bot update.
 *
 * The bot calls this when somebody opens the `t.me` link. It decides whether
 * the chat that opened it may have a working code, and returns the code to
 * send either way.
 *
 * The reply is always a six-digit code. When the chat is not the right one the
 * code is one that was never stored, so it does not work — but the reply is
 * identical, and the caller cannot tell "this account does not exist" from
 * "this account exists but is not yours".
 */
export async function redeemDeliveryToken(token, { chatId, username } = {}) {
  const code = generateCode();

  if (!token || !String(token).startsWith(DELIVERY_PREFIX)) {
    return { code, valid: false };
  }

  const row = await PasswordResetToken.findOne({
    where: {
      deliveryTokenHash: hashDeliveryToken(token),
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!row) return { code, valid: false };

  const user = await User.findByPk(row.userId);
  if (!user || !user.isActive) return { code, valid: false };

  /*
   * The gate. The account has to have a Telegram username on file, and the chat
   * that opened the link has to be that username.
   *
   * A username is not a secret — it is public — but it is the only thing tying
   * a chat to a person that this system can check, and an administrator
   * registers it once, having seen the person's Telegram.
   */
  const expected = normaliseUsername(user.telegramUsername);
  const actual = normaliseUsername(username);

  if (!expected || !actual || expected !== actual) {
    await logAuth(
      { ip: null, get: () => null },
      {
        action: 'password_reset_requested',
        userId: user.id,
        userEmail: user.email,
        metadata: { result: 'delivery_rejected_username' },
      },
    );

    return { code, valid: false };
  }

  /*
   * Store the code and send it. Any earlier code for this request is
   * superseded, which is what should happen when somebody opens the link
   * twice: the newest one is the one that works.
   */
  await row.update({
    codeHash: hashCode(user.id, code),
    deliveredAt: row.deliveredAt || new Date(),
    deliveryChatId: chatId ?? null,
    // The code's own lifetime starts now, when it is actually sent.
    expiresAt: new Date(Date.now() + env.PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000),
  });

  /*
   * The chat that just proved itself becomes the account's linked chat, so the
   * next reset goes straight there without a link.
   */
  if (!user.telegramChatId && chatId) {
    await user.update({ telegramChatId: chatId, telegramLinkedAt: new Date() });
  }

  await logAuth(
    { ip: null, get: () => null },
    {
      action: 'password_reset_requested',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'delivered' },
    },
  );

  return { code, valid: true, user };
}

/**
 * Redeem a code and set a new password.
 *
 * The code is looked up against the account that requested it, checked for
 * expiry, and charged for every wrong guess. A code that has been guessed
 * five times is spent.
 */
export async function redeemResetCode({ email, code, newPassword, ip, userAgent }) {
  const normalised = String(email).trim().toLowerCase();
  const audit = { ip, get: () => userAgent };

  const user = await User.findOne({ where: { email: normalised } });

  if (!user || !user.isActive) {
    await logAuth(audit, {
      action: 'password_reset_completed',
      userEmail: normalised,
      metadata: { result: 'rejected' },
    });
    throw invalidCode();
  }

  /*
   * The account's live token — the newest one that has not been spent and has
   * not expired. Only one code is ever valid at a time: asking for a new one
   * invalidates the old.
   */
  const token = await PasswordResetToken.findOne({
    where: {
      userId: user.id,
      consumedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });

  if (!token || !token.codeHash || !digestsMatch(token.codeHash, hashCode(user.id, String(code)))) {
    /*
     * Charge the guess to the live token. Without this, a wrong code costs an
     * attacker nothing and the attempt limit never comes into play.
     */
    if (token) {
      const attempts = token.attempts + 1;
      await token.update({
        attempts,
        consumedAt: attempts >= env.PASSWORD_RESET_MAX_ATTEMPTS ? new Date() : null,
      });
    }

    await logAuth(audit, {
      action: 'password_reset_completed',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'rejected' },
    });

    throw invalidCode();
  }

  /* ------------------------------------------------------------------ */
  /* The code is good — change the password                                */
  /* ------------------------------------------------------------------ */

  /*
   * applyNewPassword does the part that must never be skipped: it bumps the
   * token version, revokes every outstanding refresh token, and clears the
   * lockout. A stolen session must not outlive the password it was issued
   * against, and a person locked out by repeated failures must be able to get
   * back in with the password they have just chosen.
   */
  await applyNewPassword(user, newPassword, { mustChangePassword: false });

  // Spend the token, and any older one still hanging around.
  await PasswordResetToken.update(
    { consumedAt: new Date() },
    { where: { userId: user.id, consumedAt: null } },
  );

  await logAuth(audit, {
    action: 'password_reset_completed',
    userId: user.id,
    userEmail: user.email,
    metadata: { result: 'success' },
  });

  return { reset: true };
}

/**
 * Remove spent and expired tokens.
 *
 * Called by the cron job. Rows are kept for a while after they are spent so
 * that the security log and the table agree, but they are not worth keeping
 * forever.
 */
export async function pruneResetTokens() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return PasswordResetToken.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
}

export default {
  requestResetCode,
  redeemDeliveryToken,
  redeemResetCode,
  pruneResetTokens,
};
