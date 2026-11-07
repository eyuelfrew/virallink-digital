import { NextResponse } from 'next/server';
import { INTERNAL_API_URL } from '@/lib/config';

/**
 * Media upload proxy.
 *
 * This exists as a dedicated route rather than going through the catch-all
 * `/api/[...path]` proxy because that one reads every request body as text and
 * re-sends it as `application/json` — fine for the form dialogs, fatal for a
 * multipart upload, whose binary parts and boundary would be mangled.
 *
 * Here the raw body and its original `content-type` (which carries the multipart
 * boundary) are forwarded untouched over loopback, with the admin's httpOnly
 * session cookie attached. The browser still never learns the API's address, and
 * the API independently enforces `media.write`.
 */

export const dynamic = 'force-dynamic';

async function handler(request) {
  const base = INTERNAL_API_URL.replace(/\/+$/, '');

  const headers = { Accept: 'application/json' };

  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;

  const forwardedFor = request.headers.get('x-forwarded-for');
  headers['x-forwarded-for'] = forwardedFor ? `${forwardedFor}, loopback` : 'loopback';
  headers['user-agent'] = request.headers.get('user-agent') || 'virallink-proxy';

  // In-memory cap is the API's own MEDIA_MAX_BYTES (10MB x up to 10 files); the
  // whole body is buffered so it can be replayed as-is.
  const body = await request.arrayBuffer();

  let apiResponse;

  try {
    apiResponse = await fetch(`${base}/api/v1/media`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'UNREACHABLE', message: 'The management service is not reachable right now. Please try again.' } },
      { status: 502 },
    );
  }

  const payload = await apiResponse.json().catch(() => ({}));
  return NextResponse.json(payload, { status: apiResponse.status });
}

export const POST = handler;
