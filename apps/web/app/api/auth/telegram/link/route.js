import { proxyAuth } from '@/lib/authProxy';

/**
 * POST /api/auth/telegram/link
 *
 * Issues a one-time link code and the deep link to redeem it. The chat id is
 * learned by the bot from the update it receives — never supplied by the client.
 */
export async function POST(request) {
  const { response } = await proxyAuth(request, {
    path: '/api/v1/auth/telegram/link',
    method: 'POST',
    forwardBody: false,
  });

  return response;
}

export const dynamic = 'force-dynamic';
