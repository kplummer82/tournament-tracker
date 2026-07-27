import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";
import { activateUser } from "@/lib/auth/activation";

const ALLOWED_STATUSES = ["active", "inactive"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const userId = req.query.userId;
  const id = Array.isArray(userId) ? userId[0] : userId;
  if (!id) {
    return res.status(400).json({ error: "userId required" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const status = body.status;
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be one of: active, inactive" });
  }

  try {
    if (status === "active") {
      // Activation runs the approval side effects — accept any pending invites
      // and send the "you're approved" email — on a real inactive→active
      // transition. It performs the status upsert itself.
      await activateUser({ req, userId: id, email: body.email, name: body.name });
    } else {
      // Deactivation: plain upsert (create profile if missing, or set inactive).
      await sql`
        INSERT INTO user_profiles (user_id, status, updated_at)
        VALUES (${id}, ${status}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET status = ${status}, updated_at = NOW()
      `;
    }
    return res.status(200).json({ userId: id, status });
  } catch (err) {
    console.error("[admin set status]", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
