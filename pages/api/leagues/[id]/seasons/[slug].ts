import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseSlug(raw: string | string[] | undefined): { year: number; season_type: string } | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  const m = s.match(/^(\d{4})-(spring|summer|fall|winter)$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), season_type: m[2] };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const leagueId = Number(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);
  const parsed = parseSlug(req.query.slug);
  if (!leagueId || !parsed) return res.status(400).json({ error: "Invalid parameters" });

  const { year, season_type } = parsed;

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          s.id        AS season_id,
          s.name      AS season_name,
          s.status,
          ld.id       AS division_id,
          ld.name     AS division_name,
          ld.age_range,
          ld.sort_order,
          (SELECT COUNT(*)::int FROM season_teams st WHERE st.season_id = s.id) AS team_count,
          (SELECT COUNT(*)::int FROM season_games sg WHERE sg.season_id = s.id AND sg.game_type = 'regular') AS game_count
        FROM seasons s
        JOIN league_divisions ld ON ld.id = s.league_division_id
        WHERE s.league_id = ${leagueId}
          AND s.year = ${year}
          AND s.season_type = ${season_type}
        ORDER BY ld.sort_order, ld.name
      `;

      return res.status(200).json({ year, season_type, divisions: rows });
    }

    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[leagues/[id]/seasons/[slug]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
