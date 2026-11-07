import env from '../config/env.js';

/**
 * Telegram Bot API transport.
 *
 * A thin wrapper over the HTTP API rather than a bot framework. The app speaks
 * to Telegram in exactly four ways — send a message, set/delete the webhook,
 * read webhook status, and identify the bot — and a framework would add a
 * dependency and an update loop for no gain on this deployment.
 *
 * Nothing here inspects the database or knows what a task is; it only moves
 * already-rendered messages in and out. That keeps the "is Telegram configured"
 * question in one place (`isEnabled`) and means a missing bot token degrades to
 * a no-op instead of a crash.
 */

const API_BASE = 'https://api.telegram.org';

/** Whether a bot token is configured and the feature is switched on. */
export function isEnabled() {
  return Boolean(env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN);
}

export function botUsername() {
  return env.TELEGRAM_BOT_USERNAME ? env.TELEGRAM_BOT_USERNAME.replace(/^@/, '') : null;
}

/**
 * Deep link a person opens to start the bot with a one-time link code.
 * Returns null when no bot username is configured, so callers can degrade.
 */
export function deepLink(code) {
  const username = botUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

/**
 * Call a Bot API method. Throws on any failure — Telegram reports problems in
 * the body with `ok: false`, so a 200 alone is not success.
 */
async function callApi(method, params = {}) {
  if (!isEnabled()) throw new Error('Telegram is not configured');

  const response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    // Without a deadline a hung request would stall the outbox drain.
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${data?.description || `HTTP ${response.status}`}`);
  }

  return data.result;
}

/**
 * Send a message. Text is HTML by default; every caller that interpolates a
 * user-supplied string must run it through `escapeHtml` first.
 */
export async function sendMessage(chatId, text, { parseMode = 'HTML', buttons, disablePreview = true } = {}) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disablePreview,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export async function getMe() {
  return callApi('getMe');
}

/**
 * Register the webhook. The `secret_token` is echoed back by Telegram in the
 * `X-Telegram-Bot-Api-Secret-Token` header, which the route checks — so a
 * stranger who discovers the URL still cannot post updates.
 */
export async function setWebhook(url, secret) {
  return callApi('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function deleteWebhook() {
  return callApi('deleteWebhook', { drop_pending_updates: false });
}

export async function getWebhookInfo() {
  return callApi('getWebhookInfo');
}

/** Escape the three characters Telegram's HTML mode treats specially. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
