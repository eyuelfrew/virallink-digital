import { Op } from 'sequelize';
import QRCode from 'qrcode';
import { TelegramClient, Logger } from 'teleproto';
import { CallbackQuery, NewMessage } from 'teleproto/events';
import { StringSession } from 'teleproto/sessions';
import { Api } from 'teleproto/tl';

import logger from '../config/logger.js';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { decryptToken, encryptToken } from './telegram-crypto.service.js';
import {
  ensurePersonalAccount,
  markPersonalAccountConnection,
  handleAccountMenuCallback,
  handleIncomingAccountMessage,
} from './telegram-auto-reply.service.js';

/**
 * Personal Telegram account connection (MTProto).
 *
 * This is the piece the original standalone bot had that a Bot API token cannot
 * provide: a person signs in as themselves, so the auto-reply answers their own
 * chats rather than messages sent to a bot.
 *
 * Credentials (api hash, phone, session string) are encrypted at rest. Only one
 * login attempt per user is kept in memory at a time; it expires, and the client
 * it holds is disconnected when cancelled. A saved session is reconnected on
 * process start, so a deployment restart does not silently stop answering chats.
 */

const { TelegramUserAccount, TelegramAutoReplyAccount } = models;

const PENDING_TTL_MS = 10 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 20000;
const SESSION_CHECK_TIMEOUT_MS = 15000;
const QR_FIRST_TIMEOUT_MS = 15000;

/** userId -> pending login attempt. */
const pendingLogins = new Map();
/** userId -> { client, account }. */
const runtimeClients = new Map();

async function withTimeout(promise, ms, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function telegramError(error, fallback = 'Telegram request failed.') {
  const code = error?.errorMessage || error?.message || '';
  if (code.includes('PHONE_CODE_INVALID')) return 'The login code is invalid.';
  if (code.includes('PHONE_CODE_EXPIRED')) return 'The login code expired. Send a new code and try again.';
  if (code.includes('PHONE_CODE_EMPTY')) return 'Enter the login code Telegram sent you.';
  if (code.includes('PASSWORD_HASH_INVALID')) return 'The 2FA password is incorrect.';
  if (code.includes('PHONE_NUMBER_INVALID')) return 'Telegram rejected the phone number.';
  if (code.includes('PHONE_NUMBER_BANNED')) return 'This phone number is banned from Telegram.';
  if (code.includes('API_ID_INVALID') || code.includes('API_HASH_INVALID')) {
    return 'Telegram rejected the API ID or API Hash.';
  }
  if (code.includes('FLOOD_WAIT')) return 'Telegram rate-limited the request. Wait a while and try again.';
  if (code.includes('AUTH_KEY_UNREGISTERED') || code.includes('SESSION_REVOKED')) {
    return 'This Telegram session was revoked. Sign in again.';
  }
  return code || fallback;
}

function isPasswordRequired(error) {
  const code = error?.errorMessage || error?.message || '';
  return code.includes('SESSION_PASSWORD_NEEDED');
}

function pendingKey(userId) {
  return Number(userId);
}

function pendingExpired(entry) {
  return Date.now() > (entry.expiresAt || entry.createdAt + PENDING_TTL_MS);
}

function pendingFor(userId) {
  const entry = pendingLogins.get(pendingKey(userId));

  if (!entry) {
    throw Object.assign(
      new Error('No Telegram login is in progress for this account. Start the sign-in again.'),
      { status: 400 },
    );
  }

  if (pendingExpired(entry)) {
    pendingLogins.delete(pendingKey(userId));
    entry.abortController?.abort();
    entry.client.disconnect().catch(() => {});
    throw Object.assign(
      new Error('The Telegram login attempt expired. Start the sign-in again.'),
      { status: 400 },
    );
  }

  return entry;
}

async function cancelPending(userId) {
  const key = pendingKey(userId);
  const entry = pendingLogins.get(key);
  if (!entry) return;
  pendingLogins.delete(key);
  entry.abortController?.abort();
  // The QR flow rejects with AbortError; swallow it so cancelling is quiet.
  entry.loginPromise?.catch(() => {});
  try {
    await entry.client.disconnect();
  } catch {
    // Best effort: the attempt is already gone from the map.
  }
}

/**
 * Revoke a saved session on Telegram's servers.
 *
 * Deleting `sessionString` from our database does NOT end the session:
 * Telegram keeps it authorized. That matters for login codes, because
 * `auth.sendCode` may answer with `SentCodeTypeApp` ("code sent through the
 * Telegram app"), which delivers the code as a service notification to the
 * account's *other logged-in sessions*. An orphaned API session is one of
 * those — it receives the code where no human can read it, and every later
 * attempt is swallowed the same way.
 *
 * Logging out is best-effort: an already-revoked or unreachable session must
 * not block the caller from forgetting it locally.
 */
async function revokeSessionString(config, userId) {
  if (!config?.sessionString || !config.apiId || !config.apiHash) return false;

  const client = new TelegramClient(
    new StringSession(config.sessionString),
    config.apiId,
    config.apiHash,
    { connectionRetries: 2, baseLogger: new Logger('none') },
  );

  try {
    await withTimeout(client.connect(), SESSION_CHECK_TIMEOUT_MS, 'Timed out connecting to Telegram.');
    await withTimeout(client.logOut(), SESSION_CHECK_TIMEOUT_MS, 'Timed out revoking the Telegram session.');
    logger.info({ userId }, 'saved telegram session revoked');
    return true;
  } catch (error) {
    const code = error?.errorMessage || error?.message || '';

    // Already revoked or invalidated by Telegram: there is nothing left to end,
    // and the caller may safely forget the stored string.
    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_DUPLICATED/.test(code)) {
      logger.info({ userId }, 'saved telegram session was already revoked');
      return true;
    }

    // A network/API failure is different: the session may still be authorized,
    // so keep it stored and try again later rather than orphaning it.
    logger.warn(
      { err: telegramError(error, 'Could not revoke the saved Telegram session.'), userId },
      'saved telegram session not revoked',
    );
    return false;
  } finally {
    await client.disconnect().catch(() => {});
  }
}

