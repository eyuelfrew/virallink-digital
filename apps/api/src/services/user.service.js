import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import env from '../config/env.js';
import { logCrud } from '../middleware/audit.js';
import { invalidatePublicContent } from './public.service.js';
import { applyNewPassword, resetPassword } from './auth.service.js';
import { positionForRoles } from '../shared/permissions.js';
import { generateTemporaryPassword } from '../utils/password.js';
import { ACTIVITY_ACTION, ENTITY } from '../shared/enums.js';

const { User, Role, Permission, Employee, Department, PasswordResetToken } = models;

/**
 * User and role administration.
 *
 * This is the most privileged surface in the product: it decides who can reach
 * the shareholder ledger and the finance endpoints. Three rules are enforced
 * here rather than in the route handlers, because they are the ones that are easy
 * to forget when adding a new endpoint:
 *
 *  1. The last active SUPER_ADMIN cannot be deleted, deactivated, or demoted.
 *     Otherwise a deployment can lock every administrator out of its own admin
 *     area, and the only recovery is a database shell.
 *  2. Nobody may remove their own SUPER_ADMIN role or deactivate themselves,
 *     which turns a mistaken click into an immediate lockout.
 *  3. Passwords are hashed here and never returned. Serialisation goes through
 *     `toAdminUser`, which cannot emit a hash even by accident.
 */

/** Shape returned to the admin UI. Deliberately has no passwordHash field. */
export function toAdminUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? null,
    phone: user.phone ?? null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    lockedUntil: user.lockedUntil,
    /** True when the account still owes the holder a password of their own. */
    mustChangePassword: user.mustChangePassword === true,
    roles: (user.roles || []).map((role) => role.key),
    // The employee this sign-in is linked to. The name is display-only, resolved
    // for the users table so it need not be fetched again per row.
    employeeId: user.employeeId ?? null,
    employeeName: user.employee?.name ?? null,
    // The job title and department, so the users table can show the person's
    // actual job without a second lookup. An account's role says what they may
    // reach; this says what they do. Showing only one of the two is how the
    // two records drift apart without anybody noticing.
    employeePosition: user.employee?.position ?? null,
    employeeDepartment: user.employee?.department?.name ?? null,
  };
}

/**
 * Resolve an employee link id, rejecting a value that names no employee.
 * `null` means "unlink" and is always valid; `undefined` means "leave alone".
 */
async function assertEmployeeLink(employeeId) {
  if (employeeId === null || employeeId === undefined) return;
  const employee = await Employee.findByPk(employeeId, { attributes: ['id'] });
  if (!employee) throw AppError.badRequest('That employee profile does not exist');
}

/**
 * Include config so list/create/update responses can show the linked name.
 *
 * The employee's job title and department come along too. They are one row of
 * the same join either way, and the users table needs them to show what the
 * person does next to what they may reach.
 */
const EMPLOYEE_INCLUDE = [
  {
    model: Employee,
    as: 'employee',
    attributes: ['id', 'name', 'position'],
    required: false,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'], required: false }],
  },
];

/** Count active super administrators. */
async function activeSuperAdminCount(excludingUserId = null) {
  return User.count({
    where: {
      isActive: true,
      ...(excludingUserId ? { id: { [Op.ne]: excludingUserId } } : {}),
      roles: { [Op.some]: { key: 'SUPER_ADMIN' } },
    },
  });
}

function assertNotLastSuperAdmin({ user, removingSuperAdmin, deactivating }) {
  if (!removingSuperAdmin && !deactivating) return;

  const isSuperAdmin = (user.roles || []).some((role) => role.key === 'SUPER_ADMIN');
  if (!isSuperAdmin) return;

  return activeSuperAdminCount(user.id).then((remaining) => {
    if (remaining === 0) {
      throw AppError.conflict(
        'This is the only active super administrator. Promote another account first.',
      );
    }
  });
}

export async function listUsers({ page = 1, pageSize = 20, search } = {}) {
  const where = {};
  if (search) where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }];

  const { rows, count } = await User.findAndCountAll({
    where,
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
    order: [['name', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });

  return {
    rows: rows.map(toAdminUser),
    meta: { page, pageSize, total: count, totalPages: Math.max(1, Math.ceil(count / pageSize)) },
  };
}

export async function listRoles() {
  const roles = await Role.findAll({
    include: [{ model: Permission, as: 'permissions' }],
    order: [['name', 'ASC']],
  });

  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionCount: role.permissions?.length || 0,
    permissions: (role.permissions || []).map((permission) => permission.key),
  }));
}

