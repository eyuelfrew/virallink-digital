import crypto from 'node:crypto';
import { Router } from 'express';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { escapeHtml, isEnabled, sendMessage } from '../../services/telegram.service.js';
import { linkByCode } from '../../services/telegram-link.service.js';

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
  const message = update?.message;
  if (!message?.text) return;

  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = message.text.trim();
  const username = message.from?.username || null;

  if (text === '/start' || text.startsWith('/start ')) {
    const code = text.slice('/start'.length).trim();

    if (!code) {
      await reply(chatId, 'Welcome. Open the “Connect Telegram” link in your Virallink account to finish linking.');
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

export default router;
