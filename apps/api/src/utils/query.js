import { Op } from 'sequelize';
import AppError from './AppError.js';
import { slugify } from '../shared/seo.js';

/**
 * Build a slug that is unique within a model.
 *
 * On collision a numeric suffix is appended (`web-design-2`). `excludeId` lets an
 * update keep its own slug instead of bumping to `-2` when nothing changed.
 */
export async function generateUniqueSlug(
  Model,
  title,
  { excludeId = null, maxLength = 150, includeSoftDeleted = true } = {},
) {
  const base = slugify(title).slice(0, maxLength) || 'untitled';
  let candidate = base;
  let suffix = 2;

  // Bounded loop: a pathological dataset of colliding slugs should not hang.
  while (suffix < 500) {
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    // Soft-deleted rows are included by default: the unique index still covers
    // them, so a slug belonging to an archived record would otherwise collide at
    // the database level.
    const existing = await Model.findOne({ where, attributes: ['id'], paranoid: !includeSoftDeleted });

    if (!existing) return candidate;

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  // Fall back to something guaranteed unique rather than looping forever.
  return `${base}-${Date.now().toString(36)}`;
}

/** Standard pagination output shape used by every list endpoint. */
export function buildMeta({ page, pageSize, total }) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    hasNext: page * pageSize < total,
    hasPrevious: page > 1,
  };
}

/**
 * Translate Sequelize pagination options into limit/offset.
 * `order` arrives as a validated field name plus direction; the caller has
 * already checked the field against a whitelist.
 */
export function toLimitOffset({ page, pageSize }) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/**
 * Express 5 forwards rejected promises automatically, so no asyncHandler
 * wrapper is needed. This exists only to add a request id to thrown errors.
 */
export function withRequestId(request, response, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (!error.requestId) error.requestId = request.id;
      throw error;
    }
  };
}

/** Values that may be written directly to a model, dropping unknown keys. */
export function pickAllowedFields(payload, allowedFields) {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      result[field] = payload[field];
    }
  }
  return result;
}

/**
 * Search terms are always bound as parameters by Sequelize, never interpolated
 * into SQL. This helper exists to make that explicit at the call site and to
 * normalise user input before it reaches a LIKE clause.
 */
export function normaliseSearch(term) {
  if (!term) return null;
  const cleaned = String(term).trim().slice(0, 191);
  // Escape LIKE wildcards so a user's "%" is searched literally.
  return cleaned.replace(/[%_\\]/g, (match) => `\\${match}`);
}

export { AppError };