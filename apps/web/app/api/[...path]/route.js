import { NextResponse } from 'next/server';
import { ADMIN_RESOURCE_PREFIXES } from '@virallink/shared/permissions';
import { proxyAuth } from '@/lib/authProxy';

/**
 * Catch-all admin proxy: /api/<resource>/... -> API /api/v1/<resource>/...
 *
 * Every Client Component in the admin (DeleteButton, PublishToggle, the form
 * dialogs) calls this app's own origin rather than the API. The browser must not
 * know the API's address: it is bound to loopback and unreachable from the
 * internet, and holding a token in JavaScript would put the access token within
 * reach of any XSS. So the browser posts here and this route forwards over
 * loopback with the admin's httpOnly cookie attached.
 *
 * The explicit /api/auth/* and /api/contact routes take precedence over this
 * catch-all, so they are excluded here as well to keep the intent obvious.
 */

/**
 * Imported from @virallink/shared, the same list the API router enforces, so the
 * two cannot drift apart.
 *
 * The API independently requires a session and a permission for every route behind
 * each prefix, so this is not the security boundary — it exists so an unknown path
 * gets a clean 404 here instead of being forwarded.
 */
const ADMIN_PREFIXES = new Set(ADMIN_RESOURCE_PREFIXES);

/** Paths handled by dedicated route files, which take precedence anyway. */
const RESERVED = new Set(['auth', 'contact']);

async function handler(request, context) {
  // `params` arrives as the second argument and is a Promise in Next 15+. Awaiting
  // it is what makes the path segments available; there is no `request.params`.
  const { path: rawSegments = [] } = await (context?.params ?? {});
  const segments = rawSegments.map((segment) => decodeURIComponent(segment));
  const [first] = segments;

  if (!first || RESERVED.has(first) || !ADMIN_PREFIXES.has(first)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown admin endpoint.' } },
      { status: 404 },
    );
  }

  const path = `/api/v1/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  const search = request.nextUrl.search || '';

  const { response } = await proxyAuth(request, {
    path: `${path}${search}`,
    method: request.method,
    // GET and DELETE carry no body. Everything else is a JSON mutation, which is
    // what every admin form dialog and the publish/delete buttons send.
    forwardBody: request.method !== 'GET' && request.method !== 'DELETE',
  });

  return response;
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';