/**
 * A team's completed-game history, aggregated across every place games live:
 * scrimmages, league (season) games, and tournament games.
 *
 * One query returns per-team totals broken out *by source* so callers can let
 * the viewer include or exclude sources without another round trip. Two things
 * are built on top of it — the W-L-T record shown on team-facing screens, and
 * the runs scored/allowed that feed Pythagorean prediction.
 *
 * A game counts only when its status is Final and both scores are recorded.
 * Forfeits entered without scores therefore land in neither column — that has
 * always been the behaviour on the team calendar and is kept deliberately.
 *
 * The pure roll-up helpers live in `./gameSources` so browser code can use them
 * without dragging `@/lib/db` along.
 */

import { sql } from "@/lib/db";
import type { GameSource, SourceAggregate } from "./gameSources";

export type { GameSource, SourceAggregate };

/**
 * Per-team, per-source totals for every completed game these teams have played.
 *
 * Each source contributes two branches — one from the home side, one from the
 * away side — so a game between two requested teams is counted once for each.
 * Scrimmages are stored one-sided (`team_id` hosts, `opponent_team_id` visits),
 * so their two branches mirror that shape rather than home/away columns.
 */
export async function fetchTeamGameAggregates(teamIds: number[]): Promise<SourceAggregate[]> {
  if (teamIds.length === 0) return [];

  const rows = (await sql`
    WITH all_results AS (
      -- Season games — home perspective
      SELECT sg.home AS team_id,
             'season'::text AS source,
             CASE WHEN sg.homescore > sg.awayscore THEN 'W'
                  WHEN sg.homescore < sg.awayscore THEN 'L'
                  ELSE 'T' END AS result,
             sg.homescore AS rs,
             sg.awayscore AS ra
      FROM season_games sg
      LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
      WHERE sg.home = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND sg.homescore IS NOT NULL AND sg.awayscore IS NOT NULL

      UNION ALL

      -- Season games — away perspective
      SELECT sg.away AS team_id,
             'season'::text AS source,
             CASE WHEN sg.awayscore > sg.homescore THEN 'W'
                  WHEN sg.awayscore < sg.homescore THEN 'L'
                  ELSE 'T' END AS result,
             sg.awayscore AS rs,
             sg.homescore AS ra
      FROM season_games sg
      LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
      WHERE sg.away = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND sg.homescore IS NOT NULL AND sg.awayscore IS NOT NULL

      UNION ALL

      -- Tournament games — home perspective
      SELECT tg.home AS team_id,
             'tournament'::text AS source,
             CASE WHEN tg.homescore > tg.awayscore THEN 'W'
                  WHEN tg.homescore < tg.awayscore THEN 'L'
                  ELSE 'T' END AS result,
             tg.homescore AS rs,
             tg.awayscore AS ra
      FROM tournamentgames tg
      LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
      WHERE tg.home = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL

      UNION ALL

      -- Tournament games — away perspective
      SELECT tg.away AS team_id,
             'tournament'::text AS source,
             CASE WHEN tg.awayscore > tg.homescore THEN 'W'
                  WHEN tg.awayscore < tg.homescore THEN 'L'
                  ELSE 'T' END AS result,
             tg.awayscore AS rs,
             tg.homescore AS ra
      FROM tournamentgames tg
      LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
      WHERE tg.away = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND tg.homescore IS NOT NULL AND tg.awayscore IS NOT NULL

      UNION ALL

      -- Scrimmages — host (team_id) perspective
      SELECT sc.team_id,
             'scrimmage'::text AS source,
             CASE WHEN sc.homescore > sc.awayscore THEN 'W'
                  WHEN sc.homescore < sc.awayscore THEN 'L'
                  ELSE 'T' END AS result,
             sc.homescore AS rs,
             sc.awayscore AS ra
      FROM scrimmages sc
      LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
      WHERE sc.team_id = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND sc.homescore IS NOT NULL AND sc.awayscore IS NOT NULL

      UNION ALL

      -- Scrimmages — visitor (opponent_team_id) perspective
      SELECT sc.opponent_team_id AS team_id,
             'scrimmage'::text AS source,
             CASE WHEN sc.awayscore > sc.homescore THEN 'W'
                  WHEN sc.awayscore < sc.homescore THEN 'L'
                  ELSE 'T' END AS result,
             sc.awayscore AS rs,
             sc.homescore AS ra
      FROM scrimmages sc
      LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
      WHERE sc.opponent_team_id = ANY(${teamIds})
        AND gs.gamestatus = 'Final'
        AND sc.homescore IS NOT NULL AND sc.awayscore IS NOT NULL
    )
    SELECT
      team_id,
      source,
      COUNT(*) FILTER (WHERE result = 'W')::int AS w,
      COUNT(*) FILTER (WHERE result = 'L')::int AS l,
      COUNT(*) FILTER (WHERE result = 'T')::int AS t,
      COUNT(*)::int                             AS games,
      COALESCE(SUM(rs), 0)::int                 AS runs_scored,
      COALESCE(SUM(ra), 0)::int                 AS runs_against
    FROM all_results
    GROUP BY team_id, source
  `) as {
    team_id: number;
    source: string;
    w: number;
    l: number;
    t: number;
    games: number;
    runs_scored: number;
    runs_against: number;
  }[];

  return rows.map((r) => ({
    team_id: Number(r.team_id),
    source: r.source as GameSource,
    w: Number(r.w),
    l: Number(r.l),
    t: Number(r.t),
    games: Number(r.games),
    runs_scored: Number(r.runs_scored),
    runs_against: Number(r.runs_against),
  }));
}

/** Group aggregates by team id. */
export function groupAggregatesByTeam(
  aggregates: SourceAggregate[]
): Map<number, SourceAggregate[]> {
  const byTeam = new Map<number, SourceAggregate[]>();
  for (const a of aggregates) {
    const existing = byTeam.get(a.team_id);
    if (existing) existing.push(a);
    else byTeam.set(a.team_id, [a]);
  }
  return byTeam;
}
