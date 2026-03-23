import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          id,
          name,
          abbreviation,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          (SELECT COUNT(*)::int FROM leagues l WHERE l.governing_body_id = gb.id) AS league_count
        FROM governing_bodies gb
        ORDER BY name ASC
      `;
      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const session = await requireAdmin(req, res);
      if (!session) return;

      const { name, abbreviation } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const inserted = await sql`
        INSERT INTO governing_bodies (name, abbreviation)
        VALUES (${name.trim()}, ${abbreviation?.trim() ?? null})
        RETURNING id, name, abbreviation,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[governing-bodies] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