async function revokeSavedSession(row) {
  if (!row?.sessionString) return false;

  let config;
  try {
    config = decryptRow(row);
  } catch (error) {
    logger.warn({ err: error.message, userId: row.userId }, 'could not decrypt session to revoke it');
    return false;
  }

  return revokeSessionString(config, row.userId);
}

export function getPendingLoginStatus(userId) {
  const entry = pendingLogins.get(pendingKey(userId));
  if (!entry) return null;

  if (pendingExpired(entry)) {
    pendingLogins.delete(pendingKey(userId));
    entry.abortController?.abort();
    entry.client.disconnect().catch(() => {});
    return null;
  }

  return {
    status: entry.status,
    mode: entry.mode || 'code',
    is_code_via_app: Boolean(entry.isCodeViaApp),
    sms_available: entry.smsAvailable === undefined ? null : Boolean(entry.smsAvailable),
    delivery: entry.delivery || null,
    code_length: entry.codeLength || null,
    qr_url: entry.qrUrl || null,
    qr_data_url: entry.qrDataUrl || null,
    qr_expires_at: entry.qrExpiresAt || null,
    password_hint: entry.passwordHint || null,
    error: entry.error || null,
    created_at: new Date(entry.createdAt).toISOString(),
    expires_at: new Date(entry.expiresAt || entry.createdAt + PENDING_TTL_MS).toISOString(),
  };
}

function decryptRow(row) {
  if (!row) return null;

  try {
    return {
      apiId: Number(row.apiId) || 0,
      apiHash: decryptToken(row.apiHash),
      phoneNumber: decryptToken(row.phoneNumber),
      sessionString: row.sessionString ? decryptToken(row.sessionString) : '',
    };
  } catch (error) {
    const wrapped = new Error(
      'Saved Telegram credentials could not be decrypted. TELEGRAM_AUTO_REPLY_KEY or JWT_SECRET may have changed.',
    );
    wrapped.status = 500;
    wrapped.cause = error;
    throw wrapped;
  }
}

function safeAccount(row) {
  if (!row) return null;
  return {
    id: String(row.telegramUserId || ''),
    first_name: row.accountFirstName || '',
    last_name: row.accountLastName || '',
    username: row.accountUsername || '',
  };
}

export function getRuntime(userId) {
  const entry = runtimeClients.get(pendingKey(userId));
  if (!entry) return null;
  return { connected: true, account: entry.account, client: entry.client };
}

export function getRuntimeCount() {
  return runtimeClients.size;
}

