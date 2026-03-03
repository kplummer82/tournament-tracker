/**
 * Auth helpers for Pages Router.
 * We do not import @neondatabase/auth/next/server here because it uses next/headers
 * (App Router only), which causes ERR_MODULE_NOT_FOUND in Pages Router API routes.
 * The auth API proxy (pages/api/auth/[...path].ts) forwards directly to Neon Auth.
 */

/**
 * Get session in Pages Router (API routes, getServerSideProps).
 * Fetches our auth proxy with the request's cookies so session/role are available server-side.
 */
export async function getSessionForRequest(req: { headers: { cookie?: string; host?: string; "x-forwarded-proto"?: string } }): Promise<{
  user: { id: string; email: string; name: string; role?: string | null };
  session: { id: string; userId: string; expiresAt: Date };
} | null> {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  const origin = `${proto}://${host}`;
  const res = await fetch(`${origin}/api/auth/get-session`, {
    headers: { cookie: req.headers.cookie ?? "" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const data = json?.data ?? json;
  if (!data?.user) return null;
  return data as { user: { id: string; email: string; name: string; role?: string | null }; session: { id: string; userId: string; expiresAt: Date } };
}
