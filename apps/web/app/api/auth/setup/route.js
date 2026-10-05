import { NextResponse } from 'next/server';
import { INTERNAL_API_URL } from '@/lib/config';
import { proxyAuth } from '@/lib/authProxy';

/**
 * GET /api/auth/setup-status — is this a fresh install with no administrator?
 *
 * Server-side on purpose. The login page is a Server Component, so it can read
 * this during render and never expose the question to the browser.
 */
export async function GET() {
  const base = INTERNAL_API_URL.replace(/\/+$/, '');

  try {
    const response = await fetch(`${base}/api/v1/auth/setup-status`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));

    return NextResponse.json({ data: payload?.data ?? { needsSetup: false } });
  } catch {
    // If the API is unreachable, assume setup is not needed. Offering to create a
    // super administrator because the database is down would be worse than not
    // offering it.
    return NextResponse.json({ data: { needsSetup: false } });
  }
}

/**
 * POST /api/auth/setup — create the first administrator.
 *
 * Forwards to the API, which re-checks that no user exists before creating one.
 * The browser cannot grant itself an administrator even if this route were called
 * directly after setup is complete.
 */
export async function POST(request) {
  const { response } = await proxyAuth(request, { path: '/api/v1/auth/setup' });
  return response;
}

export const dynamic = 'force-dynamic';