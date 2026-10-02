import { randomBytes } from 'node:crypto';

/**
 * Cache abstraction.
 *
 * cPanel shared hosting has no Redis, so this is an in-process LRU with a TTL.
 * It exists behind an interface so adding Redis later means writing one
 * adapter, not changing any call sites.
 *
 * Correctness note: because entries live per-process, this must only ever cache
 * data that is safe to serve slightly stale. Never cache authorization decisions
 * or per-user data in it — use the in-memory token blocklist for that instead.
 */

const MAX_ENTRIES = 500;

export class MemoryCache {
  constructor({ maxEntries = MAX_ENTRIES } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, {value: unknown, expiresAt: number|null}>} */
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency for the LRU eviction order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, { ttlSeconds = null } = {}) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });

    // Evict the least recently used entry.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  delete(key) {
    return this.store.delete(key);
  }

  /** Delete every key beginning with a prefix. Used after a write invalidates a group. */
  deleteByPrefix(prefix) {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

export const cache = new MemoryCache();

/** Cache-aside helper: return the cached value, or compute and store it. */
export async function cached(key, ttlSeconds, producer) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const value = await producer();
  cache.set(key, value, { ttlSeconds });
  return value;
}

/**
 * Invalidate a group of cached keys.
 *
 * Called after any admin write that changes public content, so the website shows
 * the update on its next render rather than after a TTL expires.
 */
export function invalidate(prefix = 'public') {
  const removed = cache.deleteByPrefix(prefix);
  if (removed) {
    // eslint-disable-next-line no-console
    console.debug(`cache: invalidated ${removed} ${prefix} entr${removed === 1 ? 'y' : 'ies'}`);
  }
  return removed;
}

/** Build a stable cache key from parts. */
export function cacheKey(...parts) {
  return parts
    .map((part) => (part === null || part === undefined ? '-' : String(part)))
    .join(':')
    .slice(0, 400);
}

/**
 * Revocation list for access tokens that were valid when a password changed or a
 * role was altered. In-process for the same reason as the cache: cPanel runs a
 * single Node process per app. Entries are short-lived because access tokens
 * are short-lived, so the list stays small.
 */
const revokedTokens = new Map();

export function revokeToken(jti, { expiresAt }) {
  if (!jti) return;
  revokedTokens.set(jti, expiresAt ? new Date(expiresAt).getTime() : Date.now() + 15 * 60 * 1000);
  pruneRevokedTokens();
}

export function isTokenRevoked(jti) {
  if (!jti) return false;
  const expiry = revokedTokens.get(jti);
  if (!expiry) return false;

  if (expiry < Date.now()) {
    revokedTokens.delete(jti);
    return false;
  }
  return true;
}

/** Drop entries for tokens that would have expired anyway. */
export function pruneRevokedTokens() {
  const now = Date.now();
  for (const [jti, expiry] of revokedTokens) {
    if (expiry < now) revokedTokens.delete(jti);
  }
}

/** Opaque random string for request ids, cookie values and nonces. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}