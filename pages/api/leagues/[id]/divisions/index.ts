import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireLeagueAccess } from "@/lib/auth/requireSession";

function parseLeagueId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const leagueId = parseLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Invalid league id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          ld.id, ld.name, ld.age_range, ld.sort_order,
          to_char(ld.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          (SELECT COUNT(*)::int FROM seasons se WHERE se.league_division_id = ld.id) AS season_count
        FROM league_divisions ld
        WHERE ld.league_id = ${leagueId}
        ORDER BY ld.sort_order ASC, ld.name ASC
      `;
      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const session = await requireLeagueAccess(req, res, leagueId);
      if (!session) return;

      const { name, age_range, sort_order } = req.body ?? {};
      if (!name?.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const inserted = await sql`
        INSERT INTO league_divisions (league_id, name, age_range, sort_order)
        VALUES (
          ${leagueId},
          ${name.trim()},
          ${age_range?.trim() ?? null},
          ${Number(sort_order) || 0}
        )
        RETURNING id, league_id, name, age_range, sort_order,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]/divisions] error", err);
    // Unique constraint violation
    if (err.code === "23505") {
      return res.status(409).json({ error: "A division with this name already exists in the league" });
    }
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
