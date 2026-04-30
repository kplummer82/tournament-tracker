import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseLeagueId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const leagueId = parseLeagueId(req);
  if (!leagueId) return res.status(400).json({ error: "Invalid league id" });

  const year = parseInt(String(req.query.year ?? ""), 10);
  const seasonType = String(req.query.season_type ?? "").toLowerCase();

  if (!Number.isFinite(year) || !seasonType) {
    return res.status(400).json({ error: "year and season_type query params are required" });
  }

  try {
    // Find coaches with overlapping game time-windows across different divisions.
    // Each game's window = gametime → gametime + max_game_minutes + 15 min buffer.
    const rows = await sql`
      WITH coach_teams AS (
        SELECT
          lc.id AS coach_id,
          lc.first_name || ' ' || lc.last_name AS coach_name,
          tc.team_id,
          t.name AS team_name,
          ld.name AS division_name,
          COALESCE(ld.max_game_minutes, 120) AS max_game_minutes,
          s.id AS season_id
        FROM league_coaches lc
        JOIN team_coaches tc ON tc.coach_id = lc.id
        JOIN teams t ON t.teamid = tc.team_id
        JOIN season_teams st ON st.team_id = tc.team_id
        JOIN seasons s ON s.id = st.season_id
        JOIN league_divisions ld ON ld.id = s.league_division_id
        WHERE lc.league_id = ${leagueId}
          AND s.year = ${year}
          AND s.season_type = ${seasonType}
      ),
      multi_division_coaches AS (
        SELECT coach_id
        FROM coach_teams
        GROUP BY coach_id
        HAVING COUNT(DISTINCT division_name) >= 2
      ),
      coach_games AS (
        SELECT
          ct.coach_id,
          ct.coach_name,
          ct.team_id,
          ct.team_name,
          ct.division_name,
          ct.max_game_minutes,
          sg.id AS game_id,
          to_char(sg.gamedate, 'YYYY-MM-DD') AS gamedate,
          sg.gametime,
          to_char(sg.gametime, 'HH24:MI') AS gametime_fmt,
          sg.home,
          sg.away
        FROM coach_teams ct
        JOIN multi_division_coaches mdc ON mdc.coach_id = ct.coach_id
        JOIN season_games sg ON sg.season_id = ct.season_id
          AND (sg.home = ct.team_id OR sg.away = ct.team_id)
        WHERE sg.gamedate IS NOT NULL AND sg.gametime IS NOT NULL
      )
      SELECT DISTINCT
        g1.coach_id,
        g1.coach_name,
        g1.gamedate,
        g1.gametime_fmt AS gametime,
        g1.game_id    AS game1_id,
        g1.team_id    AS game1_team_id,
        g1.team_name  AS game1_team,
        g1.division_name AS game1_division,
        g1.gametime_fmt AS game1_time,
        to_char(g1.gametime + (g1.max_game_minutes + 15) * INTERVAL '1 minute', 'HH24:MI') AS game1_end_time,
        g1.max_game_minutes AS game1_duration,
        g2.game_id    AS game2_id,
        g2.team_id    AS game2_team_id,
        g2.team_name  AS game2_team,
        g2.division_name AS game2_division,
        g2.gametime_fmt AS game2_time,
        to_char(g2.gametime + (g2.max_game_minutes + 15) * INTERVAL '1 minute', 'HH24:MI') AS game2_end_time,
        g2.max_game_minutes AS game2_duration
      FROM coach_games g1
      JOIN coach_games g2
        ON g1.coach_id = g2.coach_id
        AND g1.gamedate = g2.gamedate
        AND g1.game_id < g2.game_id
        AND g1.gametime < (g2.gametime + (g2.max_game_minutes + 15) * INTERVAL '1 minute')
        AND g2.gametime < (g1.gametime + (g1.max_game_minutes + 15) * INTERVAL '1 minute')
      ORDER BY g1.coach_name, g1.gamedate, g1.gametime_fmt
    `;

    return res.status(200).json({ conflicts: rows });
  } catch (err: any) {
    console.error("[leagues/[id]/coaches/conflicts] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
