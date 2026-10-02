import { proxyAuth } from '@/lib/authProxy';

/**
 * POST /api/auth/logout
 *
 * Forwards the session cookies to the API so the refresh token is revoked
 * server-side, then replays the cleared cookies onto the browser response.
 */
export async function POST(request) {
  const { response } = await proxyAuth(request, { path: '/api/v1/auth/logout' });

  return response;
}

export const dynamic = 'force-dynamic';
