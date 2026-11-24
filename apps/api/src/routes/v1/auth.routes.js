import { Router } from 'express';
import { models } from '../../models/index.js';
import { v } from '../../middleware/schemas.js';
import { authLimiter, passwordResetLimiter } from '../../middleware/rateLimit.js';
import AppError from '../../utils/AppError.js';
import {
  login,
  refresh,
  logout,
  changePassword,
  changeHandles,
  toPublicUser,
  loadUserWithRoles,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from '../../services/auth.service.js';
import { requireAuth, verifyAccessToken } from '../../services/token.service.js';
import { createLinkCode, linkStatus, unlink } from '../../services/telegram-link.service.js';
import { requestResetCode, redeemResetCode } from '../../services/password-reset.service.js';
import * as pushService from '../../services/push.service.js';
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import env from '../../config/env.js';
import { ROLES } from '../../shared/enums.js';

const authenticate = requireAuth(models);

/**
 * Authentication routes.
 *
 * Tokens are returned in two ways at once: an httpOnly cookie for the browser,
 * and the access token in the response body so a server-to-server caller (the
 * Next.js route handlers) can forward it as a bearer token. Cookies are the
 * primary mechanism because httpOnly keeps them out of reach of page scripts.
 */
const router = Router();

/** Set or clear the session cookies. */
function setSessionCookies(response, { accessToken, refreshToken }) {
  response.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  response.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

function clearSessionCookies(response) {
  response.clearCookie(ACCESS_COOKIE, clearCookieOptions());
  response.clearCookie(REFRESH_COOKIE, clearCookieOptions());
}

/**
 * GET /api/v1/auth/setup-status
 *
 * Reports whether the install has any administrator yet.
 *
 * This exists because of the deployment target. The app is hosted on cPanel, where
 * the only thing that can be started is the Node.js application itself — there is
 * no shell available to run `npm run create:admin`. The schema and the RBAC roles
 * create themselves on boot, but a *person* cannot: without this, a fresh install
 * has no way to sign in and no way to create the first account.
 *
 * Unauthenticated by necessity, so it returns nothing but a boolean. It cannot be
 * used to enumerate accounts.
 */
router.get('/setup-status', async (_request, response) => {
  const count = await models.User.count();
  response.json({ data: { needsSetup: count === 0 } });
});

/**
 * POST /api/v1/auth/setup
 *
 * Creates the first SUPER_ADMIN. Permanently unavailable once any user exists.
 *
 * The guard is the whole point: this route can mint an administrator with no
 * credentials, so it must become unreachable the instant a real account is made.
 * The check is repeated inside the insert rather than trusted from the status
 * endpoint, because two simultaneous requests on an empty install would otherwise
 * both pass a "count === 0" test and create two super admins.
 *
 * Rate limited on the same budget as login, since guessing a password here is as
 * attractive an attack as guessing one there.
 */
router.post('/setup', authLimiter, v('setupAdmin'), async (request, response) => {
  const existing = await models.User.count();
  if (existing > 0) {
    throw AppError.forbidden('Setup has already been completed. Sign in instead.');
  }

  const { name, identifier, email, password } = request.body;

  const handle = (identifier ?? email ?? '').trim();
  const isEmail = handle.includes('@');
  const user = await models.User.create({
    name,
    email: isEmail ? handle.toLowerCase() : null,
    username: isEmail ? null : handle.toLowerCase(),
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    isActive: true,
  });

  const superAdmin = await models.Role.findOne({ where: { key: ROLES.SUPER_ADMIN } });
  if (superAdmin) await user.setRoles([superAdmin]);

  // Deliberately does not sign them in. The response tells the client setup is
  // done; the login form takes it from there, which keeps one code path for
  // establishing a session.
  response.status(201).json({ data: { created: true } });
});

/**
 * POST /api/v1/auth/login
 *
 * Rate limited more tightly than the rest of the API, and successful requests do
 * not count against the limit so a legitimate user is never locked out.
 */
router.post('/login', authLimiter, v('login'), async (request, response) => {
  const { identifier, email, password } = request.body;

  const result = await login({
    identifier: identifier ?? email,
    email,
    password,
    ip: request.ip,
    userAgent: request.get('user-agent'),
  });

  setSessionCookies(response, result);

  response.json({
    data: {
      user: toPublicUser(result.user),
      // Returned for server-to-server callers. The browser relies on the cookie.
      accessToken: result.accessToken,
      expiresIn: 900,
    },
  });
});

/**
 * POST /api/v1/auth/refresh
 *
 * Exchanges the refresh cookie (or a supplied token) for a new pair, rotating
 * the refresh token so each one is single-use.
 */
router.post('/refresh', async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE] || request.body?.refreshToken;

  if (!token) {
    clearSessionCookies(response);
    throw AppError.unauthorized('No active session');
  }

  try {
    const result = await refresh({
      refreshToken: token,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });

    setSessionCookies(response, result);

    response.json({
      data: { user: toPublicUser(result.user), accessToken: result.accessToken, expiresIn: 900 },
    });
  } catch (error) {
    // A failed refresh clears the cookies, so a client with a dead session is
    // sent back to the login form instead of retrying forever.
    clearSessionCookies(response);
    throw error;
  }
});

