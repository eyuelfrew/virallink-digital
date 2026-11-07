import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import env from '../config/env.js';
import { logCrud } from '../middleware/audit.js';
import { invalidatePublicContent } from './public.service.js';
import { ACTIVITY_ACTION, ENTITY } from '../shared/enums.js';

const { User, Role, Permission, Employee } = models;

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
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    lockedUntil: user.lockedUntil,
    roles: (user.roles || []).map((role) => role.key),
    // The employee this sign-in is linked to. The name is display-only, resolved
    // for the users table so it need not be fetched again per row.
    employeeId: user.employeeId ?? null,
    employeeName: user.employee?.name ?? null,
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

/** Include config so list/create/update responses can show the linked name. */
const EMPLOYEE_INCLUDE = [{ model: Employee, as: 'employee', attributes: ['id', 'name'], required: false }];

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
  const existing = await User.findOne({ where: { email: payload.email }, paranoid: false });

  if (existing && !existing.deletedAt) {
    throw AppError.conflict('An account with that email already exists');
  }

  await assertEmployeeLink(payload.employeeId);

  const attributes = {
    name: payload.name,
    email: payload.email,
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
  void request;
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

  if (payload.name !== undefined) user.name = payload.name;
  if (payload.email !== undefined) {
    // Include soft-deleted rows: they still hold the unique index, so renaming
    // to a deleted account's address has to be refused here rather than left to
    // fail on the database with a 500.
    const clash = await User.findOne({ where: { email: payload.email, id: { [Op.ne]: id } }, paranoid: false });
    if (clash) throw AppError.conflict('Another account already uses that email');
    user.email = payload.email;
  }
  if (payload.password) {
    user.passwordHash = await bcrypt.hash(payload.password, env.BCRYPT_ROUNDS);
    // Invalidate every existing session for this account.
    user.tokenVersion += 1;
    user.passwordChangedAt = new Date();
  }
  if (payload.isActive !== undefined) user.isActive = payload.isActive;
  if (payload.employeeId !== undefined) {
    // `null` unlinks, a number links, `undefined` (absent) leaves it alone —
    // assertEmployeeLink accepts all three, validating only the link case.
    await assertEmployeeLink(payload.employeeId);
    user.employeeId = payload.employeeId;
  }

  await user.save();

  if (payload.role !== undefined) {
    await user.setRoles([await roleByKey(payload.role)]);
  }

  const fresh = await User.findByPk(id, {
    include: [{ model: Role, as: 'roles' }, ...EMPLOYEE_INCLUDE],
  });
  return toAdminUser(fresh);
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
  const user = await User.findByPk(id);
  if (!user) throw AppError.notFound('User not found');
  if (user.employeeId) throw AppError.conflict('This account already has an employee profile');

  const employee = await Employee.create(payload);

  user.employeeId = employee.id;
  await user.save();

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.EMPLOYEE,
    entityId: employee.id,
    metadata: { name: employee.name, linkedUserId: user.id },
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

  await user.destroy();
  return { id: Number(id) };
}