import { proxyAuth } from '@/lib/authProxy';

/**
 * POST /api/auth/login
 *
 * Forwards credentials to the API over loopback and replays the session cookies
 * it issues onto the browser. The access token itself never appears in
 * JavaScript-reachable storage — the browser only ever holds httpOnly cookies.
 */
export async function POST(request) {
  const { response } = await proxyAuth(request, { path: '/api/v1/auth/login' });

  return response;
}

export const dynamic = 'force-dynamic';
