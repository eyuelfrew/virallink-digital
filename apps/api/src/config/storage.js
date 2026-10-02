import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import env from './env.js';
import logger from './logger.js';

/**
 * Storage driver interface.
 *
 * Media files are never stored inside MySQL — only keys, dimensions and metadata
 * are. This abstraction exists so moving from the local disk to S3 (or any
 * S3-compatible provider such as Cloudflare R2, MinIO, or DigitalOcean Spaces)
 * is a single STORAGE_DRIVER environment change rather than a refactor.
 *
 * Local layout:
 *   storage/media/2026/01/<nanoid>.webp
 *
 * Keys are stored in the `media` table; the public URL is derived from the key,
 * so changing the public base URL never requires rewriting rows.
 */

// sharp's concurrency is limited because cPanel kills processes that exceed the
// per-app memory ceiling, and image conversion is the most memory-hungry thing
// this service does.
sharp.concurrency(1);
sharp.cache(false);

/** Reject file extensions entirely; only a known-safe allowlist is written. */
const GENERATED_EXT = '.webp';

function buildKey({ folder, filename, ext = GENERATED_EXT, contentType }) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  // Derive the extension from the *converted* content type, never from the
  // uploaded filename, so a crafted name cannot pick the stored extension.
  const extensionByType = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };
  const resolvedExt = ext && ext !== GENERATED_EXT ? ext : extensionByType[contentType] || '.bin';

  return [folder, year, month, `${filename}${resolvedExt}`].filter(Boolean).join('/');
}

function ensureRoot(root) {
  return fs.mkdir(root, { recursive: true }).then(() => root);
}

/* -------------------------------------------------------------------------- */
/* Local disk driver                                                          */
/* -------------------------------------------------------------------------- */

class LocalDiskDriver {
  constructor(root, publicUrl) {
    this.root = root;
    this.publicUrl = publicUrl.replace(/\/+$/, '');
    this.name = 'local';
  }

  /** Guard against path traversal: the resolved path must stay under root. */
  resolveKey(key) {
    const full = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
      throw Object.assign(new Error('Invalid media key'), { statusCode: 400 });
    }
    return full;
  }

  async put(key, buffer, contentType) {
    const full = this.resolveKey(key);
    await ensureRoot(path.dirname(full));
    await fs.writeFile(full, buffer);
    logger.debug({ key, bytes: buffer.length }, 'media written to local disk');
    return { key, bytes: buffer.length, contentType };
  }

  async delete(key) {
    const full = this.resolveKey(key);
    await fs.unlink(full).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return true;
  }

  async read(key) {
    return fs.readFile(this.resolveKey(key));
  }

  publicUrlFor(key) {
    return `${this.publicUrl}/${key}`;
  }

  /** Local disk has no signed URLs; files are served by the media route. */
  async signedUrl(key) {
    return this.publicUrlFor(key);
  }
}

/* -------------------------------------------------------------------------- */
/* S3-compatible driver                                                       */
/* -------------------------------------------------------------------------- */

class S3Driver {
  constructor(config) {
    this.name = 's3';
    this.bucket = config.STORAGE_BUCKET;
    this.publicBase = (config.STORAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    // The S3 client is constructed lazily so a local-driver deployment never
    // requires AWS credentials to be present.
    this.clientPromise = import('@aws-sdk/client-s3')
      .then(({ S3Client }) => S3Client)
      .then(
        (S3Client) =>
          new S3Client({
            region: config.STORAGE_REGION || 'us-east-1',
            // R2/MinIO/Spaces all require an explicit endpoint.
            ...(config.STORAGE_ENDPOINT ? { endpoint: config.STORAGE_ENDPOINT, forcePathStyle: true } : {}),
            credentials: {
              accessKeyId: config.STORAGE_ACCESS_KEY,
              secretAccessKey: config.STORAGE_SECRET_KEY,
            },
          }),
      );
  }

  async put(key, buffer, contentType) {
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, bytes: buffer.length, contentType };
  }

  async delete(key) {
    const client = await this.clientPromise;
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    return true;
  }

  async read(key) {
    const client = await this.clientPromise;
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await result.Body.transformToByteArray());
  }

  publicUrlFor(key) {
    return this.publicBase ? `${this.publicBase}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async signedUrl(key) {
    return this.publicUrlFor(key);
  }
}

/* -------------------------------------------------------------------------- */
/* Driver selection                                                           */
/* -------------------------------------------------------------------------- */

let driver;

export function getStorageDriver() {
  if (driver) return driver;

  if (env.STORAGE_DRIVER === 's3') {
    driver = new S3Driver(env);
    logger.info({ bucket: env.STORAGE_BUCKET, endpoint: env.STORAGE_ENDPOINT || 'aws' }, 'storage driver: s3');
  } else {
    driver = new LocalDiskDriver(env.mediaRoot, env.MEDIA_PUBLIC_URL);
    logger.info({ root: env.mediaRoot }, 'storage driver: local disk');
  }
  return driver;
}

export function buildMediaKey(folder, filename, contentType) {
  return buildKey({ folder, filename, contentType });
}

/** Media keys are ASCII-safe and never contain a leading slash. */
export const isValidMediaKey = (key) =>
  typeof key === 'string' && /^[\w/-]+\.[a-z0-9]{2,5}$/i.test(key) && !key.includes('..');

export { buildKey, LocalDiskDriver, S3Driver };
export default getStorageDriver;