async function autoReplyAccountFor(userId) {
  const account = await TelegramAutoReplyAccount.findOne({
    where: { ownerUserId: userId, provider: 'account' },
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  return account?.id || null;
}

export async function getStatus(userId) {
  const row = await TelegramUserAccount.findOne({ where: { userId } });
  const runtime = getRuntime(userId);

  if (!row) {
    return {
      apiId: null,
      apiHashSet: false,
      phoneNumber: '',
      sessionSet: false,
      source: 'none',
      configured: false,
      connected: false,
      account: null,
      status: 'disconnected',
      lastError: null,
      lastConnectedAt: null,
      autoReplyAccountId: null,
      pending_login: getPendingLoginStatus(userId),
      error: null,
    };
  }

  let decrypted = null;
  let error = null;

  try {
    decrypted = decryptRow(row);
  } catch (decryptError) {
    error = decryptError.message;
  }

  return {
    apiId: row.apiId || null,
    apiHashSet: Boolean(row.apiHash),
    phoneNumber: decrypted?.phoneNumber || '',
    sessionSet: Boolean(row.sessionString),
    source: 'database',
    configured: Boolean(row.apiId && row.apiHash && row.phoneNumber),
    connected: Boolean(runtime?.connected),
    account: runtime?.account || safeAccount(row),
    status: row.status,
    lastError: error || row.lastError || null,
    lastConnectedAt: row.lastConnectedAt,
    autoReplyAccountId: await autoReplyAccountFor(userId),
    pending_login: getPendingLoginStatus(userId),
    error,
  };
}

export async function saveCredentials(userId, { apiId, apiHash, phoneNumber }) {
  const nextApiId = Number(apiId);
  const nextApiHash = String(apiHash || '').trim();
  const nextPhoneNumber = String(phoneNumber || '').trim();

  if (!Number.isFinite(nextApiId) || nextApiId <= 0) {
    throw AppError.badRequest('API ID must be a positive number.');
  }
  if (!/^\+?[0-9]{8,16}$/.test(nextPhoneNumber)) {
    throw AppError.badRequest('Phone number must be in international format, e.g. +251912345678.');
  }

  let row = await TelegramUserAccount.findOne({ where: { userId } });
  const current = row ? decryptRow(row) : null;

  const hashToSave = nextApiHash || current?.apiHash;
  if (!hashToSave) throw AppError.badRequest('API Hash is required.');

  const credentialsChanged =
    !current ||
    Number(current.apiId) !== nextApiId ||
    current.apiHash !== hashToSave ||
    current.phoneNumber !== nextPhoneNumber;

  await cancelPending(userId);
  if (credentialsChanged) {
    await disconnect(userId, { keepStatus: true });
    // Forget the old session on Telegram's side too, not just locally.
    if (row) await revokeSavedSession(row);
  }

  if (!row) {
    row = await TelegramUserAccount.create({
      userId,
      apiId: nextApiId,
      apiHash: encryptToken(hashToSave),
      phoneNumber: encryptToken(nextPhoneNumber),
      sessionString: null,
      status: 'disconnected',
    });
  } else {
    await row.update({
      apiId: nextApiId,
      apiHash: encryptToken(hashToSave),
      phoneNumber: encryptToken(nextPhoneNumber),
      sessionString: credentialsChanged ? null : row.sessionString,
      status: credentialsChanged ? 'disconnected' : row.status,
      ...(credentialsChanged
        ? {
            telegramUserId: null,
            accountFirstName: null,
            accountLastName: null,
            accountUsername: null,
            lastError: null,
          }
        : {}),
    });
  }

  if (credentialsChanged) {
    await markPersonalAccountConnection(row, { connected: false });
  }

  return getStatus(userId);
}

function describeCodeDelivery(type) {
  if (type instanceof Api.auth.SentCodeTypeApp) return 'telegram_app';
  if (type instanceof Api.auth.SentCodeTypeSms || type instanceof Api.auth.SentCodeTypeFirebaseSms) return 'sms';
  if (
    type instanceof Api.auth.SentCodeTypeCall ||
    type instanceof Api.auth.SentCodeTypeFlashCall ||
    type instanceof Api.auth.SentCodeTypeMissedCall
  ) {
    return 'call';
  }
  if (type instanceof Api.auth.SentCodeTypeFragmentSms) return 'fragment';
  if (
    type instanceof Api.auth.SentCodeTypeEmailCode ||
    type instanceof Api.auth.SentCodeTypeSetUpEmailRequired
  ) {
    return 'email';
  }
  return 'unknown';
}

/**
 * Ask Telegram for a login code and report *how* it will arrive.
 *
 * The library's `sendCode` hides `nextType`, which is the only way to know
 * whether "send by SMS" is even possible. Telegram frequently answers
 * `sentCodeTypeApp` with no `nextType`; in that case it will not send an SMS,
 * no matter how many times the user presses the button.
 */
async function requestLoginCode(client, config, { forceSms = false } = {}) {
  const send = () =>
    client.invoke(
      new Api.auth.SendCode({
        phoneNumber: config.phoneNumber,
        apiId: config.apiId,
        apiHash: config.apiHash,
        settings: new Api.CodeSettings({}),
      }),
    );

  let sent;
  try {
    sent = await send();
  } catch (error) {
    if (error?.errorMessage === 'AUTH_RESTART') {
      sent = await send();
    } else {
      throw error;
    }
  }

  if (sent instanceof Api.auth.SentCodeSuccess) {
    throw Object.assign(new Error('Telegram logged in immediately; no code is needed.'), { status: 400 });
  }
  if (!(sent instanceof Api.auth.SentCode)) {
    throw new Error('Telegram returned an unexpected response while sending the code.');
  }

  const read = (value) => ({
    phoneCodeHash: value.phoneCodeHash,
    type: value.type,
    delivery: describeCodeDelivery(value.type),
    smsAvailable: value.nextType instanceof Api.auth.CodeTypeSms,
    codeLength: value.type?.length || null,
    timeout: value.timeout || null,
  });

  let result = read(sent);

  if (result.delivery === 'email') {
    throw Object.assign(
      new Error(
        'Telegram wants to verify this login by email instead of a phone code. Use "Connect with QR code" to sign in without a code.',
      ),
      { status: 400 },
    );
  }

  /*
   * "Send by SMS" only works when Telegram offers SMS as `nextType`. If it
   * does not, resending would either fail or send another in-app code, so
   * report the truth instead of pretending an SMS went out.
   */
  if (forceSms && result.smsAvailable && result.delivery !== 'sms') {
    const resent = await client.invoke(
      new Api.auth.ResendCode({
        phoneNumber: config.phoneNumber,
        phoneCodeHash: result.phoneCodeHash,
      }),
    );
    if (resent instanceof Api.auth.SentCode) {
      result = read(resent);
    } else if (resent instanceof Api.auth.SentCodeSuccess) {
      throw Object.assign(new Error('Telegram logged in immediately; no code is needed.'), { status: 400 });
    }
  }

  return result;
}

export async function sendLoginCode(userId, { forceSms = false } = {}) {
  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (!row) throw AppError.badRequest('Save your API ID, API Hash and phone number first.');

  const config = decryptRow(row);
  if (!config.apiId || !config.apiHash) {
    throw AppError.badRequest('Save API ID and API Hash before sending a login code.');
  }
  if (!config.phoneNumber) {
    throw AppError.badRequest('Save a phone number before sending a login code.');
  }

  /*
   * Requesting a code revokes the saved session below. Doing that while the
   * account is connected would silently sign the working session out, so make
   * the user disconnect first instead of destroying a working connection.
   */
  if (getRuntime(userId)?.connected) {
    throw AppError.badRequest(
      'This Telegram account is already connected. Disconnect it before signing in again.',
    );
  }

  await disconnect(userId, { keepStatus: true });
  await cancelPending(userId);
  await markPersonalAccountConnection(row, { connected: false });

  /*
   * Get rid of an older session before asking for a code. Telegram decides the
   * delivery channel from the account's other authorized sessions; a stale API
   * session makes it answer "sent through the app" and the code disappears into
   * a connection nobody is reading. Revoking it first makes the phone (or SMS)
   * the only place left.
   */
  if (row.sessionString) {
    const revoked = await revokeSavedSession(row);
    if (revoked) {
      await row.update({ sessionString: null, status: 'disconnected' });
      row.sessionString = null;
    }
  }

  const client = new TelegramClient(
    new StringSession(''),
    config.apiId,
    config.apiHash,
    { connectionRetries: 5, baseLogger: new Logger('none') },
  );

  try {
    await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to Telegram.');
    const result = await withTimeout(
      requestLoginCode(client, config, { forceSms }),
      CONNECT_TIMEOUT_MS,
      'Timed out requesting the Telegram login code.',
    );

    if (!result?.phoneCodeHash) {
      throw new Error('Telegram did not return a login code hash.');
    }

    pendingLogins.set(pendingKey(userId), {
      mode: 'code',
      client,
      phoneNumber: config.phoneNumber,
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.delivery === 'telegram_app',
      smsAvailable: result.smsAvailable,
      delivery: result.delivery,
      codeLength: result.codeLength,
      status: 'code_sent',
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_TTL_MS,
    });

    await row.update({ status: 'code_sent', lastError: null });

    logger.info(
      {
        userId,
        delivery: result.delivery,
        smsAvailable: result.smsAvailable,
        forceSmsRequested: forceSms,
      },
      'telegram login code requested',
    );

    return {
      status: 'code_sent',
      phone_number: config.phoneNumber,
      is_code_via_app: result.delivery === 'telegram_app',
      delivery: result.delivery,
      sms_available: result.smsAvailable,
      sms_requested: forceSms,
      sms_sent: forceSms && result.delivery === 'sms',
      code_length: result.codeLength,
      timeout: result.timeout,
    };
  } catch (error) {
    client.disconnect().catch(() => {});
    const message = telegramError(error, 'Could not send the Telegram login code.');
    await row.update({ status: 'error', lastError: message.slice(0, 500) });
    await markPersonalAccountConnection(row, { connected: false, error: message });
    throw Object.assign(new Error(message), { status: 400 });
  }
}

/**
 * Sign in by QR code.
 *
 * Telegram's code delivery is unreliable for accounts that already have
 * sessions: it answers `sentCodeTypeApp` and refuses SMS (`nextType` is null),
 * so the code exists only inside the account's other Telegram clients. Scanning
 * a QR code from the phone authorizes this session directly and does not depend
 * on any code being delivered.
 */
export async function startQrLogin(userId) {
  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (!row) throw AppError.badRequest('Save your API ID and API Hash first.');

  const config = decryptRow(row);
  if (!config.apiId || !config.apiHash) {
    throw AppError.badRequest('Save API ID and API Hash before connecting with a QR code.');
  }

  if (getRuntime(userId)?.connected) {
    throw AppError.badRequest(
      'This Telegram account is already connected. Disconnect it before linking it again.',
    );
  }

  await cancelPending(userId);
  await disconnect(userId, { keepStatus: true });
  await markPersonalAccountConnection(row, { connected: false });
  if (row.lastError || row.status === 'error') {
    await row.update({ status: 'disconnected', lastError: null });
  }

  const client = new TelegramClient(
    new StringSession(''),
    config.apiId,
    config.apiHash,
    { connectionRetries: 5, baseLogger: new Logger('none') },
  );

  const entry = {
    mode: 'qr',
    client,
    phoneNumber: config.phoneNumber,
    status: 'qr_pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_TTL_MS,
    abortController: new AbortController(),
    qrUrl: null,
    qrDataUrl: null,
    qrExpiresAt: null,
    passwordHint: null,
    error: null,
    firstQrResolve: null,
  };

  pendingLogins.set(pendingKey(userId), entry);

  const firstQr = new Promise((resolve) => {
    entry.firstQrResolve = resolve;
  });

  entry.loginPromise = (async () => {
    try {
      await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to Telegram.');

      const me = await client.signInUserWithQrCode(
        { apiId: config.apiId, apiHash: config.apiHash },
        {
          qrCode: async ({ token, expires }) => {
            const url = `tg://login?token=${token.toString('base64url')}`;
            const dataUrl = await QRCode.toDataURL(url, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 320,
              color: { dark: '#0f172a', light: '#ffffff' },
            });

            entry.qrUrl = url;
            entry.qrDataUrl = dataUrl;
            entry.qrExpiresAt = expires ? new Date(expires * 1000).toISOString() : null;
            entry.expiresAt = Date.now() + PENDING_TTL_MS;
            entry.firstQrResolve?.();
          },
          /*
           * Stop the library's 2FA handling and let the API collect the
           * password. `verifyLoginPassword` then calls signInWithPassword with
           * the same client, after the QR token has already been approved.
           */
          password: async () => {
            entry.qrPasswordRequired = true;
            throw Object.assign(new Error('Telegram 2FA password required.'), {
              qrPasswordRequired: true,
            });
          },
          onError: async (error) => {
            logger.warn(
              { err: error?.errorMessage || error?.message, userId },
              'telegram qr login flow error',
            );
            return true;
          },
          abortSignal: entry.abortController.signal,
        },
      );

      const account = await finishLogin(userId, client, {
        phoneNumber: me?.phone ? `+${String(me.phone).replace(/^\+/, '')}` : null,
      });
      entry.status = 'connected';
      entry.account = account?.account || null;
      logger.info({ userId }, 'telegram qr login connected');
      return account;
    } catch (error) {
      const code = error?.errorMessage || error?.message || '';

      if (entry.qrPasswordRequired && /AUTH_USER_CANCEL|2FA password required/.test(code)) {
        entry.status = 'password_required';
        entry.error = null;
        entry.expiresAt = Date.now() + PENDING_TTL_MS;
        return null;
      }

      if (error?.name === 'AbortError' || /AUTH_USER_CANCEL/.test(code)) {
        entry.status = 'cancelled';
        entry.error = 'The QR sign-in was cancelled.';
        return null;
      }

      const message = telegramError(error, 'Could not sign in with the QR code.');
      entry.status = 'error';
      entry.error = message;
      entry.expiresAt = Date.now() + 60 * 1000;

      const freshRow = await TelegramUserAccount.findOne({ where: { userId } });
      if (freshRow) {
        await freshRow.update({ status: 'error', lastError: message.slice(0, 500) });
        await markPersonalAccountConnection(freshRow, { connected: false, error: message });
      }
      logger.warn({ err: message, userId }, 'telegram qr login failed');
      return null;
    } finally {
      entry.firstQrResolve?.();
    }
  })();

  /*
   * Return as soon as the first QR image exists. The rest of the flow keeps
   * running in the background while the browser polls /account/status.
   */
  await Promise.race([
    firstQr,
    entry.loginPromise,
    withTimeout(new Promise(() => {}), QR_FIRST_TIMEOUT_MS, 'Timed out generating the QR code.'),
  ]).catch(() => {});

  if (!entry.qrDataUrl) {
    const message = entry.error || 'Telegram did not generate a QR code. Try again.';
    await cancelPending(userId);
    throw Object.assign(new Error(message), { status: 400 });
  }

  return getStatus(userId);
}

async function attachMessageHandler(client, userAccount) {
  client.addEventHandler(async (event) => {
    try {
      const message = event?.message;
      if (!message || message.out || !message.isPrivate) return;

      const sender = await message.getSender();
      if (!sender || sender.bot || sender.isBot) return;

      let text = String(message.text || message.caption || '').trim();
      if (!text) return;

      if (text.startsWith('/')) {
        const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
        if (command === '/start') {
          text = text.slice('/start'.length).trim() || 'start';
        } else if (command === '/menu') {
          text = '/menu';
        } else {
          return;
        }
      }

      const account = await ensurePersonalAccount(userAccount);
      if (!account?.isActive) return;

      const chatId = message.chatId;
      if (!chatId) return;

      const chat = {
        id: chatId,
        type: 'private',
        title: [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || null,
      };

      const senderInfo = {
        id: String(sender.id ?? ''),
        username: sender.username || null,
        first_name: sender.firstName || null,
        last_name: sender.lastName || null,
      };

      await handleIncomingAccountMessage({
        account,
        client,
        chat,
        sender: senderInfo,
        text,
        messageId: Number(message.id),
      });
    } catch (error) {
      logger.warn(
        { err: error.message, userId: userAccount.userId },
        'personal telegram message handling failed',
      );
    }
  }, new NewMessage({}));

  client.addEventHandler(async (event) => {
    try {
      const data = event.data ? Buffer.from(event.data).toString('utf8') : '';
      if (!data.startsWith('menu:') || event.isPrivate === false) return;

      const chatId = Number(event.chatId?.toString());
      if (!Number.isFinite(chatId) || !chatId) return;

      const account = await ensurePersonalAccount(userAccount);
      if (!account?.isActive) return;

      await handleAccountMenuCallback({
        account,
        client,
        chatId,
        messageId: Number(event.messageId),
        data,
        answer: () => event.answer(),
      });
    } catch (error) {
      logger.warn(
        { err: error.message, userId: userAccount.userId },
        'personal telegram callback handling failed',
      );
    }
  }, new CallbackQuery({}));

  return client;
}

async function activateRuntime(userAccount, client) {
  await attachMessageHandler(client, userAccount);

  const me = await client.getMe();
  const account = {
    id: String(me?.id ?? ''),
    first_name: me?.firstName || '',
    last_name: me?.lastName || '',
    username: me?.username || '',
  };

  /*
   * QR sign-in can link a different number than the one saved in the form.
   * Telegram returns the account's own phone with getMe(), so keep the stored
   * number in sync and the panel will show the number that is actually linked.
   */
  let phoneUpdate = {};
  if (me?.phone) {
    const nextPhone = `+${String(me.phone).replace(/^\+/, '')}`;
    try {
      const currentPhone = decryptToken(userAccount.phoneNumber);
      if (currentPhone !== nextPhone) phoneUpdate = { phoneNumber: encryptToken(nextPhone) };
    } catch {
      phoneUpdate = { phoneNumber: encryptToken(nextPhone) };
    }
  }

  const updated = await userAccount.update({
    telegramUserId: Number(me?.id) || null,
    accountFirstName: me?.firstName || null,
    accountLastName: me?.lastName || null,
    accountUsername: me?.username || null,
    status: 'connected',
    lastError: null,
    lastConnectedAt: new Date(),
    ...phoneUpdate,
  });

  runtimeClients.set(pendingKey(userAccount.userId), { client, account });

  const autoReplyAccount = await ensurePersonalAccount(updated);
  await markPersonalAccountConnection(updated, { connected: true });

  logger.info(
    { userId: userAccount.userId, telegramId: account.id, autoReplyAccountId: autoReplyAccount?.id },
    'personal telegram account connected',
  );

  return account;
}

async function finishLogin(userId, client, { phoneNumber = null } = {}) {
  const sessionString = client.session.save();
  if (!sessionString) throw new Error('Telegram did not return a session string.');

  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (!row) throw AppError.badRequest('Saved Telegram credentials are missing.');

  // Remember the old session so a QR sign-in does not leave it authorized on
  // Telegram's side, where it could keep intercepting login codes.
  let previousConfig = null;
  try {
    previousConfig = decryptRow(row);
  } catch {
    // A credential decryption problem will surface from activateRuntime below.
  }

  const normalizedPhone = phoneNumber
    ? `+${String(phoneNumber).replace(/^\+/, '')}`
    : null;

  await row.update({
    sessionString: encryptToken(sessionString),
    ...(normalizedPhone ? { phoneNumber: encryptToken(normalizedPhone) } : {}),
  });
  pendingLogins.delete(pendingKey(userId));

  if (previousConfig?.sessionString && previousConfig.sessionString !== sessionString) {
    // Do not hold the sign-in response hostage to a slow logout.
    revokeSessionString(previousConfig, userId).catch(() => {});
  }

  const account = await activateRuntime(row, client);
  return { status: 'connected', account };
}

export async function verifyLoginCode(userId, code) {
  const current = pendingFor(userId);
  const phoneCode = String(code || '').trim();

  if (!phoneCode) throw AppError.badRequest('Enter the login code Telegram sent you.');

  try {
    await withTimeout(
      current.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: current.phoneNumber,
          phoneCodeHash: current.phoneCodeHash,
          phoneCode,
        }),
      ),
      CONNECT_TIMEOUT_MS,
      'Timed out verifying the Telegram login code.',
    );

    return await finishLogin(userId, current.client);
  } catch (error) {
    if (isPasswordRequired(error)) {
      current.status = 'password_required';
      const row = await TelegramUserAccount.findOne({ where: { userId } });
      if (row) await row.update({ status: 'password_required', lastError: null });
      return { status: 'password_required' };
    }

    const message = telegramError(error, 'Could not verify the Telegram login code.');
    const row = await TelegramUserAccount.findOne({ where: { userId } });
    if (row) await row.update({ status: 'error', lastError: message.slice(0, 500) });
    throw Object.assign(new Error(message), { status: 400 });
  }
}

