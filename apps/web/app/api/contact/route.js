import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/config';

/**
 * Public contact form endpoint.
 *
 * Calls the API directly rather than through the admin proxy: this is an
 * unauthenticated write, so it must not be on the proxy's session-carrying
 * allowlist. No cookie is forwarded, and none is needed.
 */

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request could not be read.' }, { status: 400 });
  }

  try {
    const base = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');

    const response = await fetch(`${base}/api/v1/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Passed through so the API can time the submission and spot a bot.
        'X-Form-Loaded-At': request.headers.get('x-form-loaded-at') || '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Field-level messages are passed through so the form can highlight the
      // offending input instead of showing one generic failure message.
      return NextResponse.json(
        {
          error: data?.error?.message || 'Your message could not be sent. Please try again.',
          details: data?.error?.details || null,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({ success: true, message: data?.data?.message });
  } catch {
    return NextResponse.json(
      { error: 'We could not reach our messaging service. Please try again, or email us directly.' },
      { status: 502 },
    );
  }
}

export const dynamic = 'force-dynamic';

export { SITE_URL };