async function roleByKey(key) {
  const role = await Role.findOne({ where: { key } });
  if (!role) throw AppError.badRequest(`Unknown role "${key}"`);
  return role;
}

export async function createUser(payload, request) {
  /*
   * The email is a unique index, and MySQL does not exclude soft-deleted rows
   * from it — a deleted account keeps its address reserved. The default
   * (paranoid) scope hides that row, so a plain lookup says "no clash" and the
   * INSERT then fails on the index, surfacing as an opaque 500. Looking with
   * `paranoid: false` makes the two cases distinct:
   *
   *  - an active account holds the email → a real conflict, refused as before;
   *  - a deleted account holds it → the address belongs to the same person, so
   *    the tombstone is revived with the details just entered rather than
   *    refusing a legitimate re-hire. This matches how the seed script treats a
   *    soft-deleted row that still holds a unique key.
   */
  /*
   * At least one sign-in handle is needed. An account with none of email,
   * username or phone could never be reached, so it would be a dead row.
   */
  const hasHandle = payload.email || payload.username || payload.phone;
  if (!hasHandle) {
    throw AppError.badRequest('An account needs at least one of email, username or phone');
  }

  /*
   * Each handle is unique. A soft-deleted row still holds its value, so the
   * lookup uses paranoid: false — the same treatment email gets, so a
   * re-hire can revive an old account instead of being refused.
   */
  /*
   * Each handle is unique. A soft-deleted row still holds its value, so the
   * lookup uses paranoid: false — the same treatment email gets, so a re-hire
   * can revive an old account instead of being refused.
   */
  const handleConditions = [];
  if (payload.email) handleConditions.push({ email: payload.email });
  if (payload.username) handleConditions.push({ username: payload.username });
  if (payload.phone) handleConditions.push({ phone: payload.phone });

  const existing = handleConditions.length
    ? await User.findOne({ where: { [Op.or]: handleConditions }, paranoid: false })
    : null;

  if (existing && !existing.deletedAt) {
    throw AppError.conflict('An account with one of those handles already exists');
  }

  await assertEmployeeLink(payload.employeeId);

  const attributes = {
    name: payload.name,
    email: payload.email ?? null,
    username: payload.username ?? null,
    phone: payload.phone ?? null,
    passwordHash: await bcrypt.hash(payload.password, env.BCRYPT_ROUNDS),
    isActive: payload.isActive,
    employeeId: payload.employeeId ?? null,
  };

  let user;

  if (existing) {
    await existing.restore();
    await existing.update(attributes);
    /*
     * Restoring revives the old credential too, so bump the token version to
     * invalidate any session issued to that account before it was deleted, and
     * overwrite the stale role link below with the one chosen here.
     */
    existing.tokenVersion += 1;
    await existing.save();
    user = existing;
  } else {
    user = await User.create(attributes);
  }

  await user.setRoles([await roleByKey(payload.role)]);

  const fresh = await User.findByPk(user.id, {
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.USER,
    entityId: fresh.id,
    metadata: { name: fresh.name, email: fresh.email, role: payload.role, isActive: fresh.isActive },
  });

  return toAdminUser(fresh);
}

