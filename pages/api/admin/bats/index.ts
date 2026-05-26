import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const rows = await sql`
        SELECT sb.id, sb.name, sb.sport_id, sp.sportname AS sport_name
        FROM scrimmage_bats sb
        JOIN sport sp ON sp.id = sb.sport_id
        ORDER BY sp.sportname ASC, sb.name ASC
      `;
      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name, sport_id } = req.body ?? {};
      const trimmed = typeof name === "string" ? name.trim() : "";
      const sportId = parseInt(String(sport_id), 10);

      if (!trimmed) return res.status(400).json({ error: "name is required" });
      if (isNaN(sportId)) return res.status(400).json({ error: "sport_id is required" });

      const inserted = await sql`
        WITH ins AS (
          INSERT INTO scrimmage_bats (name, sport_id)
          VALUES (${trimmed}, ${sportId})
          RETURNING id, name, sport_id
        )
        SELECT ins.id, ins.name, ins.sport_id, sp.sportname AS sport_name
        FROM ins
        JOIN sport sp ON sp.id = ins.sport_id
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    // Unique violation on (name, sport_id)
    if (err?.code === "23505") {
      return res.status(409).json({ error: "A bat with that name already exists for that sport" });
    }
    console.error("[admin/bats] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
