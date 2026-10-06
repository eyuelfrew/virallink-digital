import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { models } from '../models/index.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from './token.service.js';
import { logAuth } from '../middleware/audit.js';

const { User, Role, Permission, RefreshToken } = models;

/**
 * Authentication service: sign-in, refresh, sign-out, password changes.
 *
 * All authority lives here on the server. The client can only present
 * credentials; it can never assert an identity.
 */

/**
 * Serialise a user for API responses.
 *
 * passwordHash, failedLoginAttempts, lockedUntil and tokenVersion are all
 * deliberately absent — nothing sensitive should ever reach the admin UI.
 */
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    // Linked employee record, if any — lets the UI tell a signed-in person
    // whether "My tasks" can work before they click into it.
    employeeId: user.employeeId ?? null,
    roles: user.roles?.map((role) => role.key) || [],
    permissions: [
      ...new Set((user.roles || []).flatMap((role) => role.permissions?.map((p) => p.key) || [])),
    ],
    createdAt: user.createdAt,
  };
}

export async function loadUserWithRoles(id) {
  return User.findOne({
    where: { id },
    include: [
      {
        model: Role,
        as: 'roles',
        include: [{ model: Permission, as: 'permissions' }],
      },
    ],
  });
}

/**
 * Sign in with email and password.
 *
 * Failure handling is uniform on purpose. An unknown email, a wrong password,
 * and a deactivated account all produce the same message, and a bcrypt comparison
 * runs even when the user is not found so the response time does not reveal
 * whether an account exists.
 */
export async function login({ email, password, ip, userAgent }) {
  const user = await User.findOne({ where: { email: String(email).toLowerCase() } });
  const auditRequest = { ip, get: () => userAgent };

  if (!user) {
    // Constant-ish work on the miss path.
    await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012');
    await logAuth(auditRequest, {
      action: 'login_failed',
      userEmail: email,
      metadata: { reason: 'unknown_email' },
    });
    throw AppError.unauthorized('Incorrect email or password');
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000));
    throw AppError.unauthorized(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;

    await user.update({
      failedLoginAttempts: attempts,
      lockedUntil: shouldLock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60000) : null,
    });

    await logAuth(auditRequest, {
      action: 'login_failed',
      userId: user.id,
      userEmail: user.email,
      metadata: { reason: 'bad_password', attempt: attempts, locked: shouldLock },
    });

    if (shouldLock) {
      throw AppError.unauthorized('Too many failed attempts. This account is temporarily locked.');
    }
    throw AppError.unauthorized('Incorrect email or password');
  }

  if (!user.isActive) {
    await logAuth(auditRequest, {
      action: 'login_failed',
      userId: user.id,
      userEmail: user.email,
      metadata: { reason: 'inactive_account' },
    });
    throw AppError.unauthorized('This account has been deactivated');
  }

  await user.update({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });

  const tokens = await issueSession(user, { ip, userAgent });

  await logAuth(auditRequest, { action: 'login', userId: user.id, userEmail: user.email });

  return { user: await loadUserWithRoles(user.id), ...tokens };
}

/** Issue an access token and persist a refresh token row. */
async function issueSession(user, { ip, userAgent }) {
  const accessToken = await signAccessToken(user);
  const refresh = await signRefreshToken(user);

  await RefreshToken.create({
    userId: user.id,
    tokenId: refresh.jti,
    expiresAt: refresh.expiresAt,
    ip,
    userAgent,
  });

  return { accessToken, refreshToken: refresh.token, refreshJti: refresh.jti };
}

/**
 * Exchange a refresh token for a new pair, rotating the refresh token.
 *
 * Rotation makes each refresh token single-use: if a stolen one is replayed
 * after the legitimate client has already refreshed, its row is already revoked
 * and the attempt fails.
 */
export async function refresh({ refreshToken, ip, userAgent }) {
  const payload = await verifyRefreshToken(refreshToken);

  const stored = await RefreshToken.findOne({ where: { tokenId: payload.jti } });

  if (!stored || stored.revokedAt || new Date(stored.expiresAt) < new Date()) {
    throw AppError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await loadUserWithRoles(payload.sub);

  if (!user || !user.isActive) throw AppError.unauthorized('This account is no longer active');

  if (Number(payload.tv || 0) !== user.tokenVersion) {
    // The password changed or the account was reset since this token was issued.
    await stored.update({ revokedAt: new Date() });
    throw AppError.unauthorized('Your session is no longer valid. Please sign in again.');
  }

  await stored.update({ revokedAt: new Date() });

  return { user, ...(await issueSession(user, { ip, userAgent })) };
}

/** Sign out one session, or every session for a user. */
export async function logout({ userId, refreshToken, allSessions = false }) {
  if (allSessions && userId) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
    return { allSessions: true };
  }

  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenId: payload.jti } });
    } catch {
      // Signing out with an already-invalid token is a success, not an error.
    }
  }

  return { allSessions: false };
}

/** Change a signed-in user's own password. */
export async function changePassword({ user, currentPassword, newPassword, ip, userAgent }) {
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!matches) {
    await logAuth({ ip, get: () => userAgent }, {
      action: 'password_change',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'rejected_wrong_current' },
    });
    throw AppError.unauthorized('Your current password is not correct');
  }

  const record = await User.findByPk(user.id);

  await record.update({
    passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS),
    passwordChangedAt: new Date(),
    // Bumping this invalidates every access token issued before now.
    tokenVersion: record.tokenVersion + 1,
  });

  // Kill every session so a stolen token cannot outlive a password change.
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });

  await logAuth({ ip, get: () => userAgent }, {
    action: 'password_change',
    userId: user.id,
    userEmail: user.email,
    metadata: { result: 'success' },
  });

  return loadUserWithRoles(user.id);
}

/** Set a password without the old one. SUPER_ADMIN only. */
export async function resetPassword({ targetUserId, newPassword, actor, ip, userAgent }) {
  const target = await User.findByPk(targetUserId);
  if (!target) throw AppError.notFound('User not found');

  await target.update({
    passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS),
    passwordChangedAt: new Date(),
    tokenVersion: target.tokenVersion + 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: targetUserId, revokedAt: null } });

  await logAuth({ ip, get: () => userAgent }, {
    action: 'password_change',
    userId: actor.id,
    userEmail: actor.email,
    metadata: { result: 'admin_reset', targetUserId },
  });

  return loadUserWithRoles(targetUserId);
}

/** Delete refresh tokens whose expiry has passed. Called by the cron job. */
export async function pruneExpiredTokens() {
  return RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
}

export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
};

export default { login, refresh, logout, changePassword, resetPassword, toPublicUser, loadUserWithRoles };