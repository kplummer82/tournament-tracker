import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { readTrustedDeviceToken, trustedDeviceClearCookie } from "@/lib/mfa";

// DELETE /api/mfa/trusted-devices/:id — revoke one of the user's own devices.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid device id" });
  }

  try {
    const rows = await sql`
      UPDATE mfa_trusted_devices
      SET revoked_at = NOW()
      WHERE id = ${id} AND user_id = ${session.user.id} AND revoked_at IS NULL
      RETURNING token
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    // If they revoked the device they're on, drop its cookie too.
    if (rows[0].token === readTrustedDeviceToken(req)) {
      res.setHeader("Set-Cookie", trustedDeviceClearCookie());
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[mfa/trusted-devices] revoke failed", e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
