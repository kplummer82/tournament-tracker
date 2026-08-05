// Returns all teams eligible to be added to a given season:
// any team not already enrolled in this season. teams.league_id is a "home league"
// label only, not an enrollment gate — a team may play in another league's season
// (e.g. a travel team). league_id/league_name are returned so the picker can show it.
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
      SELECT
        t.teamid AS id,
        t.name,
        t.league_id,
        l.name AS league_name,
        t.season,
        t.year,
        COALESCE(ld.name, d.division) AS division_label
      FROM teams t
      LEFT JOIN leagues l           ON l.id  = t.league_id
      LEFT JOIN divisions d         ON d.id  = t.division
      LEFT JOIN league_divisions ld ON ld.id = t.league_division_id
      WHERE t.teamid NOT IN (
        SELECT st.team_id FROM season_teams st WHERE st.season_id = ${seasonId}
      )
      ORDER BY t.name ASC
    `;
    return res.status(200).json({ teams: rows });
  } catch (err: any) {
    console.error("[seasons/[id]/teams/options] error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
