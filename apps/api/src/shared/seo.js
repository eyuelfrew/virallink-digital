/**
 * SEO helpers.
 */

export function titleTemplate(title, defaults = {}) {
  const suffix = defaults.titleSuffix || 'Virallink';
  const cleaned = String(title || '').trim();
  if (!cleaned) return suffix;
  if (cleaned.toLowerCase() === String(suffix).toLowerCase()) return suffix;
  return `${cleaned} | ${suffix}`;
}

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

export function canonicalUrl(pathOrUrl, siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  if (!pathOrUrl) return `${base}/`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const normalised = path === '/' ? '' : path.replace(/\/+$/, '');
  return `${base}${normalised}`;
}

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

export function pickSeoText({ seoTitle, seoDescription, title, fallback, maxLength }) {
  const pickedTitle = seoTitle || title || fallback || '';
  const pickedDescription =
    seoDescription || fallback || pickedTitle || '';
  return {
    title: truncateDescription(pickedTitle, maxLength || 70),
    description: truncateDescription(pickedDescription, 158),
  };
}
