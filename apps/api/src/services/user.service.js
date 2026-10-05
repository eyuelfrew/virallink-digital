import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import env from '../config/env.js';

const { User, Role, Permission } = models;

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
  };
}

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
    include: [{ model: Role, as: 'roles' }],
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
  const existing = await User.findOne({ where: { email: payload.email } });
  if (existing) throw AppError.conflict('An account with that email already exists');

  const user = await User.create({
    name: payload.name,
    email: payload.email,
    passwordHash: await bcrypt.hash(payload.password, env.BCRYPT_ROUNDS),
    isActive: payload.isActive,
  });

  await user.setRoles([await roleByKey(payload.role)]);

  const fresh = await User.findByPk(user.id, { include: [{ model: Role, as: 'roles' }] });
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
    const clash = await User.findOne({ where: { email: payload.email, id: { [Op.ne]: id } } });
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

  await user.save();

  if (payload.role !== undefined) {
    await user.setRoles([await roleByKey(payload.role)]);
  }

  const fresh = await User.findByPk(id, { include: [{ model: Role, as: 'roles' }] });
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