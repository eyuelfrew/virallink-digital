import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Admin session gate.
 *
 * This is a Network Boundary request: it decides whether a request is allowed
 * to reach the admin pages at all. Next 16 renamed `middleware.ts` to `proxy.ts`
 * to make that clearer.
 *
 * What it does: checks only whether a session cookie is *present*. If one is
 * there, the request proceeds; if not, it redirects to the login form.
 *
 * What it deliberately does NOT do: verify the token, look up a user, or decide
 * permissions. That work needs a database round trip, and doing it here would put
 * auth logic in a layer that is easy to bypass and impossible to audit. The real
 * checks are in the data layer (requireSession) and on the API, either of which
 * refuses independently.
 *
 * So this is a fast redirect for people who are not signed in — a convenience,
 * not the security boundary. Someone forging a cookie value still reaches the
 * admin layout, and gets nothing but a redirect to login.
 */

const ADMIN_PATH = '/admin-teftef';
const ACCESS_COOKIE = 'vl_access';

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;

  const headersList = await headers();
  const hasSessionCookie = Boolean(headersList.get('cookie')?.includes(`${ACCESS_COOKIE}=`));

  if (hasSessionCookie) return NextResponse.next();

  // Preserve where they were heading so login can send them back.
  const loginUrl = new URL(`${ADMIN_PATH}/login`, request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);

  const response = NextResponse.redirect(loginUrl);

  // Belt and braces: the header is also set in next.config.mjs and .htaccess.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

export const config = {
  /*
   * Only the protected admin pages are intercepted.
   *
   * `/admin-teftef/login` is deliberately excluded. Including it sent a signed-in
   * user in a redirect loop — the login page renders, finds a session, and
   * redirects to the dashboard, which the proxy bounces straight back to login.
   * The page's own `getSession()` check already sends a signed-in user onward, so
   * the proxy does not need to see the login route at all.
   */
  matcher: ['/admin-teftef/((?!login$).*)'],
};