export async function verifyLoginPassword(userId, password) {
  const current = pendingFor(userId);

  if (current.status !== 'password_required') {
    throw AppError.badRequest('Telegram has not asked for a 2FA password for this login.');
  }

  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (!row) throw AppError.badRequest('Saved Telegram credentials are missing.');

  const config = decryptRow(row);
  const value = String(password || '');
  if (!value) throw AppError.badRequest('Enter your Telegram 2FA password.');

  try {
    const me = await withTimeout(
      current.client.signInWithPassword(
        { apiId: config.apiId, apiHash: config.apiHash },
        {
          password: async () => value,
          // Rethrow so the original Telegram error (e.g. PASSWORD_HASH_INVALID)
          // reaches telegramError(). Returning true would become AUTH_USER_CANCEL.
          onError: async (error) => {
            throw error;
          },
        },
      ),
      CONNECT_TIMEOUT_MS,
      'Timed out verifying the Telegram 2FA password.',
    );

    return await finishLogin(userId, current.client, {
      phoneNumber: me?.phone ? `+${String(me.phone).replace(/^\+/, '')}` : null,
    });
  } catch (error) {
    const message = telegramError(error, 'Could not verify the Telegram 2FA password.');

    if (current.mode === 'qr') {
      // Keep the QR sign-in alive so the user can try the password again.
      current.status = 'password_required';
      current.error = message;
      current.expiresAt = Date.now() + PENDING_TTL_MS;
      await row.update({ status: 'password_required', lastError: message.slice(0, 500) });
    } else {
      await row.update({ status: 'error', lastError: message.slice(0, 500) });
    }

    throw Object.assign(new Error(message), { status: 400 });
  }
}

