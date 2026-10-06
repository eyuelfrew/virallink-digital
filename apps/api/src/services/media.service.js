import crypto from 'node:crypto';
import sharp from 'sharp';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { models } from '../models/index.js';
import { getStorageDriver, buildMediaKey, isValidMediaKey } from '../config/storage.js';
import { toPublicMedia } from '../serializers/public.js';
import { logCrud } from '../middleware/audit.js';
import { invalidatePublicContent } from './public.service.js';
import { ACTIVITY_ACTION, ENTITY, MEDIA_KIND } from '../shared/enums.js';
import { randomToken } from '../utils/cache.js';

/**
 * Media handling.
 *
 * Files are never stored in MySQL — only keys, dimensions and metadata are. The
 * storage driver is selected by the STORAGE_DRIVER environment variable, so
 * moving from the local disk to any S3-compatible provider is a config change.
 *
 * Upload safety:
 *  - size and MIME type are checked by multer before a handler runs
 *  - the real format is determined by decoding the file, not by trusting the
 *    declared MIME type or the filename extension
 *  - the stored extension comes from the detected format, never from the
 *    uploaded name, so a file called `evil.php` cannot choose how it is served
 *  - images are re-encoded to WebP, which also strips EXIF metadata
 */

const { Media, User } = models;

/** Longest edge kept for a full-size upload. */
const MAX_DIMENSION = 2400;

/** Longest edge for the inline blur placeholder. */
const BLUR_SIZE = 20;

/**
 * Reject anything that is not a real raster image.
 *
 * sharp throws on a file it cannot decode, which is the authoritative check:
 * a renamed executable or an HTML file with a .png extension fails here.
 */
async function assertDecodableImage(buffer) {
  try {
    const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('image has no dimensions');
    }
    // Refuse multi-page or animation payloads, which can be decompression bombs.
    if (metadata.pages && metadata.pages > 1) {
      throw new Error('animated and multi-page images are not accepted');
    }
    return metadata;
  } catch (error) {
    throw AppError.badRequest(`That file is not a usable image: ${error.message}`);
  }
}

/** Tiny inline base64 preview, used as a blur placeholder before load. */
async function buildBlurPlaceholder(buffer) {
  try {
    const tiny = await sharp(buffer)
      .resize(BLUR_SIZE, BLUR_SIZE, { fit: 'inside' })
      .webp({ quality: 40 })
      .toBuffer();
    return `data:image/webp;base64,${tiny.toString('base64')}`;
  } catch {
    // A missing placeholder degrades gracefully; it is never worth failing an
    // upload over.
    return null;
  }
}

/**
 * Store an uploaded image and record it.
 *
 * @param {object} file multer memory-storage file object
 * @param {object} options
 * @param {string} [options.folder] logical grouping, e.g. 'services'
 * @param {number} [options.uploadedById]
 * @param {string} [options.altText]
 */
export async function storeImage(file, { folder = 'general', uploadedById = null, altText = null } = {}) {
  if (!file) throw AppError.badRequest('No file was uploaded');

  if (file.size > env.MEDIA_MAX_BYTES) {
    throw AppError.badRequest(
      `Files must be ${Math.round(env.MEDIA_MAX_BYTES / 1024 / 1024)}MB or smaller`,
    );
  }

  // The declared type is a cheap first pass; decoding below is the real check.
  if (env.MEDIA_ALLOWED_TYPES.length && !env.MEDIA_ALLOWED_TYPES.includes(file.mimetype)) {
    throw AppError.badRequest(`File type ${file.mimetype} is not accepted`);
  }

  const buffer = file.buffer;
  const metadata = await assertDecodableImage(buffer);

  // Re-encode: strips EXIF (including GPS), fixes any corruption, and guarantees
  // the output is a format the browser will render.
  const processed = await sharp(buffer, { failOn: 'error' })
    .rotate() // honour EXIF orientation before it is stripped
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const outputMetadata = await sharp(processed).metadata();

  // Extension comes from the format we produced, not from the upload name.
  const key = buildMediaKey(folder, randomToken(12), 'image/webp');
  const driver = getStorageDriver();

  await driver.put(key, processed, 'image/webp');

  const blurDataUrl = await buildBlurPlaceholder(processed);

  try {
    const media = await Media.create({
      key,
      url: driver.publicUrlFor(key),
      kind: MEDIA_KIND.IMAGE,
      mimeType: 'image/webp',
      width: outputMetadata.width,
      height: outputMetadata.height,
      sizeBytes: processed.length,
      altText,
      blurDataUrl,
      uploadedById,
      folder,
    });

    return media;
  } catch (error) {
    // Never leave an orphaned file behind if the database insert fails.
    await driver.delete(key).catch(() => {});
    throw error;
  }
}

/** Store several uploads, reporting per-file failures rather than aborting. */
export async function storeImages(files, options = {}) {
  const stored = [];
  const failed = [];

  for (const file of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      stored.push(await storeImage(file, options));
    } catch (error) {
      failed.push({ filename: file.originalname, reason: error.message });
    }
  }

  return { stored, failed };
}

/** Delete a media row and its file. */
export async function deleteMedia(id, request) {
  const media = await Media.findByPk(id);
  if (!media) throw AppError.notFound('Media not found');

  const driver = getStorageDriver();

  await media.destroy();

  if (isValidMediaKey(media.key)) {
    await driver.delete(media.key).catch((error) => {
      // The row is already gone, so a failed file delete is logged, not thrown.
      import('../config/logger.js').then(({ default: logger }) =>
        logger.warn({ key: media.key, err: error.message }, 'failed to delete media file'),
      );
    });
  }

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.MEDIA,
    entityId: id,
    metadata: { key: media.key, kind: media.kind },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

/**
 * Stream a stored file.
 *
 * Used by the media route on the local-disk driver. The key is validated against
 * a strict pattern and resolved inside the media root, so a traversal attempt
 * like `../../.env` cannot escape the storage directory.
 */
export async function readMedia(key) {
  if (!isValidMediaKey(key)) throw AppError.badRequest('Invalid media reference');

  const driver = getStorageDriver();
  const buffer = await driver.read(key).catch(() => null);
  if (!buffer) throw AppError.notFound('File not found');

  const media = await Media.findOne({ where: { key } });
  const mimeType = media?.mimeType || 'application/octet-stream';

  return { buffer, mimeType, media: toPublicMedia(media) };
}

/** Salted hash of an IP, so spam patterns can be spotted without storing addresses. */
export function hashIp(ip) {
  if (!ip) return null;
  // The salt is a server-side secret, so the hash is not reversible by an
  // attacker who obtains the database.
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(String(ip)).digest('hex');
}

export { assertDecodableImage, buildBlurPlaceholder };
export default { storeImage, storeImages, deleteMedia, readMedia };