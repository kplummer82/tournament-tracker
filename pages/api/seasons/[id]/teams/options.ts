// Returns all teams eligible to be added to a given season:
// teams belonging to the same league as the season that are not already enrolled.
import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  if (!Number.isFinite(seasonId)) return res.status(400).json({ error: "Invalid season id" });

  try {
    const rows = await sql`
      SELECT t.teamid AS id, t.name, t.league_id, l.name AS league_name
      FROM teams t
      LEFT JOIN leagues l ON l.id = t.league_id
      WHERE t.league_id = (
        SELECT ld.league_id
        FROM seasons s
        JOIN league_divisions ld ON ld.id = s.league_division_id
        WHERE s.id = ${seasonId}
      )
      AND t.teamid NOT IN (
        SELECT st.team_id FROM season_teams st WHERE st.season_id = ${seasonId}
      )
      ORDER BY t.name ASC
    `;
    return res.status(200).json({ teams: rows });
  } catch (err: any) {
    console.error("[seasons/[id]/teams/options] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