export async function cancelLogin(userId) {
  await cancelPending(userId);
  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (row && row.status !== 'connected') {
    await row.update({ status: 'disconnected', lastError: null });
  }
  return { status: 'cancelled' };
}

async function startRuntime(userAccount, { throwOnError = false } = {}) {
  const config = decryptRow(userAccount);
  if (!config.apiId || !config.apiHash || !config.phoneNumber) {
    if (throwOnError) throw AppError.badRequest('Telegram API credentials are incomplete.');
    return null;
  }
  if (!config.sessionString) {
    if (throwOnError) throw AppError.badRequest('Sign in with Telegram before connecting.');
    return null;
  }

  const client = new TelegramClient(
    new StringSession(config.sessionString),
    config.apiId,
    config.apiHash,
    { connectionRetries: 5, baseLogger: new Logger('none') },
  );

  try {
    await withTimeout(client.connect(), SESSION_CHECK_TIMEOUT_MS, 'Timed out connecting to Telegram.');
    const authorized = await withTimeout(
      client.checkAuthorization(),
      SESSION_CHECK_TIMEOUT_MS,
      'Timed out checking Telegram authorization.',
    );

    if (!authorized) {
      // Tag it like Telegram's own error so the cleanup below recognises it.
      throw Object.assign(new Error('The saved Telegram session is no longer authorized.'), {
        errorMessage: 'SESSION_REVOKED',
      });
    }

    return await activateRuntime(userAccount, client);
  } catch (error) {
    client.disconnect().catch(() => {});
    const message = telegramError(error, 'Could not start the Telegram session.');
    const code = error?.errorMessage || error?.message || '';

    /*
     * A session Telegram itself has invalidated can never work again. Dropping
     * the stored string stops every later boot from retrying it — and, more
     * importantly, stops it being counted as an existing session.
     */
    const deadSession = /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_DUPLICATED/.test(code);

    await userAccount.update({
      status: 'error',
      lastError: message.slice(0, 500),
      ...(deadSession ? { sessionString: null } : {}),
    });
    await markPersonalAccountConnection(userAccount, { connected: false, error: message });
    logger.warn({ err: message, userId: userAccount.userId, deadSession }, 'personal telegram session failed to start');
    if (throwOnError) throw Object.assign(new Error(message), { status: 400 });
    return null;
  }
}

