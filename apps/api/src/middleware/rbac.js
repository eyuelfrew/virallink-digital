import AppError from '../utils/AppError.js';
import logger from '../config/logger.js';

/**
 * Role-based access control enforcement.
 *
 * Authorisation is decided here, on the server, for every protected route. The
 * admin UI hides links a user cannot follow, but that is only cosmetic — these
 * middleware functions are what actually prevent access. A crafted request to a
 * hidden endpoint gets a 403 regardless of what the interface shows.
 *
 * Response codes:
 *   401 no session at all
 *   403 signed in, but the role lacks the permission
 *   422 an unrecognised permission name in the route definition (a code bug)
 */

/**
 * Require one of the given roles.
 * Prefer requirePermission(): roles are broader than permissions and are more
 * likely to change meaning as the system grows.
 */
export function requireRole(...allowedRoles) {
  const allowed = allowedRoles.flat();
  return function checkRole(request, _response, next) {
    if (!request.user) return next(AppError.unauthorized());

    const held = request.user.roles || [];
    if (held.some((role) => allowed.includes(role))) return next();

    return next(AppError.forbidden(`This action requires one of: ${allowed.join(', ')}`));
  };
}

/**
 * Require a permission key, e.g. 'finance.write'.
 *
 * Enforced on the router itself so a new endpoint cannot accidentally ship
 * without an authorisation check.
 */
export function requirePermission(...permissionKeys) {
  const required = permissionKeys.flat();

  return function checkPermission(request, _response, next) {
    if (!request.user) return next(AppError.unauthorized());

    const held = request.user.permissions || [];
    if (required.some((permission) => held.includes(permission))) return next();

    logger.warn(
      {
        userId: request.user.id,
        required,
        path: request.originalUrl?.split('?')[0],
        method: request.method,
      },
      'authorisation denied',
    );

    return next(AppError.forbidden());
  };
}

/**
 * Require every listed permission rather than any of them.
 * Used where an action spans domains, e.g. publishing a project requires both
 * project.write and media.write.
 */
export function requireAllPermissions(...permissionKeys) {
  const required = permissionKeys.flat();
  return function checkAll(request, _response, next) {
    if (!request.user) return next(AppError.unauthorized());
    const held = request.user.permissions || [];
    if (required.every((permission) => held.includes(permission))) return next();
    return next(AppError.forbidden());
  };
}

/**
 * Guard against acting on a resource the user may read but not change, where
 * ownership matters. Returns a middleware factory so it can be mounted per route.
 */
export function requireOwnership(getResourceOwnerId) {
  return function checkOwnership(request, _response, next) {
    if (!request.user) return next(AppError.unauthorized());

    // Anyone who can read the audit log may see all of it; otherwise a user is
    // limited to entries they created themselves.
    const canReadAll = request.user.permissions?.includes('activity.read');
    if (canReadAll) return next();

    const ownerId = getResourceOwnerId(request);
    if (ownerId && Number(ownerId) === Number(request.user.id)) return next();

    return next(AppError.forbidden('You may only view activity you created'));
  };
}

export default { requireRole, requirePermission, requireAllPermissions, requireOwnership };