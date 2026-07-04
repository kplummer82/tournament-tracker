import type { NextApiRequest, NextApiResponse } from "next";
import {
  requireSessionAllowMfaPending,
  needsMfaVerification,
} from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

// GET /api/mfa/status — is MFA on for this user, and does the current
// session still owe a code? Reachable by MFA-pending sessions (the login
// flow and AuthGate use it to decide whether to route to /mfa/verify).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSessionAllowMfaPending(req, res);
  if (!session) return;

  try {
    const rows = await sql`
      SELECT mfa_enabled, mfa_method FROM user_profiles WHERE user_id = ${session.user.id}
    `;
    const enabled = rows[0]?.mfa_enabled === true;
    const method = rows[0]?.mfa_method ?? "email";
    const verificationRequired = enabled
      ? await needsMfaVerification(req, session)
      : false;
    return res.status(200).json({ enabled, method, verificationRequired });
  } catch (e) {
    console.error("[mfa/status] failed", e);
    // Fail open like the requireSession gate — report MFA off rather than
    // locking every client into a verify loop on a DB hiccup.
    return res.status(200).json({ enabled: false, method: "email", verificationRequired: false });
  }
}