export async function connect(userId) {
  await cancelPending(userId);
  await disconnect(userId, { keepStatus: true });

  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (!row) throw AppError.badRequest('Save your Telegram credentials and sign in first.');

  const account = await startRuntime(row, { throwOnError: true });
  return account;
}

export async function disconnect(userId, { keepStatus = false } = {}) {
  const key = pendingKey(userId);
  const entry = runtimeClients.get(key);
  runtimeClients.delete(key);

  if (entry?.client) {
    try {
      await entry.client.disconnect();
    } catch (error) {
      logger.warn({ err: error.message, userId }, 'error disconnecting personal telegram client');
    }
  }

  if (!keepStatus) {
    const row = await TelegramUserAccount.findOne({ where: { userId } });
    if (row) {
      await row.update({ status: 'disconnected' });
      await markPersonalAccountConnection(row, { connected: false });
    }
  }

  return { connected: false };
}

export async function clearSession(userId) {
  await cancelPending(userId);
  await disconnect(userId, { keepStatus: true });

  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (row) {
    // End it on Telegram's side as well; otherwise it stays authorized and can
    // intercept later login codes as an "other logged-in session".
    await revokeSavedSession(row);

    await row.update({
      sessionString: null,
      status: 'disconnected',
      telegramUserId: null,
      accountFirstName: null,
      accountLastName: null,
      accountUsername: null,
      lastError: null,
    });
    await markPersonalAccountConnection(row, { connected: false });
  }

  return getStatus(userId);
}

