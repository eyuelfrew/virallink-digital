import env from '../config/env.js';
import { escapeHtml } from './telegram.service.js';

const API_BASE = 'https://api.telegram.org';

async function callApi(token, method, params = {}) {
  if (!token) throw new Error('Telegram bot token is missing');

  const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    // Generous, for the same reason as the env-bot transport: the API is not
    // always close by, and a tight deadline turns a slow answer into a lost
    // message.
    signal: AbortSignal.timeout(env.TELEGRAM_API_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${data?.description || `HTTP ${response.status}`}`);
  }

  return data.result;
}

export function getMe(token) {
  return callApi(token, 'getMe');
}

/**
 * `replyMarkup` is a Telegram markup object (e.g. { inline_keyboard: [...] }).
 * It is passed through untouched so the caller owns the button layout.
 */
export function sendMessage(token, chatId, text, { parseMode = 'HTML', disablePreview = true, replyMarkup } = {}) {
  return callApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disablePreview,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function sendPhoto(token, chatId, photo, caption, { parseMode = 'HTML', replyMarkup } = {}) {
  return callApi(token, 'sendPhoto', {
    chat_id: chatId,
    photo,
    caption: caption ? String(caption).slice(0, 1024) : undefined,
    parse_mode: parseMode,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/**
 * Send an audio file.
 *
 * `audio` is a URL Telegram fetches itself, or a file_id. The file is shown
 * with a play button and its title — this is the "here is our showreel" shape.
 * For a voice note use {@link sendVoice} instead.
 */
export function sendAudio(token, chatId, audio, { title, caption, parseMode = 'HTML', replyMarkup } = {}) {
  return callApi(token, 'sendAudio', {
    chat_id: chatId,
    audio,
    title: title ? String(title).slice(0, 64) : undefined,
    caption: caption ? String(caption).slice(0, 1024) : undefined,
    parse_mode: caption ? parseMode : undefined,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/**
 * Send a voice note.
 *
 * Telegram only accepts OGG/Opus here, and shows the result as a round voice
 * bubble. An MP3 sent to this method is rejected, so the caller has to know
 * which kind of file it picked.
 */
export function sendVoice(token, chatId, voice, { caption, parseMode = 'HTML' } = {}) {
  return callApi(token, 'sendVoice', {
    chat_id: chatId,
    voice,
    caption: caption ? String(caption).slice(0, 1024) : undefined,
    parse_mode: caption ? parseMode : undefined,
  });
}

/**
 * Send a set of photos as a single album (media group).
 *
 * Telegram groups 2–10 photos sent this way into one tiled message. Only the
 * first item carries a caption in practice; the rest are shown without one.
 * Media groups cannot carry a reply_markup, so menus are sent as a separate
 * text message by the caller.
 */
export function sendMediaGroup(token, chatId, media) {
  return callApi(token, 'sendMediaGroup', {
    chat_id: chatId,
    media: media.slice(0, 10).map((item, index) => ({
      type: 'photo',
      media: item.url,
      ...(index === 0 && item.caption
        ? { caption: String(item.caption).slice(0, 1024), parse_mode: item.parseMode || 'HTML' }
        : {}),
    })),
  });
}

/** Acknowledge a button press so Telegram stops showing the loading spinner. */
export function answerCallbackQuery(token, callbackQueryId, { text, showAlert = false } = {}) {
  return callApi(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text: String(text).slice(0, 200) } : {}),
    show_alert: showAlert,
  });
}

/** Replace the text (and optionally the buttons) of a message the bot sent. */
export function editMessageText(token, chatId, messageId, text, { parseMode = 'HTML', disablePreview = true, replyMarkup } = {}) {
  return callApi(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: disablePreview,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/** Swap only the inline buttons under an existing message. */
export function editMessageReplyMarkup(token, chatId, messageId, replyMarkup) {
  return callApi(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

/** Populate the bot's command menu (the "/" suggestions in the chat). */
export function setMyCommands(token, commands) {
  return callApi(token, 'setMyCommands', { commands });
}

export function setWebhook(token, url, secret) {
  return callApi(token, 'setWebhook', {
    url,
    secret_token: secret,
    // callback_query is required for inline button presses to reach the handler.
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
}

export function deleteWebhook(token) {
  return callApi(token, 'deleteWebhook', { drop_pending_updates: false });
}

export function getWebhookInfo(token) {
  return callApi(token, 'getWebhookInfo');
}

export { escapeHtml };