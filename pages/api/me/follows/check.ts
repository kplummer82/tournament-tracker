import type { NextApiRequest, NextApiResponse } from "next";
import { requireSession } from "@/lib/auth/requireSession";
import { sql } from "@/lib/db";

const VALID_TYPES = ["team", "league", "division", "tournament"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const entityType = req.query.entityType as string;
  const entityId = Number(req.query.entityId);
  if (!VALID_TYPES.includes(entityType) || !entityId) {
    return res.status(400).json({ error: "entityType and entityId required" });
  }

  try {
    const rows = await sql`
      SELECT 1 FROM user_follows
      WHERE user_id = ${session.user.id}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
      LIMIT 1
    `;
    return res.status(200).json({ following: rows.length > 0 });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
