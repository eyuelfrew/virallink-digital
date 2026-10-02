import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 * Needed because a component's own classes must be overridable by a caller's
 * `className` without `tailwind-merge` the two fight and CSS order decides.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Absolute URL for a site path.
 *
 * `metadataBase` covers page metadata, but canonical URLs, JSON-LD `url` fields
 * and the sitemap all need absolute values, so they all come through here.
 */
export function absoluteUrl(pathOrUrl, siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  if (!pathOrUrl) return `${base}/`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return path === '/' ? `${base}/` : `${base}${path.replace(/\/+$/, '')}`;
}

/** Join query parameters into a URLSearchParams, skipping empty values. */
export function withQuery(path, params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Clamp a number between two bounds. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Build a page range for pagination, with ellipses: 1 … 4 5 6 … 20 */
export function pageRange(current, total, maxVisible = 5) {
  if (total <= maxVisible) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total, current]);
  for (let offset = 1; offset <= Math.floor(maxVisible / 2); offset += 1) {
    pages.add(current - offset);
    pages.add(current + offset);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('…');
    result.push(page);
    previous = page;
  }
  return result;
}

/** Format a byte count for the media library. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Absolute URL for a site path, suitable for a sitemap `<loc>` value.
 *
 * XML-escapes the result. Slugs are already restricted to `[a-z0-9-]`, so this is
 * defence in depth: an unescaped `&` anywhere in a URL would make the entire
 * sitemap invalid and search engines would discard the whole file.
 */
export function xmlUrl(pathOrUrl, siteUrl) {
  return absoluteUrl(pathOrUrl, siteUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Read a cookie value in a Server Component or Route Handler. */
export function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}