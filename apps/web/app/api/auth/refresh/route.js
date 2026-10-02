import { proxyAuth } from '@/lib/authProxy';

/**
 * POST /api/auth/refresh
 *
 * Exchanges the browser's refresh cookie for a new token pair. The API rotates
 * the refresh token, so the new cookie it sets must reach the browser or the
 * next refresh would fail with a replayed token.
 */
export async function POST(request) {
  const { response } = await proxyAuth(request, { path: '/api/v1/auth/refresh' });

  return response;
}

export const dynamic = 'force-dynamic';
