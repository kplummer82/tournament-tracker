import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { trustedDeviceClearCookie } from "@/lib/mfa";

// POST /api/mfa/disable — turn MFA off for the current user.
// Full requireSession on purpose: an MFA-pending session must never be able
// to disable the very check it hasn't passed.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    await sql`
      UPDATE user_profiles
      SET mfa_enabled = FALSE, updated_at = NOW()
      WHERE user_id = ${session.user.id}
    `;
    await sql`
      DELETE FROM mfa_challenges
      WHERE user_id = ${session.user.id} AND consumed_at IS NULL
    `;
    await sql`
      UPDATE mfa_trusted_devices
      SET revoked_at = NOW()
      WHERE user_id = ${session.user.id} AND revoked_at IS NULL
    `;
    res.setHeader("Set-Cookie", trustedDeviceClearCookie());
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[mfa/disable] failed", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
