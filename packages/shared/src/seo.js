/**
 * SEO helpers shared by the web app.
 *
 * Kept here rather than inline in pages so title templates, description
 * truncation and canonical URL construction behave identically everywhere.
 */

/** The one place a site-wide default title suffix is defined. */
export function titleTemplate(title, defaults = {}) {
  const suffix = defaults.titleSuffix || 'Virallink';
  const cleaned = String(title || '').trim();
  if (!cleaned) return suffix;
  // Avoid "Virallink | Virallink" when the title already is the brand.
  if (cleaned.toLowerCase() === String(suffix).toLowerCase()) return suffix;
  return `${cleaned} | ${suffix}`;
}

/**
 * Truncate on a word boundary so meta descriptions never end mid-word.
 * Google renders roughly 155–160 characters; we aim just under that.
 */
export function truncateDescription(text, maxLength = 158) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const base = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.replace(/[\s,;:.!?-]+$/, '')}…`;
}

/** Absolute canonical URL. Trailing slashes are normalised away. */
export function canonicalUrl(pathOrUrl, siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  if (!pathOrUrl) return `${base}/`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const normalised = path === '/' ? '' : path.replace(/\/+$/, '');
  return `${base}${normalised}`;
}

/**
 * Turns a title into a slug. Shared with the API so admin-generated slugs match
 * what the web app expects for a given title.
 */
export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 191)
    .replace(/-+$/g, '');
}

/**
 * Picks the first non-empty SEO field, falling back to the page's own content so
 * an untitled admin entry still produces a usable description.
 */
export function pickSeoText({ seoTitle, seoDescription, title, fallback, maxLength }) {
  const pickedTitle = seoTitle || title || fallback || '';
  const pickedDescription =
    seoDescription || fallback || pickedTitle || '';
  return {
    title: truncateDescription(pickedTitle, maxLength || 70),
    description: truncateDescription(pickedDescription, 158),
  };
}