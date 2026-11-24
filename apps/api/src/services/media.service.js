import crypto from 'node:crypto';
import sharp from 'sharp';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { models } from '../models/index.js';
import sequelize from '../config/database.js';
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

/**
 * Audio formats the media library accepts.
 *
 * Audio is stored exactly as it was uploaded — there is no re-encoding, because
 * there is no audio pipeline here — so the extension and the content type come
 * from this table rather than from the uploaded filename.
 */
const AUDIO_TYPES = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
};

/**
 * Confirm the file really is audio.
 *
 * sharp can decode an image, so the image path checks the bytes rather than
 * trusting the declared type. There is no equivalent decoder for audio here,
 * so the container signature is checked instead: MP3 (ID3 tag or a frame
 * sync), Ogg, WAV, MP4/M4A, FLAC, WebM and ADTS AAC.
 *
 * This is a format check, not a full decode — it is the same level of
 * assurance the file extension mapping gives, and the file is always served
 * back with the content type from this table, never as the browser would
 * guess from the name.
 */
function assertAudioContainer(buffer, mimeType) {
  const startsWith = (...bytes) => bytes.every((byte, index) => buffer[index] === byte);

  const isMp3 = buffer.slice(0, 3).toString('latin1') === 'ID3'
    || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  const isOgg = buffer.slice(0, 4).toString('latin1') === 'OggS';
  const isWav = buffer.slice(0, 4).toString('latin1') === 'RIFF'
    && buffer.slice(8, 12).toString('latin1') === 'WAVE';
  const isMp4 = buffer.slice(4, 8).toString('latin1') === 'ftyp';
  const isFlac = buffer.slice(0, 4).toString('latin1') === 'fLaC';
  const isWebm = startsWith(0x1a, 0x45, 0xdf, 0xa3);
  const isAac = buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;

  const detected =
    (mimeType === 'audio/mpeg' && isMp3)
    || (mimeType === 'audio/ogg' && isOgg)
    || ((mimeType === 'audio/wav' || mimeType === 'audio/x-wav') && isWav)
    || ((mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') && isMp4)
    || (mimeType === 'audio/flac' && isFlac)
    || (mimeType === 'audio/webm' && isWebm)
    || (mimeType === 'audio/aac' && isAac);

  if (!detected) {
    throw AppError.badRequest('That file is not a usable audio file');
  }
}

/**
 * Store an uploaded audio file and record it.
 *
 * @param {object} file multer memory-storage file object
 * @param {object} options
 * @param {string} [options.folder] logical grouping, e.g. 'telegram-audio'
 * @param {number} [options.uploadedById]
 * @param {string} [options.altText]
 */
export async function storeAudio(file, { folder = 'audio', uploadedById = null, altText = null } = {}) {
  if (!file) throw AppError.badRequest('No file was uploaded');

  if (file.size > env.MEDIA_MAX_BYTES) {
    throw AppError.badRequest(
      `Files must be ${Math.round(env.MEDIA_MAX_BYTES / 1024 / 1024)}MB or smaller`,
    );
  }

  const extension = AUDIO_TYPES[file.mimetype];
  if (!extension) {
    throw AppError.badRequest(`File type ${file.mimetype} is not accepted`);
  }

  const buffer = file.buffer;
  assertAudioContainer(buffer, file.mimetype);

  // The extension comes from the detected type, not from the uploaded name.
  const key = buildMediaKey(folder, randomToken(12), file.mimetype);
  const driver = getStorageDriver();

  await driver.put(key, buffer, file.mimetype);

  try {
    const media = await Media.create({
      key,
      url: driver.publicUrlFor(key),
      kind: MEDIA_KIND.AUDIO,
      mimeType: file.mimetype,
      width: null,
      height: null,
      sizeBytes: buffer.length,
      altText,
      blurDataUrl: null,
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
export async function storeFiles(files, options = {}) {
  const stored = [];
  const failed = [];

  for (const file of files) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const media = AUDIO_TYPES[file.mimetype]
        ? await storeAudio(file, options)
        : await storeImage(file, options);
      stored.push(media);
    } catch (error) {
      failed.push({ filename: file.originalname, reason: error.message });
    }
  }

  return { stored, failed };
}

/**
 * Where a media file can be pointed at from.
 *
 * A file that something still refers to is not an orphan, whoever uploaded it,
 * so this is the list of places to look before deleting one.
 */
const MEDIA_REFERENCE_COLUMNS = [
  { table: 'messages', column: 'image_media_id' },
  { table: 'blog_posts', column: 'featured_media_id' },
  { table: 'clients', column: 'logo_media_id' },
  { table: 'companies', column: 'logo_media_id' },
  { table: 'companies', column: 'favicon_media_id' },
  { table: 'employees', column: 'photo_media_id' },
  { table: 'project_images', column: 'media_id' },
  { table: 'projects', column: 'cover_media_id' },
  { table: 'services', column: 'image_media_id' },
  { table: 'telegram_auto_reply_rules', column: 'audio_media_id' },
  { table: 'telegram_catalog_items', column: 'image_media_id' },
  { table: 'testimonials', column: 'author_photo_media_id' },
];

/** The same, for the columns that hold a list of media ids. */
const MEDIA_REFERENCE_JSON = [
  { table: 'telegram_auto_reply_rules', column: 'image_media_ids' },
  { table: 'telegram_catalog_items', column: 'image_media_ids' },
  { table: 'telegram_menu_buttons', column: 'image_media_ids' },
];

/**
 * Whether a table soft-deletes its rows.
 *
 * A soft-deleted record still holds its row, but it is gone as far as the
 * library is concerned — if nothing live points at a file, the file is an
 * orphan. Cached, because this is asked for every candidate.
 */
const PARANOID_TABLES = new Set();

async function isParanoidTable(table) {
  if (PARANOID_TABLES.has(table)) return true;

  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS found FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = 'deleted_at'`,
    { replacements: { table } },
  );

  const paranoid = Number(rows[0].found) > 0;
  if (paranoid) PARANOID_TABLES.add(table);
  return paranoid;
}

/**
 * Is this media still used by something?
 *
 * `ignore` names the rows that are on their way out — the record being deleted
 * still points at the file, but it is going with it, so it must not keep the
 * file alive.
 */
export async function isMediaReferenced(mediaId, { ignore = [] } = {}) {
  const id = Number(mediaId);

  for (const reference of MEDIA_REFERENCE_COLUMNS) {
    const skip = ignore.find((entry) => entry.table === reference.table);
    const paranoid = await isParanoidTable(reference.table);

    const [rows] = await sequelize.query(
      `SELECT id FROM \`${reference.table}\`
        WHERE \`${reference.column}\` = :mediaId
        ${paranoid ? 'AND deleted_at IS NULL' : ''}
        ${skip ? 'AND id != :skipId' : ''}
        LIMIT 1`,
      { replacements: { mediaId: id, ...(skip ? { skipId: skip.id } : {}) } },
    );

    if (rows.length) return true;
  }

  /*
   * The list columns are checked in JavaScript rather than SQL.
   *
   * `JSON_CONTAINS` needs a JSON-typed candidate and rejects a bound number,
   * and `CAST(... AS JSON)` is not portable across the MySQL and MariaDB
   * versions this app runs on. These tables are small — a handful of rules,
   * catalogue items and menu buttons — so reading the arrays is cheaper than
   * fighting the dialect.
   */
  for (const reference of MEDIA_REFERENCE_JSON) {
    const skip = ignore.find((entry) => entry.table === reference.table);
    const paranoid = await isParanoidTable(reference.table);

    const [rows] = await sequelize.query(
      `SELECT id${paranoid ? ', deleted_at' : ''}, \`${reference.column}\` AS media_ids
        FROM \`${reference.table}\` WHERE \`${reference.column}\` IS NOT NULL`,
    );

    for (const row of rows) {
      if (skip && Number(row.id) === Number(skip.id)) continue;
      if (paranoid && row.deleted_at) continue;

      const ids = Array.isArray(row.media_ids) ? row.media_ids : [];
      if (ids.map(Number).includes(id)) return true;
    }
  }

  return false;
}

/**
 * Delete media that nothing points at any more.
 *
 * Called after a record that owned images is deleted, so the media library does
 * not keep growing with files nothing uses. A file another record still refers
 * to is left alone.
 *
 * Returns the ids that were removed.
 */
export async function deleteUnreferencedMedia(mediaIds, { ignore = [] } = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(mediaIds) ? mediaIds : [mediaIds])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (!ids.length) return [];

  const removed = [];

  for (const id of ids) {
    const media = await Media.findByPk(id);
    if (!media) continue;

    if (await isMediaReferenced(id, { ignore })) continue;

    await deleteMedia(id);
    removed.push(id);
  }

  return removed;
}

/**
 * Delete every media file nothing points at any more.
 *
 * The per-delete cleanup handles what is deleted from now on. This sweeps up
 * what was left behind before that existed — files whose record was deleted
 * while they were still only a reference in the row.
 *
 * Returns the ids that were removed.
 */
export async function purgeUnreferencedMedia() {
  const rows = await Media.findAll({ attributes: ['id'] });
  const removed = [];

  for (const row of rows) {
    const id = Number(row.id);

    // A soft-deleted row is still a row: it may be restored, and it still
    // points at its file.
    const media = await Media.findByPk(id);
    if (!media) continue;

    if (await isMediaReferenced(id)) continue;

    await deleteMedia(id);
    removed.push(id);
  }

  return removed;
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

  /*
   * The audit entry needs a signed-in person. The cleanup paths delete a file
   * because the record that owned it went away — there is nobody to credit it
   * to, so those deletions are not written to the activity log.
   */
  if (request?.user) {
    await logCrud(request, {
      action: ACTIVITY_ACTION.DELETE,
      entity: ENTITY.MEDIA,
      entityId: id,
      metadata: { key: media.key, kind: media.kind },
    });
  }

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
export default {
  storeImage,
  storeAudio,
  storeFiles,
  deleteMedia,
  deleteUnreferencedMedia,
  isMediaReferenced,
  purgeUnreferencedMedia,
  readMedia,
};