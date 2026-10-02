import { Router } from 'express';
import { models } from '../../models/index.js';
import { v } from '../../middleware/schemas.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import AppError from '../../utils/AppError.js';
import {
  login,
  refresh,
  logout,
  changePassword,
  toPublicUser,
  loadUserWithRoles,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from '../../services/auth.service.js';
import { requireAuth, verifyAccessToken } from '../../services/token.service.js';

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
 * POST /api/v1/auth/login
 *
 * Rate limited more tightly than the rest of the API, and successful requests do
 * not count against the limit so a legitimate user is never locked out.
 */
router.post('/login', authLimiter, v('login'), async (request, response) => {
  const { email, password } = request.body;

  const result = await login({
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