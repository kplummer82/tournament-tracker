import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          t.teamid  AS id,
          t.name,
          t.league_id,
          l.name    AS league_name
        FROM season_teams st
        JOIN teams t  ON t.teamid = st.team_id
        LEFT JOIN leagues l ON l.id = t.league_id
        WHERE st.season_id = ${seasonId}
        ORDER BY t.name ASC
      `;
      return res.status(200).json({ teams: rows });
    }

    if (req.method === "POST") {
      const { teamIds } = req.body ?? {};
      if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ error: "teamIds array is required" });
      }

      // Determine the league that owns this season
      const seasonRows = await sql`
        SELECT league_id FROM seasons WHERE id = ${seasonId}
      `;
      if (!seasonRows.length) return res.status(404).json({ error: "Season not found" });
      const leagueId = seasonRows[0].league_id;

      const ids = teamIds.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
      const errors: string[] = [];
      let added = 0;

      for (const teamId of ids) {
        // Validate team belongs to this league
        const teamRows = await sql`
          SELECT teamid, name, league_id FROM teams WHERE teamid = ${teamId}
        `;
        if (!teamRows.length) {
          errors.push(`Team ${teamId} not found`);
          continue;
        }
        const team = teamRows[0];
        if (team.league_id !== leagueId) {
          errors.push(`Team "${team.name}" is not affiliated with this league`);
          continue;
        }

        // Insert if not already enrolled
        await sql`
          INSERT INTO season_teams (season_id, team_id)
          VALUES (${seasonId}, ${teamId})
          ON CONFLICT (season_id, team_id) DO NOTHING
        `;
        added++;
      }

      if (errors.length > 0 && added === 0) {
        return res.status(400).json({ error: errors.join("; ") });
      }
      return res.status(200).json({ ok: true, added, errors: errors.length ? errors : undefined });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/teams] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
