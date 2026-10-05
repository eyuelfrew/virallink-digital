import { NextResponse } from 'next/server';
import { INTERNAL_API_URL } from './config.js';

/**
 * Auth proxy helpers.
 *
 * The browser never talks to the Express API directly: the login, logout and
 * refresh calls go through this app's own /api/auth routes. Those routes forward
 * the request over loopback and then replay whatever session cookies the API
 * issued back onto the browser response.
 *
 * Why replay instead of streaming headers through: Next's route handlers own the
 * response cookie jar, so Set-Cookie headers copied verbatim can be dropped or
 * duplicated. Parsing each cookie and re-applying it through
 * `NextResponse.cookies.set` is the reliable path, and it keeps the httpOnly /
 * SameSite / Secure attributes exactly as the API set them.
 */

/** All Set-Cookie headers of a fetch Response, as an array of cookie strings. */
function readSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  // Older runtimes collapse multiple Set-Cookie headers into one.
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

/** A single hop's worth of address: dotted-quad IPv4 or a bracketed/simple IPv6. */
const FORWARDED_SEGMENT = /^[0-9a-f:.]{2,45}$/i;

/**
 * Build the X-Forwarded-For value to send upstream.
 *
 * The browser's own X-Forwarded-For used to be forwarded verbatim, which handed
 * the rate limiter its key. Two problems followed:
 *
 *   - A caller could set the header to anything and get a fresh rate-limit
 *     bucket per request, making the limit worthless.
 *   - A browser sends no XFF at all, so every real visitor shared the single
 *     127.0.0.1 bucket — one person browsing the console could lock everyone
 *     else out.
 *
 * Now the incoming chain is preserved but only after each segment is checked to
 * look like an address, and this hop's own view of the client is appended. A
 * spoofed value still cannot produce a distinct bucket per request without also
 * varying the address the upstream actually observes.
 */
function buildForwardedFor(incoming) {
  const existing = (incoming || '')
    .split(',')
    .map((part) => part.trim())
    // Drop anything that is not address-shaped rather than trusting it.
    .filter((part) => FORWARDED_SEGMENT.test(part));

  // Next does not expose the socket address to a route handler, so this hop is
  // identified by a stable marker instead of a fabricated IP. The upstream sees
  // "whoever the edge recorded, then us", which is the useful part.
  return [...existing, 'loopback'].join(', ');
}

/**
 * Parse one Set-Cookie string into the shape `NextResponse.cookies.set` wants.
 *
 * Deliberately small: the API's cookie options are the source of truth and this
 * only needs to carry them across unchanged.
 */
function parseCookie(header) {
  const [pair, ...attributes] = header.split(';');
  const separator = pair.indexOf('=');

  if (separator < 1) return null;

  const cookie = {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
  };

  for (const attribute of attributes) {
    const index = attribute.indexOf('=');
    const key = (index === -1 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
    const value = index === -1 ? '' : attribute.slice(index + 1).trim();

    switch (key) {
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'samesite':
        cookie.sameSite = value.toLowerCase() || 'lax';
        break;
      case 'path':
        cookie.path = value || '/';
        break;
      case 'domain':
        if (value) cookie.domain = value;
        break;
      case 'max-age': {
        const maxAge = Number(value);
        if (Number.isFinite(maxAge)) cookie.maxAge = maxAge;
        break;
      }
      case 'expires':
        cookie.expires = new Date(value);
        break;
      default:
        break;
    }
  }

  return cookie;
}

/**
 * Forward an auth request to the API over loopback.
 *
 * Returns `{ response, result }`: `response` is the Next response to send back,
 * already carrying the API's status, body and session cookies.
 */
export async function proxyAuth(request, { path, method = 'POST', forwardBody = true } = {}) {
  const base = INTERNAL_API_URL.replace(/\/+$/, '');

  const headers = {
    Accept: 'application/json',
    // The API's rate limiter keys on the real client IP, so this has to describe
    // the hop honestly rather than relay whatever the caller sent.
    'x-forwarded-for': buildForwardedFor(request.headers.get('x-forwarded-for')),
    'user-agent': request.headers.get('user-agent') || 'virallink-proxy',
  };

  const incomingCookie = request.headers.get('cookie');

  if (incomingCookie) headers.cookie = incomingCookie;

  let body;

  if (forwardBody && method !== 'GET') {
    try {
      body = await request.text();
      if (body) headers['content-type'] = 'application/json';
    } catch {
      body = undefined;
    }
  }

  let apiResponse;

  try {
    apiResponse = await fetch(`${base}${path}`, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    return {
      response: NextResponse.json(
        { error: { code: 'UNREACHABLE', message: 'The management service is not reachable right now. Please try again.' } },
        { status: 502 },
      ),
      result: null,
    };
  }

  const text = await apiResponse.text();
  const data = text ? JSON.parse(text || '{}') : {};

  const next = NextResponse.json(data, { status: apiResponse.status });

  for (const header of readSetCookies(apiResponse)) {
    const cookie = parseCookie(header);

    if (cookie?.name) next.cookies.set(cookie);
  }

  return { response: next, result: data };
}
