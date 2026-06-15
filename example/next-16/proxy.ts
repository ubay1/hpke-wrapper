import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware that sets the HPKE server public key cookie.
 *
 * Since middleware runs in Edge Runtime and API routes run in Node.js runtime,
 * they cannot share module singletons. The middleware fetches the public key
 * from the API route (GET /api/hpke) which runs in the same Node.js runtime
 * as the POST handler, ensuring the same keys are used.
 */
export default async function proxy(request: NextRequest) {
  try {
    // Skip fetching the key for the API route itself to avoid infinite loops
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    // Check if cookie already exists
    const existingKey = request.cookies.get("hpke_server_public_key")?.value;
    if (existingKey) {
      console.log('existingKey', existingKey)
      return NextResponse.next();
    }

    // Fetch the public key from the API route (same Node.js runtime as decrypt)
    const apiUrl = new URL("/api/hpke", request.url);
    console.log('[proxy] Fetching from API route:', apiUrl.toString());
    const res = await fetch(apiUrl.toString(), { method: "GET" });

    if (!res.ok) {
      // Keys not ready yet — let the request through
      console.log('[proxy] API route not ok, status:', res.status);
      return NextResponse.next();
    }

    const { publicKey } = await res.json();
    console.log('[proxy] Fetched publicKey:', publicKey ? 'exists' : 'missing');

    if (!publicKey) {
      return NextResponse.next();
    }

    const response = NextResponse.next();

    response.cookies.set("hpke_server_public_key", publicKey, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });

    console.log('[proxy] Successfully set cookie for hpke_server_public_key');
    return response;
  } catch (error) {
    console.error('[proxy] Error caught in proxy:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: "/:path*",
};
