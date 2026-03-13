import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionForRequest } from "./server";
import { sql } from "@/lib/db";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionForRequest>>>;

const APPROVED_ROLES = new Set(["user", "admin"]);

// In-memory cache for the approval setting (avoids a DB query on every API call)
let approvalCache: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function isApprovalRequired(): Promise<boolean> {
  if (approvalCache && Date.now() < approvalCache.expiresAt) {
    return approvalCache.value;
  }
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'require_user_approval'`;
    const value = rows.length > 0 && rows[0].value === "true";
    approvalCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    // If the table doesn't exist yet, default to false
    return false;
  }
}

/**
 * Require an authenticated session. Returns the session or sends 401 and returns null.
 * If approval mode is enabled, also rejects users whose role is not "user" or "admin".
 */
export async function requireSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await getSessionForRequest(req);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const approvalEnabled = await isApprovalRequired();
  if (approvalEnabled && !APPROVED_ROLES.has(session.user.role ?? "")) {
    res.status(401).json({ error: "Account pending approval" });
    return null;
  }

  return session;
}

/**
 * Require an authenticated admin session. Returns the session or sends 401/403 and returns null.
 */
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return session;
}
