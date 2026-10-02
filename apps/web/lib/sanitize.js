/**
 * HTML sanitisation for administrator-authored content.
 *
 * Blog bodies and company copy are rich text entered through the admin CMS and
 * rendered with `dangerouslySetInnerHTML`. That is unavoidable for a CMS, but it
 * means the stored value must be treated as untrusted: anyone with an EDITOR
 * account could otherwise inject a script tag and run in every visitor's browser.
 *
 * This is an allowlist. Anything not explicitly permitted is dropped. The two
 * modes exist so a caller cannot accidentally render HTML when it asked for text:
 *   - 'html' returns safe markup for rendering
 *   - 'text'  returns plain text, for word counts and meta descriptions
 *
 * Deliberately not a full HTML parser: it handles the tags a rich-text editor
 * produces and discards the rest. It is small, dependency-free, and has no
 * tolerance for malformed input.
 */

/** Tags an editor may use. Everything else is unwrapped or removed. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'code', 'pre',
  'img',
  'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'section',
  'sup', 'sub',
]);

/**
 * Tags whose content is removed entirely rather than unwrapped.
 *
 * Unwrapping these would leave their text in the document, which for a script or
 * style tag means leaving a payload or the raw contents of a style block.
 */
const VOID_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']);

/** Attributes permitted per tag. Anything else is dropped. */
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  '*': ['class'],
};

/** URL schemes permitted in href and src. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Decode the entity forms a rich-text editor emits. */
function decodeEntities(text) {
  return String(text).replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match] || match);
}

/** Escape for safe insertion into text content or a double-quoted attribute. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reject a URL that is not safe to put in an attribute.
 *
 * The check is on the parsed scheme, not on a prefix match, because
 * `javascript:` can be obfuscated with entities, tabs or newlines — all of which
 * decoding and stripping remove before the scheme is read. A relative URL has no
 * scheme and is allowed.
 */
function isSafeUrl(value) {
  const cleaned = decodeEntities(String(value))
    // Strip control characters that can be used to break up a scheme name.
    .replace(/[\u0000-\u001F\u007F\s]/g, '');

  if (!cleaned) return false;

  // Relative URLs, fragments and protocol-relative URLs are fine.
  if (/^(\/|\.\/|\.\.\/|#)/.test(cleaned)) return true;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (!scheme) return false;

  return SAFE_SCHEMES.has(`${scheme[1].toLowerCase()}:`);
}

/** True when the tag has no closing tag. */
const SELF_CLOSING = new Set(['br', 'hr', 'img']);

function filterAttributes(tagName, attributes) {
  const allowed = ALLOWED_ATTRIBUTES[tagName] || ALLOWED_ATTRIBUTES['*'];
  const result = {};

  for (const [name, rawValue] of Object.entries(attributes)) {
    const lower = name.toLowerCase();

    // on* handlers and style are never permitted, on any element.
    if (lower.startsWith('on')) continue;
    if (lower === 'style') continue;
    if (!allowed.includes(lower)) continue;

    const value = decodeEntities(rawValue);

    if (lower === 'href' || lower === 'src') {
      if (!isSafeUrl(value)) continue;

      if (lower === 'href' && /^(?:https?:)?\/\//i.test(value)) {
        // A link that opens a new tab must not hand over window.opener.
        result.rel = 'noopener noreferrer';
        result.target = '_blank';
      }

      result[lower] = value;
      continue;
    }

    result[lower] = value;
  }

  return result;
}

/**
 * Strip everything except plain text.
 *
 * Used for meta descriptions, word counts and search excerpts, where markup would
 * be noise.
 */
export function sanitizeArticleHtml(html, mode = 'html') {
  if (!html) return '';

  if (mode === 'text') {
    return decodeEntities(
      String(html)
        // Remove dangerous elements *and* their contents.
        .replace(/<(script|style|noscript|iframe|object|embed|template)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  let output = '';
  const openTags = [];

  // Attributes: name (quoted, single-quoted or bare)
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*)\s*(\/?)>/g;

  const source = String(html)
    // Remove comments, which can hide markup from a naive parser.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    // Remove dangerous elements with their contents before anything else runs.
    .replace(/<(script|style|noscript|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    // An unclosed dangerous tag would otherwise swallow the rest of the document.
    .replace(/<\/?(?:script|style|noscript|iframe|object|embed|template)\b[^>]*>/gi, '');

  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(source)) !== null) {
    // Emit the text between the previous tag and this one.
    output += escapeHtml(source.slice(cursor, match.index));
    cursor = tagPattern.lastIndex;

    const [, closingSlash, rawName, rawAttributes, selfClosingSlash] = match;
    const tagName = rawName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) continue; // tag discarded, content kept

    if (closingSlash) {
      // Only close a tag that is actually open, which prevents malformed input
      // from unbalancing the output.
      const index = openTags.lastIndexOf(tagName);
      if (index === -1) continue;

      // Close anything left open inside it.
      while (openTags.length > index) output += `</${openTags.pop()}>`;
      continue;
    }

    const attributeText = rawAttributes || '';
    const attributes = {};

    const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
    let attributeMatch;

    while ((attributeMatch = attributePattern.exec(attributeText)) !== null) {
      const name = attributeMatch[1];
      const value = attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? '';
      attributes[name] = value;
    }

    const safe = filterAttributes(tagName, attributes);
    const serialised = Object.entries(safe)
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join('');

    if (SELF_CLOSING.has(tagName)) {
      output += `<${tagName}${serialised} />`;
    } else if (selfClosingSlash) {
      output += `<${tagName}${serialised}></${tagName}>`;
    } else {
      output += `<${tagName}${serialised}>`;
      openTags.push(tagName);
    }
  }

  // Any remaining text, then close whatever is still open.
  output += escapeHtml(source.slice(cursor));

  while (openTags.length) output += `</${openTags.pop()}>`;

  return output;
}

/**
 * A safe placeholder for an image that failed to load.
 *
 * `alt` is escaped rather than injected, because it is admin-authored text and an
 * unescaped quote would break out of the attribute.
 */
export function safeAltText(text, fallback = '') {
  const cleaned = String(text || '').trim().slice(0, 200);
  return escapeHtml(cleaned || fallback);
}

export default sanitizeArticleHtml;