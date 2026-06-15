import type { Handle } from '@sveltejs/kit';
import { hpkeServer } from '$lib/server/hpke-instance';

/**
 * Server hook that sets the HPKE server public key cookie.
 *
 * Equivalent to Next.js middleware — runs on every request.
 * Sets the public key cookie so the client can encrypt messages
 * without an extra API call.
 */
export const handle: Handle = async ({ event, resolve }) => {
  try {
    // Skip for API routes to avoid unnecessary processing
    if (event.url.pathname.startsWith('/api/')) {
      return resolve(event);
    }

    // Check if cookie already exists
    const existingKey = event.cookies.get('hpke_server_public_key');
    if (existingKey) {
      return resolve(event);
    }

    // Ensure server keys are ready
    await hpkeServer.ready;
    const publicKey = hpkeServer.getPublicKeyBase64();

    if (!publicKey) {
      return resolve(event);
    }

    const response = await resolve(event);

    // Set the cookie on the response
    response.headers.append(
      'set-cookie',
      `hpke_server_public_key=${encodeURIComponent(publicKey)}; Path=/; SameSite=Lax`
    );

    return response;
  } catch {
    return resolve(event);
  }
};
