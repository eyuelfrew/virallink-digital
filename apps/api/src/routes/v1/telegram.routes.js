import crypto from 'node:crypto';
import { Router } from 'express';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { escapeHtml, isEnabled, sendMessage } from '../../services/telegram.service.js';
import { linkByCode } from '../../services/telegram-link.service.js';
import { redeemDeliveryToken, resetCodeMessage } from '../../services/password-reset.service.js';
import {
  getAccount,
  getEnvAccountForWebhook,
  handleAutoReplyCallback,
  handleAutoReplyUpdate,
} from '../../services/telegram-auto-reply.service.js';

/**
 * Telegram webhook.
 *
 * Telegram POSTs every update here. There is no session and no RBAC — the only
 * thing standing between a stranger who finds the URL and the bot is the shared
 * secret, which is checked twice: as a path segment (so it never appears in
 * application logs as a query string) and in the header Telegram sends back
 * from `setWebhook`. Both must match.
 *
 * The handler acknowledges first and processes afterwards. Telegram retries
 * anything that is slow or non-2xx, and a retry is a duplicate message; leaving
 * the reply path short avoids that entirely.
 */
const router = Router();

/** Constant-time compare so a wrong secret cannot be discovered by timing. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const HELP_TEXT = [
  'Virallink notifications bot.',
  '',
  'You are linked when you open the “Connect Telegram” link from your account page.',
  'Commands:',
  '/start &lt;code&gt; — link this chat to your Virallink account',
  '/menu — open the interactive menu',
  '/help — show this message',
].join('\n');

async function reply(chatId, text) {
  try {
    await sendMessage(chatId, text);
  } catch (error) {
    logger.warn({ err: error.message, chatId }, 'failed to reply on telegram');
  }
}

async function handleUpdate(update) {
  if (update?.callback_query) {
    const account = await getEnvAccountForWebhook();
    if (account) await handleAutoReplyCallback(update, account);
    return;
  }

  const message = update?.message;
  if (!message?.text) return;

  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = message.text.trim();
  const username = message.from?.username || null;

  if (text === '/start' || text.startsWith('/start ')) {
    const code = text.slice('/start'.length).trim();

    if (!code) {
      const account = await getEnvAccountForWebhook();
      if (account) {
        await handleAutoReplyUpdate(update, account);
        return;
      }

      await reply(chatId, 'Welcome. Open the “Connect Telegram” link in your Virallink account to finish linking.');
      return;
    }

    /*
     * A password-reset delivery link.
     *
     * A bot cannot message a chat that has never spoken to it, so for an
     * account with no linked chat the code comes back through a link that
     * starts the bot. The reply is always a six-digit code: when the chat is
     * not the one registered on the account, the code is one that was never
     * stored, so it does not work — but the reply is identical, and nothing
     * about who has an account is revealed.
     */
    if (code.startsWith('r_')) {
      const delivery = await redeemDeliveryToken(code, { chatId, username });

      if (delivery?.code) {
        await reply(chatId, resetCodeMessage(delivery.code));
      } else {
        await reply(chatId, 'That link is invalid or has expired. Request a new one from the Virallink site.');
      }
      return;
    }

    const user = await linkByCode(code, { chatId, username });
    if (user) {
      await reply(chatId, `Linked to <b>${escapeHtml(user.name)}</b>. Your Virallink notifications will arrive here.`);
    } else {
      await reply(chatId, 'That link code is invalid or has expired. Generate a fresh one from your account page.');
    }
    return;
  }

  if (text === '/help') {
    await reply(chatId, HELP_TEXT);
    return;
  }

  const account = await getEnvAccountForWebhook();
  if (account) {
    await handleAutoReplyUpdate(update, account);
    return;
  }

  await reply(chatId, 'This bot sends Virallink notifications. Type /help for commands.');
}

router.post('/webhook/:secret', (request, response) => {
  if (!isEnabled()) {
    response.status(404).json({ ok: false });
    return;
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
  const headerToken = request.get('x-telegram-bot-api-secret-token');

  if (!secret || !safeEqual(request.params.secret, secret) || !safeEqual(headerToken, secret)) {
    response.status(403).json({ ok: false });
    return;
  }

  response.json({ ok: true });
  handleUpdate(request.body).catch((error) =>
    logger.warn({ err: error.message }, 'telegram update handling failed'),
  );
});

router.post('/auto-reply/webhook/:accountId/:secret', async (request, response) => {
  const accountId = Number(request.params.accountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    response.status(403).json({ ok: false });
    return;
  }

  let account;

  try {
    account = await getAccount(accountId);
  } catch (error) {
    logger.warn({ err: error?.message, accountId }, 'telegram auto-reply webhook: account not found');
    response.status(403).json({ ok: false });
    return;
  }

  /*
   * The secret has to match the one the webhook was registered with, and it
   * has to arrive in the header as well as the path — a request that only
   * knows the URL is not allowed in.
   *
   * Only a bot connected with its own token is accepted here. The server bot
   * from the environment receives on the linking webhook above, which forwards
   * every update to the auto-reply.
   */
  const secret = account.provider === 'custom' ? account.webhookSecret : null;
  const headerToken = request.get('x-telegram-bot-api-secret-token');

  if (
    !secret ||
    account.provider !== 'custom' ||
    !safeEqual(request.params.secret, secret) ||
    !safeEqual(headerToken, secret)
  ) {
    response.status(403).json({ ok: false });
    return;
  }

  response.json({ ok: true });
  const update = request.body;
  const isCallback = Boolean(update?.callback_query);
  const incomingMessage = update?.message || update?.callback_query?.message;
  logger.info(
    {
      accountId,
      provider: account.provider,
      updateId: update?.update_id,
      isCallback,
      chatId: incomingMessage?.chat?.id,
      fromId: (update?.message?.from || update?.callback_query?.from)?.id,
      fromUsername: (update?.message?.from || update?.callback_query?.from)?.username,
      text: String(update?.message?.text || update?.message?.caption || update?.callback_query?.data || '').slice(0, 200),
    },
    'telegram auto-reply webhook received',
  );
  const processing = isCallback
    ? handleAutoReplyCallback(update, account)
    : handleAutoReplyUpdate(update, account);
  processing.catch((error) =>
    logger.warn({ err: error.message, accountId }, 'telegram auto-reply update failed'),
  );
});

export default router;
