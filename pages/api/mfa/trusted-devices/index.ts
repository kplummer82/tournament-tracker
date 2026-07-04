import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { readTrustedDeviceToken } from "@/lib/mfa";

// GET /api/mfa/trusted-devices — the user's active trusted devices.
// Tokens are never returned; `current` marks the device this request is on.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const currentToken = readTrustedDeviceToken(req);
    const rows = await sql`
      SELECT id, label, created_at, expires_at,
             (token = ${currentToken ?? ""}) AS current
      FROM mfa_trusted_devices
      WHERE user_id = ${session.user.id}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ devices: rows });
  } catch (e) {
    console.error("[mfa/trusted-devices] list failed", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