export async function updateUser(id, payload, request) {
  const user = await User.findByPk(id, { include: [{ model: Role, as: 'roles' }] });
  if (!user) throw AppError.notFound('User not found');

  const removingSuperAdmin =
    payload.role !== undefined && payload.role !== 'SUPER_ADMIN' && user.roles.some((role) => role.key === 'SUPER_ADMIN');
  const deactivating = payload.isActive === false && user.isActive;

  // Guard before writing anything, so a rejected change leaves no partial state.
  await assertNotLastSuperAdmin({ user, removingSuperAdmin, deactivating });

  if (request?.user && Number(request.user.id) === Number(id)) {
    if (deactivating) throw AppError.conflict('You cannot deactivate your own account');
    if (removingSuperAdmin) throw AppError.conflict('You cannot remove your own super administrator role');
  }

  // The name before the change, so the linked profile can be told apart from
  // a rename rather than being rewritten on every save.
  const previousName = user.name;

  if (payload.name !== undefined) user.name = payload.name;

  /*
   * Keep the linked employee profile's name in step.
   *
   * The mirror of the same rule in `updateEmployee`. A linked account and its
   * employee profile are one person recorded twice, and the profile's name is
   * the one the public team page shows — so renaming the account and leaving
   * the profile alone would leave the website showing the old name.
   *
   * Skipped when the request also changes the link, because the profile being
   * renamed is then not the one this account is moving to.
   */
  const relinking = payload.employeeId !== undefined && payload.employeeId !== user.employeeId;

  if (!relinking && payload.name !== undefined && payload.name !== previousName && user.employeeId) {
    const linked = await Employee.findByPk(user.employeeId, { attributes: ['id'] });
    if (linked) await linked.update({ name: payload.name });
  }
  if (payload.email !== undefined) {
    // Include soft-deleted rows: they still hold the unique index, so renaming
    // to a deleted account's address has to be refused here rather than left to
    // fail on the database with a 500.
    const clash = await User.findOne({ where: { email: payload.email, id: { [Op.ne]: id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that email');
    user.email = payload.email;
  }
  if (payload.username !== undefined) {
    const clash = await User.findOne({ where: { username: payload.username, id: { [Op.ne]: id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that username');
    user.username = payload.username;
  }
  if (payload.phone !== undefined) {
    const clash = await User.findOne({ where: { phone: payload.phone, id: { [Op.ne]: id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that phone number');
    user.phone = payload.phone;
  }
  if (payload.isActive !== undefined) user.isActive = payload.isActive;
  if (payload.telegramUsername !== undefined) {
    /*
     * The person's Telegram username, registered by an administrator.
     *
     * This is the trust anchor for password recovery over Telegram. A bot
     * cannot message a chat that has never spoken to it, so somebody who has
     * not linked Telegram yet can only be reached through a link — and the
     * bot sends a working code only to a chat whose `@username` matches the
     * one recorded here. An administrator registers it once, having seen the
     * person's Telegram.
     *
     * Storing it without the `@`, because that is how Telegram reports it and
     * how it is compared.
     */
    const username = String(payload.telegramUsername).trim().replace(/^@/, '');
    user.telegramUsername = username || null;
  }
  if (payload.telegramChatId !== undefined) {
    /*
     * The chat the bot delivers to.
     *
     * Setting this is what lets a password-reset code be delivered to somebody
     * who cannot sign in — a bot cannot message a chat it has never heard
     * from, so an account with no chat id cannot be reached at all until it
     * has one. On a machine with no public address for the API, an
     * administrator can read the chat id out of Telegram's own queue and set
     * it here.
     */
    user.telegramChatId = payload.telegramChatId;
  }
  if (payload.employeeId !== undefined) {
    // `null` unlinks, a number links, `undefined` (absent) leaves it alone —
    // assertEmployeeLink accepts all three, validating only the link case.
    await assertEmployeeLink(payload.employeeId);
    user.employeeId = payload.employeeId;
  }

  const previousRole = user.roles.map((role) => role.key).join(', ');
  const previousIsActive = user.isActive;

  await user.save();

  /*
   * A password change is applied after the rest of the save, and through the
   * shared helper rather than by setting the hash inline.
   *
   * Two reasons, and the first one was a real bug. The old code set the hash
   * and bumped the token version here but never cleared `lockedUntil` — and
   * the lockout is checked *before* the password is compared, so an
   * administrator resetting a colleague's password could not unblock an
   * account that was locked out after too many failed attempts. The reset
   * appeared to do nothing.
   *
   * The second is that applying it here keeps one implementation of "the
   * password changed": hash it, bump the token version, revoke every session,
   * clear the lockout. The self-service change and the Telegram reset do the
   * same four things, and they should not be able to drift apart.
   */
  if (payload.password) {
    await applyNewPassword(user, payload.password, {
      mustChangePassword: payload.mustChangePassword === true,
    });
  }

  if (payload.role !== undefined) {
    await user.setRoles([await roleByKey(payload.role)]);
  }

  const fresh = await User.findByPk(id, {
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
  });

  /*
   * A role change is the most consequential thing an administrator can do, so
   * it gets its own entry rather than being folded into a generic update.
   */
  if (payload.role !== undefined && payload.role !== previousRole) {
    await logCrud(request, {
      action: ACTIVITY_ACTION.ROLE_CHANGE,
      entity: ENTITY.USER,
      entityId: id,
      metadata: { from: previousRole, to: payload.role, targetUserId: id },
    });
  } else {
    await logCrud(request, {
      action: ACTIVITY_ACTION.UPDATE,
      entity: ENTITY.USER,
      entityId: id,
      metadata: {
        name: fresh.name,
        email: fresh.email,
        isActive: fresh.isActive,
        wasActive: previousIsActive,
        role: fresh.roles.map((role) => role.key).join(', '),
      },
    });
  }

  return toAdminUser(fresh);
}

/**
 * Issue a new password for somebody else's account.
 *
 * The recovery path for a person who has forgotten theirs. It clears the
 * lockout as well as setting the password, which is the part that was
 * missing before: an account locked out by repeated failed attempts was
 * checked for the lock *before* the password was compared, so resetting the
 * password did not get them back in.
 *
 * The account is forced to choose a password of its own at the next sign-in.
 * A password read out over a phone call is a password two people know.
 */
export async function resetUserPassword(id, payload, request) {
  const target = await User.findByPk(id);
  if (!target) throw AppError.notFound('User not found');

  /*
   * Generate the password rather than asking the administrator for one.
   *
   * Somebody who has forgotten their password is usually handed a new one over
   * a phone call, and "password123" is exactly what a hurried administrator
   * types at that moment. Generating it here means the strength of it is not
   * a function of how rushed the person handing it over is.
   *
   * An administrator who genuinely needs to choose the password can still
   * send one in the body.
   */
  const temporaryPassword = payload.password || generateTemporaryPassword();

  await resetPassword({
    targetUserId: id,
    newPassword: temporaryPassword,
    mustChangePassword: payload.mustChangePassword !== false,
    actor: request.user,
    ip: request.ip,
    userAgent: request.get?.('user-agent'),
  });

  const fresh = await User.findByPk(id, {
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
  });

  /*
   * The temporary password is returned once, for the administrator to pass on.
   * It is not stored anywhere in plain text and it is not in the audit log —
   * the log records that a reset happened, not what the new password was.
   */
  return { user: toAdminUser(fresh), temporaryPassword };
}

/**
 * Create the employee profile for an existing sign-in, and link the two.
 *
 * The inverse of creating a login from an employee row: here the account already
 * exists — an owner or administrator who turns out to also be staff — and the HR
 * profile is what is missing. `payload` is the validated employee shape, so the
 * write is limited to employee columns; the account link is set here rather than
 * accepted from the client.
 */
export async function createEmployeeForUser(id, payload, request) {
  const user = await User.findByPk(id, { include: [{ model: Role, as: 'roles' }] });
  if (!user) throw AppError.notFound('User not found');
  if (user.employeeId) throw AppError.conflict('This account already has an employee profile');

  /*
   * Fill in the job title from the account's role when the caller did not
   * supply one.
   *
   * The interface prefills the same value, but a request that reaches the API
   * some other way would otherwise create a profile with no job title at all —
   * and a profile with no job title is exactly the state the two records were
   * meant to avoid. An explicit position always wins; the role only fills a
   * gap.
   */
  const fields = { ...payload };

  if (!fields.position) {
    const derived = positionForRoles((user.roles || []).map((role) => role.key));
    if (derived) fields.position = derived;
  }

  const employee = await Employee.create(fields);

  user.employeeId = employee.id;
  await user.save();

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.EMPLOYEE,
    entityId: employee.id,
    metadata: {
      name: employee.name,
      position: employee.position,
      linkedUserId: user.id,
    },
  });

  invalidatePublicContent();

  const fresh = await User.findByPk(id, {
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
  });
  return toAdminUser(fresh);
}

export async function deleteUser(id, request) {
  const user = await User.findByPk(id, { include: [{ model: Role, as: 'roles' }] });
  if (!user) throw AppError.notFound('User not found');

  if (request?.user && Number(request.user.id) === Number(id)) {
    throw AppError.conflict('You cannot delete your own account');
  }

  await assertNotLastSuperAdmin({ user, removingSuperAdmin: false, deactivating: true });

  const before = {
    name: user.name,
    email: user.email,
    role: user.roles.map((role) => role.key).join(', '),
  };

  await user.destroy();

  /*
   * Spend any live reset codes.
   *
   * `destroy()` is a soft delete, so the foreign key's CASCADE never fires and
   * the token rows would be left pointing at an account that no longer
   * exists. They could not be redeemed — the lookup skips soft-deleted
   * accounts — but leaving them behind would misreport how many outstanding
   * codes exist.
   */
  await PasswordResetToken.update(
    { consumedAt: new Date() },
    { where: { userId: id, consumedAt: null } },
  );

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.USER,
    entityId: id,
    metadata: before,
  });

  return { id: Number(id) };
}