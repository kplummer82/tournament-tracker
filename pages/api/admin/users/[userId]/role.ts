import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/auth/requireSession";

function getOrigin(req: NextApiRequest): string {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

const ALLOWED_ROLES = ["admin", "user"] as const;

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
  const role = body.role;
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: "role must be one of: admin, user" });
  }

  const origin = getOrigin(req);
  try {
    const authRes = await fetch(`${origin}/api/auth/admin/set-role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.cookie ?? "",
      },
      body: JSON.stringify({ userId: id, role }),
    });
    const data = await authRes.json();
    if (!authRes.ok) {
      return res.status(authRes.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("[admin set role]", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
