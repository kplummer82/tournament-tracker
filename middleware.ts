import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// "/" is the public marketing landing; /learn is the public guide library.
// /forgot-password and /reset-password must work pre-login (password recovery).
const PUBLIC_PAGES = new Set([
  "/login",
  "/sign-up",
  "/",
  "/learn",
  "/forgot-password",
  "/reset-password",
]);
// Pages reachable while logged out (prefix match — covers dynamic routes).
// /invite/<token> is the invite landing page; it must work pre-login.
// /learn/<slug> are public training guides.
const PUBLIC_PAGE_PREFIXES = ["/invite/", "/learn/"];
// /api/invites/peek is a pre-login token lookup (no secrets beyond the invite
// the recipient already holds). The other /api/invites/* routes stay gated.
// /api/health is an unauthenticated uptime probe (no secrets, DB-reachability
// only) so external monitors can reach it without a session.
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/invites/peek", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal Next.js requests (matcher may not catch _next/data)
  if (pathname.startsWith("/_next/")) return NextResponse.next();

  // Allow public pages
  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p)))
    return NextResponse.next();

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