/** POST /api/v1/auth/logout */
router.post('/logout', authenticate, async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE];

  await logout({
    userId: request.user.id,
    refreshToken: token,
    allSessions: request.body?.allSessions === true,
  });

  clearSessionCookies(response);

  response.json({ data: { loggedOut: true, allSessions: request.body?.allSessions === true } });
});

/**
 * GET /api/v1/auth/me
 *
 * Used by the admin UI to resolve the current session. Returns the user with
 * their resolved permissions so the interface can decide what to render — while
 * understanding the API independently enforces every one of those checks.
 */
router.get('/me', authenticate, async (request, response) => {
  const user = await loadUserWithRoles(request.user.id);
  if (!user) throw AppError.unauthorized('Your account is no longer available');

  response.json({ data: { user: toPublicUser(user) } });
});

/** POST /api/v1/auth/change-password */
router.post('/change-password', authenticate, v('changePassword'), async (request, response) => {
  const { currentPassword, newPassword } = request.body;

  const user = await changePassword({
    user: request.user,
    currentPassword,
    newPassword,
    ip: request.ip,
    userAgent: request.get('user-agent'),
  });

  // Changing a password invalidates every session, including this one, so the
  // client is sent back to the login form.
  clearSessionCookies(response);

  response.json({ data: { user: toPublicUser(user), sessionsRevoked: true } });
});

/**
 * PUT /api/v1/auth/handles
 *
 * Self-service update of the handles the signed-in person uses to sign in.
 * Current password is required, so a stolen session cannot quietly redirect
 * future sign-ins to a handle the attacker controls.
 */
router.put('/handles', authenticate, v('changeHandles'), async (request, response) => {
  const { currentPassword, email, username, phone } = request.body;

  const user = await changeHandles({
    user: request.user,
    currentPassword,
    email,
    username,
    phone,
    ip: request.ip,
    userAgent: request.get('user-agent'),
  });

  response.json({ data: { user } });
});

/**
 * POST /api/v1/auth/push-tokens
 *
 * Register (or refresh) a device's FCM token for the signed-in person. A token
 * is unique per device, so re-registering the same token just updates its owner.
 */
router.post('/push-tokens', authenticate, async (request, response) => {
  const { token, platform } = request.body || {};
  if (!token || typeof token !== 'string') {
    throw AppError.badRequest('A device token is required');
  }
  const row = await pushService.registerToken(request.user.id, token, platform || 'android');
  response.json({ data: { registered: Boolean(row) } });
});

/**
 * DELETE /api/v1/auth/push-tokens
 *
 * Remove a device token — called on sign-out or when FCM reports it invalid.
 */
router.delete('/push-tokens', authenticate, async (request, response) => {
  const token = (request.body && request.body.token) || request.query.token;
  if (!token || typeof token !== 'string') {
    throw AppError.badRequest('A device token is required');
  }
  const removed = await pushService.unregisterToken(request.user.id, token);
  response.json({ data: { removed } });
});

/**
 * POST /api/v1/auth/push-test
 *
 * Send a test notification to every device belonging to the signed-in person.
 * Used to verify that FCM is wired up end to end without having to assign a
 * task first.
 */
router.post('/push-test', authenticate, async (request, response) => {
  const result = await pushService.sendPush(request.user.id, {
    title: 'Virallink test',
    body: 'If you can read this, push notifications are working.',
    data: { type: 'test' },
  });
  response.json({ data: result });
});

/**
 * GET /api/v1/auth/notifications
 *
 * The signed-in person's notification inbox: push outbox rows addressed to
 * them, newest first. Works whether or not FCM is configured, so a user can
 * always see what they were notified about even on a phone with no push setup.
 * Unread count is derived from `readAt IS NULL`.
 */
router.get('/notifications', authenticate, async (request, response) => {
  const { PushOutbox } = models;
  const rows = await PushOutbox.findAll({
    where: { userId: request.user.id },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  const unread = rows.filter((r) => !r.readAt).length;

  response.json({
    data: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.payload?.title || '',
      body: r.payload?.body || '',
      data: r.payload?.data || {},
      read: Boolean(r.readAt),
      readAt: r.readAt,
      createdAt: r.createdAt,
    })),
    meta: { unread },
  });
});

