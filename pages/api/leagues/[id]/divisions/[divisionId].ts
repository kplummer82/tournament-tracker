import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseIds(req: NextApiRequest): { leagueId: number | null; divisionId: number | null } {
  const rawLeague = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const rawDiv = Array.isArray(req.query.divisionId) ? req.query.divisionId[0] : req.query.divisionId;
  const leagueId = parseInt(String(rawLeague ?? ""), 10);
  const divisionId = parseInt(String(rawDiv ?? ""), 10);
  return {
    leagueId: Number.isFinite(leagueId) ? leagueId : null,
    divisionId: Number.isFinite(divisionId) ? divisionId : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { leagueId, divisionId } = parseIds(req);
  if (!leagueId || !divisionId) return res.status(400).json({ error: "Invalid league or division id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          ld.id, ld.league_id, ld.name, ld.age_range, ld.sort_order,
          to_char(ld.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM league_divisions ld
        WHERE ld.id = ${divisionId} AND ld.league_id = ${leagueId}
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });

      const seasons = await sql`
        SELECT
          s.id, s.name, s.year, s.season_type, s.status,
          (SELECT COUNT(*)::int FROM season_teams st WHERE st.season_id = s.id) AS team_count
        FROM seasons s
        WHERE s.league_division_id = ${divisionId}
        ORDER BY s.year DESC, s.season_type ASC
      `;

      return res.status(200).json({ ...rows[0], seasons });
    }

    if (req.method === "PATCH") {
      const { name, age_range, sort_order } = req.body ?? {};
      const rows = await sql`
        UPDATE league_divisions
        SET
          name       = COALESCE(${name?.trim() ?? null}, name),
          age_range  = COALESCE(${age_range?.trim() ?? null}, age_range),
          sort_order = COALESCE(${sort_order != null ? Number(sort_order) : null}, sort_order)
        WHERE id = ${divisionId} AND league_id = ${leagueId}
        RETURNING id, league_id, name, age_range, sort_order,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM league_divisions
        WHERE id = ${divisionId} AND league_id = ${leagueId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]/divisions/[divisionId]] error", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "A division with this name already exists in the league" });
    }
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
