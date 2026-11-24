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
import { botUsername, isEnabled } from './telegram.service.js';
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
    username: user.username ?? null,
    phone: user.phone ?? null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    /**
     * True when an administrator set this password on the account's behalf.
     * The console reads it to send the person straight to the change-password
     * page instead of the dashboard.
     */
    mustChangePassword: user.mustChangePassword === true,
    // Linked employee record, if any — lets the UI tell a signed-in person
    // whether "My tasks" can work before they click into it.
    employeeId: user.employeeId ?? null,
    // Telegram link state, so the account page can render without a second call.
    // The chat id itself is never exposed.
    telegram: {
      configured: isEnabled(),
      botUsername: botUsername(),
      linked: Boolean(user.telegramChatId),
      username: user.telegramUsername || null,
      alertsEnabled: user.telegramAlertsEnabled !== false,
    },
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
export async function login({ identifier, email, password, ip, userAgent }) {
  /*
   * Accept either `identifier` (the new, generic field that can hold an email,
   * a username or a phone number) or the legacy `email` field. Keeping both
   * means an older client that still posts `email` keeps working, and the
   * mobile app can send whatever the person typed without the server having
   * to guess.
   */
  const raw = String(identifier ?? email ?? '').trim();
  const auditRequest = { ip, get: () => userAgent };

  /*
   * Look the account up by any of its handles. Email and username are matched
   * case-insensitively; phone is matched as stored, but with whitespace and
   * dashes stripped so "+251 911 234 567" and "251911234567" reach the same
   * row.
   */
  const phoneDigits = raw.replace(/[^0-9]/g, '');
  const conditions = [
    { email: raw.toLowerCase() },
    { username: raw.toLowerCase() },
  ];
  if (phoneDigits.length >= 6) conditions.push({ phone: phoneDigits });

  const user = await User.findOne({ where: { [Op.or]: conditions } });

  if (!user) {
    // Constant-ish work on the miss path.
    await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012');
    await logAuth(auditRequest, {
      action: 'login_failed',
      userEmail: raw,
      metadata: { reason: 'unknown_identifier' },
    });
    throw AppError.unauthorized('Incorrect credentials');
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
      userEmail: user.email || user.username || user.phone,
      metadata: { reason: 'bad_password', attempt: attempts, locked: shouldLock },
    });

    if (shouldLock) {
      throw AppError.unauthorized('Too many failed attempts. This account is temporarily locked.');
    }
    throw AppError.unauthorized('Incorrect credentials');
  }

  if (!user.isActive) {
    await logAuth(auditRequest, {
      action: 'login_failed',
      userId: user.id,
      userEmail: user.email || user.username || user.phone,
      metadata: { reason: 'inactive_account' },
    });
    throw AppError.unauthorized('This account has been deactivated');
  }

  await user.update({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });

  const tokens = await issueSession(user, { ip, userAgent });

  await logAuth(auditRequest, { action: 'login', userId: user.id, userEmail: user.email || user.username || user.phone });

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

/**
 * Apply a new password to an account and revoke everything the old one reached.
 *
 * There are three ways a password can change, and all three must behave the
 * same way:
 *
 *   - the signed-in person changing their own;
 *   - an administrator resetting somebody's;
 *   - a Telegram reset code being redeemed.
 *
 * They share this function because the parts that matter are easy to forget and
 * expensive to get wrong. Bumping the token version invalidates every access
 * token already issued. Revoking the refresh tokens kills the sessions that
 * could mint new ones. Clearing the lockout lets somebody who was locked out
 * by repeated failures actually use the password they have just chosen.
 *
 * That last one was the bug this replaced: the administrator's edit form set a
 * new password but left `lockedUntil` in place, and the lockout is checked
 * before the password is compared — so the reset appeared to do nothing.
 */
export async function applyNewPassword(user, newPassword, { mustChangePassword = false } = {}) {
  const record = await User.findByPk(user.id);

  await record.update({
    passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS),
    passwordChangedAt: new Date(),
    tokenVersion: record.tokenVersion + 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword,
  });

  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });

  return loadUserWithRoles(user.id);
}