export async function resetAccount(userId) {
  await cancelPending(userId);
  await disconnect(userId, { keepStatus: true });

  const row = await TelegramUserAccount.findOne({ where: { userId } });
  if (row) {
    // Reset must end the Telegram session too, not only forget it locally.
    await revokeSavedSession(row);

    // Detach rather than cascade-delete the auto-reply row, so the user keeps
    // their conversation history, settings, catalog and rules.
    await TelegramAutoReplyAccount.update(
      { userAccountId: null, connectionStatus: 'disconnected' },
      { where: { userAccountId: row.id } },
    );
    await row.destroy();
  }

  return getStatus(userId);
}

export async function startAllTelegramAccounts() {
  const rows = await TelegramUserAccount.findAll({
    where: { sessionString: { [Op.ne]: null } },
  }).catch(() => []);

  for (const row of rows) {
    try {
      await startRuntime(row);
    } catch (error) {
      logger.warn({ err: error.message, userId: row.userId }, 'could not restore personal telegram session');
    }
  }

  logger.info({ count: rows.length }, 'personal telegram sessions restored');

  return rows.length;
}

export async function disconnectAllTelegramAccounts() {
  const userIds = [...runtimeClients.keys()];
  for (const userId of userIds) {
    await disconnect(userId, { keepStatus: true });
  }
}

export default {
  getStatus,
  saveCredentials,
  sendLoginCode,
  verifyLoginCode,
  verifyLoginPassword,
  cancelLogin,
  connect,
  disconnect,
  clearSession,
  resetAccount,
  startAllTelegramAccounts,
  disconnectAllTelegramAccounts,
};
