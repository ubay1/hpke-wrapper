import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware that sets the HPKE server public key cookie.
 *
 * Since middleware runs in Edge Runtime and API routes run in Node.js runtime,
 * they cannot share module singletons. The middleware fetches the public key
 * from the API route (GET /api/hpke) which runs in the same Node.js runtime
 * as the POST handler, ensuring the same keys are used.
 */
export async function middleware(request: NextRequest) {
  try {
    // Skip fetching the key for the API route itself to avoid infinite loops
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    // Check if cookie already exists
    const existingKey = request.cookies.get("hpke_server_public_key")?.value;
    if (existingKey) {
      return NextResponse.next();
    }

    // Fetch the public key from the API route (same Node.js runtime as decrypt)
    const apiUrl = new URL("/api/hpke", request.url);
    const res = await fetch(apiUrl.toString(), { method: "GET" });

    if (!res.ok) {
      // Keys not ready yet — let the request through
      return NextResponse.next();
    }

    const { publicKey } = await res.json();

    if (!publicKey) {
      return NextResponse.next();
    }

    const response = NextResponse.next();

    response.cookies.set("hpke_server_public_key", publicKey, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: "/:path*",
};