/**
 * POST /api/v1/auth/notifications/:id/read
 *
 * Mark one notification as read.
 */
router.post('/notifications/:id/read', authenticate, async (request, response) => {
  const { PushOutbox } = models;
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('Invalid notification id');
  }

  const row = await PushOutbox.findOne({ where: { id, userId: request.user.id } });
  if (!row) throw AppError.notFound('Notification not found');

  if (!row.readAt) {
    await row.update({ readAt: new Date() });
  }

  response.json({ data: { read: true } });
});

/**
 * POST /api/v1/auth/notifications/read-all
 *
 * Mark every unread notification as read.
 */
router.post('/notifications/read-all', authenticate, async (request, response) => {
  const { PushOutbox } = models;
  await PushOutbox.update(
    { readAt: new Date() },
    { where: { userId: request.user.id, readAt: null } },
  );
  response.json({ data: { read: true } });
});

/**
 * POST /api/v1/auth/forgot-password
 *
 * Starts password recovery. The code is delivered over Telegram, so this only
 * works for people who have linked Telegram.
 *
 * The response is deliberately unhelpful. It says the same thing, and returns
 * the same fields, whether the address belongs to nobody, to somebody whose
 * code was just sent, to somebody who has been given a link to open, or to
 * somebody who is over the per-account send limit. Any difference at all would
 * turn this into a way to discover which addresses have accounts — and which
 * of those could be attacked, which is exactly the list an attacker wants.
 *
 * The link is offered in every case, because a bot cannot message a chat that
 * has never spoken to it: opening the link starts the bot, and the bot replies
 * with the code. For an account that has no linked chat, that is the only way
 * the code can arrive at all.
 *
 * The rate limiter on this route is the blunt one; the limits that matter are
 * per-account and live in the service, because every request arrives over
 * loopback and the limiter would otherwise see one bucket for the whole site.
 */
router.post('/forgot-password', passwordResetLimiter, v('forgotPassword'), async (request, response) => {
  const { email } = request.body;

  const plan = await requestResetCode({
    email,
    ip: request.ip,
    userAgent: request.get('user-agent'),
  });

  response.json({
    data: {
      sent: true,
      message:
        'If that address belongs to an account with Telegram linked, a reset code is on its way.',
      // The deep link that starts the bot. Present whenever Telegram is
      // configured, whatever the account looks like.
      url: plan.url,
      botUsername: plan.botUsername,
      ttlMinutes: env.PASSWORD_RESET_CODE_TTL_MINUTES,
    },
  });
});

/**
 * POST /api/v1/auth/reset-password
 *
 * Redeems a code and sets a new password.
 *
 * Every failure looks the same from out here — unknown account, wrong code,
 * expired code, exhausted attempts — because the same reasoning applies as on
 * the request side. The difference between them is not the caller's business.
 */
router.post('/reset-password', passwordResetLimiter, v('resetPassword'), async (request, response) => {
  const { email, code, newPassword } = request.body;

  await redeemResetCode({
    email,
    code,
    newPassword,
    ip: request.ip,
    userAgent: request.get('user-agent'),
  });

  response.json({ data: { reset: true } });
});

/**
 * GET /api/v1/auth/telegram
 *
 * The signed-in user's Telegram link state, for the account page.
 */
router.get('/telegram', authenticate, async (request, response) => {
  const user = await models.User.findByPk(request.user.id);
  if (!user) throw AppError.unauthorized('Your account is no longer available');

  response.json({ data: linkStatus(user) });
});

/**
 * POST /api/v1/auth/telegram/link
 *
 * Issues a one-time code and the deep link to redeem it. The chat id is learned
 * from the bot, never supplied by the client.
 */
router.post('/telegram/link', authenticate, async (request, response) => {
  response.json({ data: await createLinkCode(request.user.id) });
});

/**
 * DELETE /api/v1/auth/telegram/link
 *
 * Detaches Telegram from the account. The mapping is dropped outright; the
 * outbox history is left alone so the record of what was sent survives.
 */
router.delete('/telegram/link', authenticate, async (request, response) => {
  response.json({ data: await unlink(request.user.id) });
});

/**
 * POST /api/v1/auth/verify
 *
 * Cheap token check used by the admin proxy to decide whether a request has a
 * plausible session cookie. It validates the signature; the authoritative check
 * still happens in requireAuth on every real endpoint.
 */
router.post('/verify', async (request, response) => {
  const token = request.cookies?.[ACCESS_COOKIE] || request.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    response.status(401).json({ data: { valid: false } });
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    response.json({ data: { valid: true, userId: payload.sub, roles: payload.roles } });
  } catch {
    response.status(401).json({ data: { valid: false } });
  }
});

export default router;