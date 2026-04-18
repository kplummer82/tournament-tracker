import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export type CalendarGameRow = {
  uid: string;
  source: "season" | "tournament" | "scrimmage";
  id: number;
  context_id: number | null;
  context_name: string | null;
  gamedate: string | null;
  gametime: string | null;
  home: number;
  home_team: string;
  away: number | null;
  away_team: string;
  homescore: number | null;
  awayscore: number | null;
  gamestatusid: number | null;
  gamestatus_label: string | null;
  // scrimmage-only (null for season/tournament rows)
  opponent_team_id: number | null;
  opponent_name_raw: string | null;
  location: string | null;
  notes: string | null;
};

export type TeamRecord = { w: number; l: number; t: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ games: CalendarGameRow[]; teamRecords: Record<number, TeamRecord> } | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const teamId = parseInt(req.query.teamId as string, 10);
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team ID" });

  try {
    const rows = await sql`
      SELECT
        sg.id::text || '-season'        AS uid,
        'season'::text                  AS source,
        sg.id,
        sg.season_id                    AS context_id,
        s.name                          AS context_name,
        sg.gamedate::text               AS gamedate,
        to_char(sg.gametime, 'HH24:MI') AS gametime,
        sg.home,
        ht.name                         AS home_team,
        sg.away,
        at.name                         AS away_team,
        sg.homescore,
        sg.awayscore,
        sg.gamestatusid,
        gs.gamestatus                   AS gamestatus_label,
        NULL::int                       AS opponent_team_id,
        NULL::text                      AS opponent_name_raw,
        NULL::text                      AS location,
        NULL::text                      AS notes
      FROM season_games sg
      JOIN seasons s  ON s.id = sg.season_id
      JOIN teams ht   ON ht.teamid = sg.home
      JOIN teams at   ON at.teamid = sg.away
      LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
      WHERE sg.home = ${teamId} OR sg.away = ${teamId}

      UNION ALL

      SELECT
        tg.id::text || '-tournament'    AS uid,
        'tournament'::text              AS source,
        tg.id,
        tg.tournamentid                 AS context_id,
        t.name                          AS context_name,
        tg.gamedate::text               AS gamedate,
        to_char(tg.gametime, 'HH24:MI') AS gametime,
        tg.home,
        ht.name                         AS home_team,
        tg.away,
        at.name                         AS away_team,
        tg.homescore,
        tg.awayscore,
        tg.gamestatusid,
        gs.gamestatus                   AS gamestatus_label,
        NULL::int                       AS opponent_team_id,
        NULL::text                      AS opponent_name_raw,
        NULL::text                      AS location,
        NULL::text                      AS notes
      FROM tournamentgames tg
      JOIN tournaments t ON t.tournamentid = tg.tournamentid
      JOIN teams ht      ON ht.teamid = tg.home
      JOIN teams at      ON at.teamid = tg.away
      LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
      WHERE tg.home = ${teamId} OR tg.away = ${teamId}

      UNION ALL

      SELECT
        sc.id::text || '-scrimmage'     AS uid,
        'scrimmage'::text               AS source,
        sc.id,
        NULL::int                       AS context_id,
        NULL::text                      AS context_name,
        sc.gamedate::text               AS gamedate,
        to_char(sc.gametime, 'HH24:MI') AS gametime,
        sc.team_id                      AS home,
        ot.name                         AS home_team,
        sc.opponent_team_id             AS away,
        COALESCE(opp.name, sc.opponent_name, 'TBD') AS away_team,
        sc.homescore,
        sc.awayscore,
        sc.gamestatusid,
        gs.gamestatus                   AS gamestatus_label,
        sc.opponent_team_id,
        sc.opponent_name                AS opponent_name_raw,
        sc.location,
        sc.notes
      FROM scrimmages sc
      JOIN teams ot ON ot.teamid = sc.team_id
      LEFT JOIN teams opp ON opp.teamid = sc.opponent_team_id
      LEFT JOIN gamestatusoptions gs  ON gs.id = sc.gamestatusid
      WHERE sc.team_id = ${teamId}

      ORDER BY gamedate NULLS LAST, gametime NULLS LAST, id
    `;

    const games = rows as CalendarGameRow[];

    // Collect all known team IDs from the game list.
    const allTeamIds = [
      ...new Set(
        games.flatMap((g) => [g.home, g.away]).filter((id): id is number => id != null)
      ),
    ];

    const teamRecords: Record<number, TeamRecord> = {};

    if (allTeamIds.length > 0) {
      const recRows = await sql`
        WITH all_results AS (
          -- Season games — home perspective
          SELECT sg.home AS team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND sg.homescore > sg.awayscore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND sg.homescore < sg.awayscore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND sg.homescore = sg.awayscore THEN 'T'
                      ELSE NULL END AS result
          FROM season_games sg
          LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
          WHERE sg.home = ANY(${allTeamIds})
            AND sg.homescore IS NOT NULL AND sg.awayscore IS NOT NULL

          UNION ALL

          -- Season games — away perspective
          SELECT sg.away AS team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND sg.awayscore > sg.homescore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND sg.awayscore < sg.homescore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND sg.awayscore = sg.homescore THEN 'T'
                      ELSE NULL END AS result
          FROM season_games sg
          LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
          WHERE sg.away = ANY(${allTeamIds})
            AND sg.homescore IS NOT NULL AND sg.awayscore IS NOT NULL

          UNION ALL

          -- Tournament games — home perspective
          SELECT tg.home AS team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND tg.homescore > tg.awayscore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND tg.homescore < tg.awayscore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND tg.homescore = tg.awayscore THEN 'T'
                      ELSE NULL END AS result
          FROM tournamentgames tg
          LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
          WHERE tg.home = ANY(${allTeamIds})
            AND tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL

          UNION ALL

          -- Tournament games — away perspective
          SELECT tg.away AS team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND tg.awayscore > tg.homescore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND tg.awayscore < tg.homescore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND tg.awayscore = tg.homescore THEN 'T'
                      ELSE NULL END AS result
          FROM tournamentgames tg
          LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
          WHERE tg.away = ANY(${allTeamIds})
            AND tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL

          UNION ALL

          -- Scrimmages — home (team_id) perspective
          SELECT sc.team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND sc.homescore > sc.awayscore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND sc.homescore < sc.awayscore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND sc.homescore = sc.awayscore THEN 'T'
                      ELSE NULL END AS result
          FROM scrimmages sc
          LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
          WHERE sc.team_id = ANY(${allTeamIds})
            AND sc.homescore IS NOT NULL AND sc.awayscore IS NOT NULL

          UNION ALL

          -- Scrimmages — away (opponent_team_id) perspective
          SELECT sc.opponent_team_id AS team_id,
                 CASE WHEN gs.gamestatus = 'Final' AND sc.awayscore > sc.homescore THEN 'W'
                      WHEN gs.gamestatus = 'Final' AND sc.awayscore < sc.homescore THEN 'L'
                      WHEN gs.gamestatus = 'Final' AND sc.awayscore = sc.homescore THEN 'T'
                      ELSE NULL END AS result
          FROM scrimmages sc
          LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
          WHERE sc.opponent_team_id = ANY(${allTeamIds})
            AND sc.homescore IS NOT NULL AND sc.awayscore IS NOT NULL
        )
        SELECT
          team_id,
          COUNT(*) FILTER (WHERE result = 'W')::int AS w,
          COUNT(*) FILTER (WHERE result = 'L')::int AS l,
          COUNT(*) FILTER (WHERE result = 'T')::int AS t
        FROM all_results
        WHERE result IS NOT NULL
        GROUP BY team_id
      `;

      for (const r of recRows as { team_id: number; w: number; l: number; t: number }[]) {
        teamRecords[r.team_id] = { w: r.w, l: r.l, t: r.t };
      }
    }

    return res.status(200).json({ games, teamRecords });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[teams/games] error", err);
    return res.status(500).json({ error: msg });
  }
}
