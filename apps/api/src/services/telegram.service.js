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
 *
 * Transient failures are retried. The connection to Telegram is not always
 * reliable, and a plain "fetch failed" would otherwise cost a password-reset
 * code that somebody is waiting for. Only transport-level problems and the
 * statuses that mean "try again" are retried; an `ok: false` body is the
 * API's considered answer — "chat not found" will not become true on a
 * second attempt — and is raised immediately.
 */
async function callApi(method, params = {}, { attempts = 3 } = {}) {
  if (!isEnabled()) throw new Error('Telegram is not configured');

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    let data = null;

    try {
      response = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        // Without a deadline a hung request would stall the outbox drain. The
        // deadline is generous because the API is not always close by.
        signal: AbortSignal.timeout(env.TELEGRAM_API_TIMEOUT_MS),
      });
    } catch (error) {
      // The request never reached Telegram: a dropped connection, a DNS
      // failure, a timeout. Worth trying again.
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      throw new Error(`Telegram ${method} failed: ${error.message}`);
    }

    data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const description = data?.description || `HTTP ${response.status}`;

      // 429 and 5xx mean "come back later"; anything else is a considered
      // refusal.
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        lastError = new Error(description);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }

      throw new Error(`Telegram ${method} failed: ${description}`);
    }

    return data.result;
  }

  throw lastError || new Error(`Telegram ${method} failed`);
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

export async function setMyCommands(commands) {
  return callApi('setMyCommands', { commands });
}

export async function getWebhookInfo() {
  return callApi('getWebhookInfo');
}

/**
 * Read the updates Telegram has queued.
 *
 * Only works while no webhook is registered — Telegram refuses the call
 * otherwise, and delivers to the webhook instead of queueing.
 *
 * That restriction is what makes this useful rather than a wart. On a machine
 * with no stable public address there is no way for Telegram to deliver an
 * update inbound, so the queue is the only place a chat id can be read from.
 * It is how somebody finds their own chat id before they have linked
 * anything: message the bot, read the queued update, and the id is there.
 */
export async function getUpdates({ offset = 0, timeoutSeconds = 0, limit = 20 } = {}) {
  return callApi('getUpdates', {
    offset,
    limit,
    timeout: timeoutSeconds,
    allowed_updates: ['message', 'callback_query'],
  });
}

/** Escape the three characters Telegram's HTML mode treats specially. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