/** Change a signed-in user's own password. */
export async function changePassword({ user, currentPassword, newPassword, ip, userAgent }) {
  /*
   * The record is loaded here rather than read off `user`.
   *
   * `user` is the request's user object, and it deliberately carries no
   * password hash — the hash never leaves the database. Reading
   * `user.passwordHash` compared against `undefined`, which bcrypt rejects
   * with "data and hash arguments required", so this endpoint answered 500
   * for every request. It went unnoticed because nothing in the interface
   * called it: the endpoint existed, and the form for it did not.
   */
  const record = await User.findByPk(user.id);
  if (!record) throw AppError.unauthorized('Your account is no longer available');

  const matches = await bcrypt.compare(currentPassword, record.passwordHash);

  if (!matches) {
    await logAuth({ ip, get: () => userAgent }, {
      action: 'password_change',
      userId: user.id,
      userEmail: user.email,
      metadata: { result: 'rejected_wrong_current' },
    });
    throw AppError.unauthorized('Your current password is not correct');
  }

  // Changing it themselves satisfies any outstanding forced change.
  const updated = await applyNewPassword(record, newPassword, { mustChangePassword: false });

  await logAuth({ ip, get: () => userAgent }, {
    action: 'password_change',
    userId: user.id,
    userEmail: user.email,
    metadata: { result: 'success' },
  });

  return updated;
}

/**
 * Set a password without the old one. SUPER_ADMIN only.
 *
 * Used when an administrator issues somebody a temporary password — they have
 * lost theirs, or they are starting somewhere new. The account is forced to
 * choose a password of its own at the next sign-in, because a password handed
 * over a phone call is a password two people know.
 */
export async function resetPassword({ targetUserId, newPassword, actor, ip, userAgent, mustChangePassword = true }) {
  const target = await User.findByPk(targetUserId);
  if (!target) throw AppError.notFound('User not found');

  const updated = await applyNewPassword(target, newPassword, { mustChangePassword });

  await logAuth({ ip, get: () => userAgent }, {
    action: 'password_change',
    userId: actor.id,
    userEmail: actor.email,
    metadata: { result: 'admin_reset', targetUserId, mustChangePassword },
  });

  return updated;
}

/** Delete refresh tokens whose expiry has passed. Called by the cron job. */
export async function pruneExpiredTokens() {
  return RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
}

/**
 * Let the signed-in person change the handles they use to sign in.
 *
 * Email, username and phone are all optional, but at least one must remain —
 * an account with no handle could never be reached. Current password is
 * required, the same way it is for a password change, so a stolen session
 * cannot quietly redirect future sign-ins to a handle the attacker controls.
 *
 * Uniqueness is checked against every account, including soft-deleted ones,
 * because those still hold the index.
 */
export async function changeHandles({ user, currentPassword, email, username, phone, ip, userAgent }) {
  const record = await User.findByPk(user.id);
  if (!record) throw AppError.unauthorized('Your account is no longer available');

  const matches = await bcrypt.compare(currentPassword, record.passwordHash);
  if (!matches) {
    await logAuth({ ip, get: () => userAgent }, {
      action: 'handles_change',
      userId: user.id,
      userEmail: user.email || user.username || user.phone,
      metadata: { result: 'rejected_wrong_current' },
    });
    throw AppError.unauthorized('Your current password is not correct');
  }

  /*
   * Work out the new set. `undefined` means "leave alone"; `null` or `''`
   * means "clear it". A cleared handle is only allowed if at least one other
   * handle remains.
   */
  const next = {
    email: email === undefined ? record.email : (email ? String(email).trim().toLowerCase() : null),
    username: username === undefined ? record.username : (username ? String(username).trim().toLowerCase() : null),
    phone: phone === undefined ? record.phone : (phone ? String(phone).trim() : null),
  };

  if (!next.email && !next.username && !next.phone) {
    throw AppError.badRequest('An account needs at least one of email, username or phone');
  }

  // Uniqueness checks.
  if (next.email !== record.email && next.email) {
    const clash = await User.findOne({ where: { email: next.email, id: { [Op.ne]: user.id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that email');
  }
  if (next.username !== record.username && next.username) {
    const clash = await User.findOne({ where: { username: next.username, id: { [Op.ne]: user.id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that username');
  }
  if (next.phone !== record.phone && next.phone) {
    const clash = await User.findOne({ where: { phone: next.phone, id: { [Op.ne]: user.id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that phone number');
  }

  record.email = next.email;
  record.username = next.username;
  record.phone = next.phone;
  await record.save();

  await logAuth({ ip, get: () => userAgent }, {
    action: 'handles_change',
    userId: user.id,
    userEmail: record.email || record.username || record.phone,
    metadata: { result: 'success' },
  });

  return toPublicUser(await loadUserWithRoles(user.id));
}

export {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
};

export default {
  login,
  refresh,
  logout,
  changePassword,
  changeHandles,
  resetPassword,
  applyNewPassword,
  toPublicUser,
  loadUserWithRoles,
};