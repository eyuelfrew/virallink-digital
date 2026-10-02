import { SignJWT, jwtVerify } from 'jose';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { revokeToken, isTokenRevoked, randomToken } from '../utils/cache.js';

/**
 * Token issuing and verification.
 *
 * Two tokens with different secrets and different lifetimes:
 *  - access  15 minutes, signed with JWT_SECRET
 *  - refresh 30 days,    signed with JWT_REFRESH_SECRET, recorded in the database
 *
 * The refresh token is persisted so a session can be revoked server-side, which
 * is what makes "log out", "log out everywhere", and "invalidated by a password
 * change" actually work. The access token is stateless, with an in-memory
 * blocklist for the rare case where it must be killed before it expires.
 */

const ISSUER = 'virallink-api';
const accessKey = new TextEncoder().encode(env.JWT_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

/** Parse a duration like "15m" or "30d" into seconds. */
function ttlToSeconds(ttl) {
  const match = /^(\d+)([smhd])$/.exec(String(ttl));
  if (!match) return 900;
  return Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
}

export const ACCESS_TTL_SECONDS = ttlToSeconds(env.JWT_ACCESS_TTL);
export const REFRESH_TTL_SECONDS = ttlToSeconds(env.JWT_REFRESH_TTL);

export async function signAccessToken(user) {
  return new SignJWT({
    // The `typ` claim distinguishes an access token from a refresh token, so a
    // refresh token can never be replayed as an access token.
    typ: 'access',
    roles: user.roles,
    tv: user.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .setJti(randomToken(16))
    .sign(accessKey);
}

/** Issue a refresh token. The returned jti must be persisted by the caller. */
export async function signRefreshToken(user) {
  const jti = randomToken(24);

  const token = await new SignJWT({ typ: 'refresh', tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .setJti(jti)
    .sign(refreshKey);

  return { token, jti, expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000) };
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: ISSUER,
      algorithms: ['HS256'],
    });

    if (payload.typ !== 'access') throw new Error('wrong token type');

    // Catches a token issued before a password or role change. Access tokens are
    // short-lived, so this list stays small.
    if (isTokenRevoked(payload.jti)) {
      throw Object.assign(new Error('revoked'), { name: 'TokenRevokedError' });
    }

    return payload;
  } catch (error) {
    const revoked = error.name === 'TokenRevokedError';
    throw AppError.unauthorized(
      revoked ? 'Your session has been ended. Please sign in again.' : 'Invalid or expired session',
    );
  }
}

export async function verifyRefreshToken(token) {
  try {
    const { payload } = await jwtVerify(token, refreshKey, {
      issuer: ISSUER,
      algorithms: ['HS256'],
    });

    if (payload.typ !== 'refresh') throw new Error('wrong token type');
    return payload;
  } catch {
    throw AppError.unauthorized('Your session has expired. Please sign in again.');
  }
}

/** Block an access token until it would have expired anyway. */
export function revokeAccessToken(payload) {
  if (!payload?.jti) return;
  revokeToken(payload.jti, { expiresAt: payload.exp ? payload.exp * 1000 : undefined });
}

export const ACCESS_COOKIE = 'vl_access';
export const REFRESH_COOKIE = 'vl_refresh';

/**
 * Cookie attributes.
 *
 * httpOnly keeps the token out of reach of page scripts, so an XSS bug cannot
 * steal a session. sameSite=Lax blocks cross-site writes while still allowing
 * normal navigation. secure is required in production and enforced by the
 * environment validation.
 */
function baseCookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: env.COOKIE_PATH || '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds * 1000 } : {}),
  };
}

export const accessCookieOptions = () => baseCookieOptions(ACCESS_TTL_SECONDS);
export const refreshCookieOptions = () => baseCookieOptions(REFRESH_TTL_SECONDS);

/** Clearing a cookie requires the same attributes it was set with. */
export const clearCookieOptions = () => {
  const options = baseCookieOptions();
  delete options.maxAge;
  return options;
};

/**
 * Require a valid access token.
 *
 * The user and their resolved permissions are loaded fresh on every request, so
 * deactivating an account or removing a role takes effect immediately rather
 * than whenever a token happens to expire. On shared hosting that one query is
 * far cheaper than the complexity of caching authorisation state.
 */
export function requireAuth(models) {
  const { User, Role, Permission } = models;

  return async function authenticate(request, _response, next) {
    try {
      const token = readAccessToken(request);
      if (!token) throw AppError.unauthorized();

      const payload = await verifyAccessToken(token);

      const user = await User.findOne({
        where: { id: payload.sub },
        include: [
          {
            model: Role,
            as: 'roles',
            include: [{ model: Permission, as: 'permissions' }],
          },
        ],
      });

      // A deactivated or deleted account stops working at once, not in 15 minutes.
      if (!user || !user.isActive) throw AppError.unauthorized('This account is no longer active');

      // A token issued before a password change carries the old version.
      if (Number(payload.tv || 0) !== user.tokenVersion) {
        throw AppError.unauthorized('Your session is no longer valid. Please sign in again.');
      }

      request.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        tokenVersion: user.tokenVersion,
        roles: user.roles.map((role) => role.key),
        permissions: [
          ...new Set(user.roles.flatMap((role) => role.permissions.map((permission) => permission.key))),
        ],
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Read the access token from the Authorization header or the cookie.
 *
 * The header serves server-to-server calls (the Next.js route handlers); the
 * cookie serves the browser. Both are accepted so the admin UI works whether the
 * session came from the web app or from a direct API client.
 */
export function readAccessToken(request) {
  const header = request.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return request.cookies?.[ACCESS_COOKIE] || null;
}

/**
 * Optional authentication: attaches request.user when a valid token is present
 * but never rejects. For endpoints that behave differently for signed-in staff
 * without requiring a session.
 */
export function optionalAuth(authenticate) {
  return async function optional(request, response, next) {
    if (!readAccessToken(request)) return next();
    return authenticate(request, response, next);
  };
}

export default { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, requireAuth };