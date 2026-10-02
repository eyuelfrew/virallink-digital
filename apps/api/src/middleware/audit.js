import { models } from '../models/index.js';
import logger from '../config/logger.js';
import { ACTIVITY_ACTION, ENTITY } from '@virallink/shared/enums';
import { sanitiseForAudit } from './validate.js';

/**
 * Activity / audit log.
 *
 * Every meaningful action is recorded: who did it, what they did, to which
 * record, from where, and what changed. Failures to write an audit row are
 * logged but never fail the user's request — an audit problem must not take the
 * admin dashboard down, though it is always surfaced in the logs.
 */

const { ActivityLog } = models;

/** Fields whose values must never be written to the metadata blob. */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
]);

/** Truncate long strings so one huge value cannot bloat the table. */
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth > 2) return '[object]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : redact(item, depth + 1);
  }
  return result;
}

/**
 * Compute a minimal diff of what actually changed.
 *
 * Storing the whole record on every update would make the log unusable; storing
 * only the changed fields keeps it readable. Fields explicitly set to null are
 * included, since clearing a value is a real change.
 */
export function buildDiff(before, after) {
  if (!before && !after) return null;
  if (!before) return { created: redact(after) };

  const changes = {};
  for (const [key, value] of Object.entries(after)) {
    if (REDACTED_FIELDS.has(key)) continue;
    if (key === 'updatedAt') continue;

    const previous = before[key];
    const serialisedPrevious = serialise(previous);
    const serialisedValue = serialise(value);

    if (serialisedPrevious !== serialisedValue) {
      changes[key] = { from: redact(previous), to: redact(value) };
    }
  }

  return Object.keys(changes).length ? changes : null;
}

function serialise(value) {
  if (value === null || value === undefined) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Write an activity log row.
 *
 * Never throws: a failure here is a logging problem, not a reason to fail the
 * user's action.
 */
export async function recordActivity({
  userId = null,
  userEmail = null,
  action,
  entity,
  entityId = null,
  metadata = null,
  ip = null,
  userAgent = null,
}) {
  try {
    await ActivityLog.create({
      userId,
      userEmail,
      action,
      entity,
      entityId: entityId ? Number(entityId) : null,
      metadata: metadata ? redact(metadata) : null,
      ip,
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    });
  } catch (error) {
    logger.error({ err: error.message, action, entity, entityId }, 'failed to write activity log');
  }
}

/**
 * Convenience wrapper for the common CRUD cases. Reads the authenticated user
 * and request metadata off the request object.
 */
export async function logCrud(request, { action, entity, entityId, metadata }) {
  await recordActivity({
    userId: request.user?.id ?? null,
    userEmail: request.user?.email ?? null,
    action,
    entity,
    entityId,
    metadata,
    ip: request.ip,
    userAgent: request.get?.('user-agent'),
  });
}

export async function logAuth(request, { action, userId = null, userEmail = null, metadata }) {
  await recordActivity({
    userId,
    userEmail,
    action,
    entity: ENTITY.USER,
    entityId: userId,
    metadata,
    ip: request.ip,
    userAgent: request.get?.('user-agent'),
  });
}

/**
 * Derive the right action for a publish/unpublish toggle, so the log says
 * "publish" or "unpublish" rather than a generic "update".
 */
export function publishAction(wasPublished, isPublished) {
  if (isPublished && !wasPublished) return ACTIVITY_ACTION.PUBLISH;
  if (!isPublished && wasPublished) return ACTIVITY_ACTION.UNPUBLISH;
  return ACTIVITY_ACTION.UPDATE;
}

export { sanitiseForAudit };
export default recordActivity;