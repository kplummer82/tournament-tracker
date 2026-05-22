import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

/**
 * Hard-delete a user. Used by E2E tests to clean up throwaway users
 * created via the real signup flow. Also useful for support actions.
 *
 * Order matters: delete dependent rows in our tables first, then
 * delete the Neon Auth user via the auth-admin proxy path.
 *
 * Upstream path: Neon Auth is built on Better Auth, whose admin plugin
 * exposes `POST /admin/remove-user` with body `{ userId }`. Verified by
 * inspecting `node_modules/better-auth/dist/admin-*.mjs` and
 * `node_modules/@neondatabase/auth/dist/adapter-core-*.d.mts`.
 */
function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const userIdParam = req.query.userId;
  const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  // 1. Delete app-side rows that reference the user.
  try {
    await sql`DELETE FROM user_follows  WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_roles    WHERE user_id = ${userId}`;
    await sql`DELETE FROM user_profiles WHERE user_id = ${userId}`;
  } catch (err) {
    console.error("[admin delete user] app-side cleanup failed", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  // 2. Delete the Neon Auth user via the existing auth-admin proxy.
  //    Better Auth admin plugin: POST /admin/remove-user with body { userId }.
  try {
    const origin = getOrigin(req);
    const url = `${origin}/api/auth/admin/remove-user`;
    const authRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.cookie ?? "",
      },
      body: JSON.stringify({ userId }),
    });
    if (!authRes.ok && authRes.status !== 404) {
      const text = await authRes.text();
      console.error("[admin delete user] neon auth remove-user failed", authRes.status, text);
      return res.status(500).json({ error: "Failed to delete auth user" });
    }
  } catch (err) {
    console.error("[admin delete user] neon auth remove-user threw", err);
    return res.status(500).json({ error: "Failed to delete auth user" });
  }

  return res.status(200).json({ userId, deleted: true });
}
