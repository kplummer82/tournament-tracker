import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

const VALID_SEASON_TYPES = ["spring", "summer", "fall", "winter"] as const;
const VALID_STATUSES = ["draft", "active", "playoffs", "completed", "archived"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { league_division_id } = req.query;

      let rows;
      if (league_division_id) {
        const divId = Number(league_division_id);
        rows = await sql`
          SELECT
            s.id, s.name, s.year, s.season_type, s.status,
            s.maxrundiff, s.forfeit_run_diff, s.advances_to_playoffs,
            s.league_division_id,
            ld.name AS division_name,
            l.id    AS league_id,
            l.name  AS league_name,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM season_teams st WHERE st.season_id = s.id) AS team_count,
            (SELECT COUNT(*)::int FROM season_games sg WHERE sg.season_id = s.id AND sg.game_type = 'regular') AS game_count
          FROM seasons s
          JOIN league_divisions ld ON ld.id = s.league_division_id
          JOIN leagues l           ON l.id  = ld.league_id
          WHERE s.league_division_id = ${divId}
          ORDER BY s.year DESC, s.season_type ASC
        `;
      } else {
        rows = await sql`
          SELECT
            s.id, s.name, s.year, s.season_type, s.status,
            s.maxrundiff, s.forfeit_run_diff, s.advances_to_playoffs,
            s.league_division_id,
            ld.name AS division_name,
            l.id    AS league_id,
            l.name  AS league_name,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            (SELECT COUNT(*)::int FROM season_teams st WHERE st.season_id = s.id) AS team_count,
            (SELECT COUNT(*)::int FROM season_games sg WHERE sg.season_id = s.id AND sg.game_type = 'regular') AS game_count
          FROM seasons s
          JOIN league_divisions ld ON ld.id = s.league_division_id
          JOIN leagues l           ON l.id  = ld.league_id
          ORDER BY s.year DESC, s.season_type ASC
        `;
      }

      return res.status(200).json({ rows });
    }

    if (req.method === "POST") {
      const {
        league_division_id, name, year, season_type, status,
        maxrundiff, forfeit_run_diff, advances_to_playoffs,
      } = req.body ?? {};

      if (!league_division_id) return res.status(400).json({ error: "league_division_id is required" });
      if (!name?.trim()) return res.status(400).json({ error: "name is required" });
      if (!year) return res.status(400).json({ error: "year is required" });
      if (!VALID_SEASON_TYPES.includes(season_type)) {
        return res.status(400).json({ error: `season_type must be one of: ${VALID_SEASON_TYPES.join(", ")}` });
      }

      // Derive league_id from division
      const divRow = await sql`SELECT league_id FROM league_divisions WHERE id = ${Number(league_division_id)}`;
      if (!divRow.length) return res.status(400).json({ error: "Invalid league_division_id" });
      const leagueId = divRow[0].league_id;

      const statusVal = VALID_STATUSES.includes(status) ? status : "draft";

      const inserted = await sql`
        INSERT INTO seasons (
          league_division_id, league_id, name, year, season_type, status,
          maxrundiff, forfeit_run_diff, advances_to_playoffs
        )
        VALUES (
          ${Number(league_division_id)},
          ${leagueId},
          ${name.trim()},
          ${Number(year)},
          ${season_type},
          ${statusVal},
          ${maxrundiff != null && maxrundiff !== "" ? Number(maxrundiff) : null},
          ${forfeit_run_diff != null && forfeit_run_diff !== "" ? Number(forfeit_run_diff) : null},
          ${advances_to_playoffs != null && advances_to_playoffs !== "" ? Number(advances_to_playoffs) : null}
        )
        RETURNING id, league_division_id, league_id, name, year, season_type, status,
          maxrundiff, forfeit_run_diff, advances_to_playoffs,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `;
      return res.status(201).json(inserted[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
