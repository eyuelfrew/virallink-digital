import { cookies, headers } from 'next/headers';
import { ADMIN_PATH } from './config.js';
import { fetchSession } from './api.js';
import { redirect } from 'next/navigation';

/**
 * Admin session handling.
 *
 * The session cookie is named here rather than being hard-coded at each call
 * site. It must match ACCESS_COOKIE in the API — the API issues the cookie and
 * this app only forwards it.
 */

export const ACCESS_COOKIE = 'vl_access';
export const REFRESH_COOKIE = 'vl_refresh';

/** The incoming cookie header, for forwarding to the API. */
export async function getCookieHeader() {
  const store = await cookies();
  return store.toString();
}

/**
 * Resolve the signed-in admin, or null.
 *
 * Returns null rather than redirecting, so a component can decide. Cached per
 * request so several components asking does not mean several API calls.
 */
export async function getSession() {
  const cookie = await getCookieHeader();
  if (!cookie) return null;

  return fetchSession(cookie);
}

/**
 * Require a session for an admin page.
 *
 * This is a usability redirect, not the security boundary. Even if this check
 * were bypassed, the API independently rejects every admin request without a
 * valid token, so no data would be returned.
 */
export async function requireSession() {
  const session = await getSession();

  if (!session) {
    // The attempted path is preserved so sign-in can return the user to it.
    const headersList = await headers();
    const attempted = headersList.get('x-invoke-path') || '';
    const next = attempted.startsWith(ADMIN_PATH) ? `?next=${encodeURIComponent(attempted)}` : '';

    redirect(`${ADMIN_PATH}/login${next}`);
  }

  return session;
}

/**
 * Require one of the given permissions, redirecting to the dashboard otherwise.
 *
 * Also cosmetic: the API enforces the same permissions on the underlying
 * endpoints. This just avoids showing a user a page they cannot use.
 */
export async function requirePermission(permission) {
  const session = await requireSession();

  if (permission && !session.permissions?.includes(permission)) {
    redirect(`${ADMIN_PATH}`);
  }

  return session;
}

export { ADMIN_PATH };