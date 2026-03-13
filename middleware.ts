import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PAGES = new Set(["/login", "/sign-up"]);
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal Next.js requests (matcher may not catch _next/data)
  if (pathname.startsWith("/_next/")) return NextResponse.next();

  // Allow public pages
  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();

  // Allow auth API routes
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)))
    return NextResponse.next();

  // Check for session cookie (prod: __Secure- prefix, dev on localhost: no prefix)
  const sessionCookie =
    request.cookies.get("__Secure-neon-auth.session_token") ??
    request.cookies.get("neon-auth.session_token");
  if (!sessionCookie?.value) {
    // API routes → 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages → redirect to login with callbackUrl
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
