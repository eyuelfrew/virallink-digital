import { proxyAuth } from '@/lib/authProxy';

/**
 * GET    /api/auth/telegram  → the caller's Telegram link state
 * DELETE /api/auth/telegram  → detach Telegram from the caller's account
 *
 * The API resolves "the caller" from the session cookie, so there is no user id
 * in the path and nothing a client could point at somebody else's account.
 */
export async function GET(request) {
  const { response } = await proxyAuth(request, {
    path: '/api/v1/auth/telegram',
    method: 'GET',
    forwardBody: false,
  });

  return response;
}

export async function DELETE(request) {
  const { response } = await proxyAuth(request, {
    path: '/api/v1/auth/telegram/link',
    method: 'DELETE',
    forwardBody: false,
  });

  return response;
}

export const dynamic = 'force-dynamic';
