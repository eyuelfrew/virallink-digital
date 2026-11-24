import { Op } from 'sequelize';
import { models } from '../models/index.js';
import logger from '../config/logger.js';
import fs from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

const { PushToken, PushOutbox, User } = models;

const MAX_ATTEMPTS = 5;

/**
 * Firebase Cloud Messaging, over the HTTP v1 API.
 *
 * We deliberately do not pull in firebase-admin: it is a large dependency for
 * one HTTP call, and the v1 API is a single POST. Authentication is an OAuth2
 * access token obtained by signing a JWT with the service account's private
 * key — jose is already a dependency, so nothing new is needed.
 *
 * Configuration is optional. With no service account the whole module no-ops, the
 * same way the Telegram module does when TELEGRAM_ENABLED is false: enqueue
 * succeeds, delivery is skipped, and the API keeps working.
 */

let cachedCredentials = null;
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function loadCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')
      : null);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    cachedCredentials = parsed;
    return parsed;
  } catch {
    logger.warn('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
}

export function isEnabled() {
  return Boolean(loadCredentials());
}

async function getAccessToken() {
  const creds = loadCredentials();
  if (!creds) return null;

  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  try {
    const privateKey = await importPKCS8(creds.private_key, 'RS256');
    const jwt = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(creds.client_email)
      .setSubject(creds.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, body: text }, 'FCM token exchange failed');
      return null;
    }

    const data = await response.json();
    cachedAccessToken = data.access_token;
    cachedAccessTokenExpiresAt = now + (data.expires_in || 3600) * 1000;
    return cachedAccessToken;
  } catch (error) {
    logger.warn({ err: error.message }, 'FCM token exchange threw');
    return null;
  }
}

async function sendOne(token, message) {
  const creds = loadCredentials();
  const accessToken = await getAccessToken();
  if (!creds || !accessToken) return { ok: false, invalid: false, error: 'not configured' };

  const url = `https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { token, ...message } }),
    });

    if (response.ok) return { ok: true, invalid: false };

    const data = await response.json().catch(() => ({}));
    const errorCode = data?.error?.details?.[0]?.errorCode || data?.error?.status;
    const invalid = errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT' || response.status === 404;

    return { ok: false, invalid, error: data?.error?.message || `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, invalid: false, error: error.message };
  }
}

/**
 * Register (or refresh) a device token for a user.
 *
 * A token is unique across devices, so re-registering the same token just
 * updates its owner and platform.
 */
export async function registerToken(userId, token, platform = 'android') {
  if (!userId || !token) return null;

  try {
    const existing = await PushToken.findOne({ where: { token } });
    if (existing) {
      await existing.update({ userId, platform });
      return existing;
    }
    return await PushToken.create({ userId, token, platform });
  } catch (error) {
    logger.warn({ err: error.message, userId }, 'push token registration failed');
    return null;
  }
}

/** Remove a device token. */
export async function unregisterToken(userId, token) {
  if (!userId || !token) return 0;
  try {
    return await PushToken.destroy({ where: { userId, token } });
  } catch (error) {
    logger.warn({ err: error.message, userId }, 'push token unregistration failed');
    return 0;
  }
}

/**
 * Send a push notification to every device belonging to a user.
 *
 * Invalid tokens are removed so they do not accumulate. Delivery is best-effort
 * and never throws.
 */
export async function sendPush(userId, { title, body, data = {}, image = null }) {
  if (!userId || !isEnabled()) return { sent: 0, failed: 0 };

  const tokens = await PushToken.findAll({ where: { userId } });
  if (!tokens.length) return { sent: 0, failed: 0 };

  const message = {
    notification: { title, body, ...(image ? { image } : {}) },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: {
      priority: 'high',
      notification: { channelId: 'virallink_default', ...(image ? { image } : {}) },
    },
    apns: {
      payload: {
        aps: { sound: 'default', ...(image ? { 'mutable-content': 1 } : {}) },
      },
      ...(image ? { fcm_options: { image } } : {}),
    },
  };

  let sent = 0;
  let failed = 0;

  for (const row of tokens) {
    const result = await sendOne(row.token, message);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (result.invalid) {
        await row.destroy().catch(() => {});
      }
    }
  }

  return { sent, failed };
}

/**
 * Queue a push notification for later delivery.
 */
export async function enqueuePush({ userId, kind, title, body, data = {}, image = null }) {
  if (!userId) return null;

  try {
    const row = await PushOutbox.create({
      userId,
      kind,
      payload: { title, body, data, image: image || null },
      status: 'pending',
    });

    // Best-effort immediate delivery; the cron drain is the safety net.
    // Only attempt delivery when FCM is actually configured, otherwise the
    // row just sits in the inbox until it is.
    if (isEnabled()) {
      drainPushOutbox().catch((error) => logger.warn({ err: error.message }, 'push drain failed'));
    }
    return row;
  } catch (error) {
    logger.warn({ err: error.message, kind }, 'failed to enqueue push notification');
    return null;
  }
}

/**
 * Deliver pending push notifications, oldest first.
 */
export async function drainPushOutbox(limit = 25) {
  if (!isEnabled()) return { sent: 0, failed: 0 };

  const rows = await PushOutbox.findAll({
    where: { status: 'pending', attempts: { [Op.lt]: MAX_ATTEMPTS } },
    order: [['createdAt', 'ASC']],
    limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const { title, body, data, image } = row.payload || {};
      const result = await sendPush(row.userId, { title, body, data, image });

      if (result.sent > 0) {
        await row.update({ status: 'sent', sentAt: new Date(), attempts: row.attempts + 1, lastError: null });
        sent += 1;
      } else {
        const attempts = row.attempts + 1;
        await row.update({
          attempts,
          lastError: 'no device reached',
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        });
        failed += 1;
      }
    } catch (error) {
      const attempts = row.attempts + 1;
      await row.update({
        attempts,
        lastError: String(error.message).slice(0, 250),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      });
      failed += 1;
    }
  }

  return { sent, failed };
}
