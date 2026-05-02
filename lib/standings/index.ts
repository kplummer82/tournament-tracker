export { computeStandings } from "./ranker";
export type { GameRecord, SeasonConfig, StandingsRow, TeamRecord, TiebreakerConfig } from "./types";

import { sql } from "@/lib/db";
import type { GameRecord, SeasonConfig, TeamRecord, TiebreakerConfig } from "./types";

// ---------------------------------------------------------------------------
// Season data fetcher
// ---------------------------------------------------------------------------

export async function fetchSeasonStandingsData(
  seasonId: number,
  opts?: { includeInProgress?: boolean; asOfDate?: string }
): Promise<{
  games: GameRecord[];
  teams: TeamRecord[];
  tiebreakers: TiebreakerConfig[];
  config: SeasonConfig;
}> {
  const { includeInProgress = false, asOfDate } = opts ?? {};

  // Teams, tiebreakers, and config don't depend on mode — fetch in parallel
  const [teamRows, tbRows, configRows] = await Promise.all([
    sql`
      SELECT st.team_id AS teamid, t.name AS team
      FROM season_teams st
      JOIN teams t ON t.teamid = st.team_id
      WHERE st.season_id = ${seasonId}
    `,
    sql`
      SELECT tb.tiebreaker AS code,
             tb."SortDirection" AS sort_direction,
             st.priority
      FROM season_tiebreakers st
      JOIN tiebreakers tb ON tb.id = st.tiebreaker_id
      WHERE st.season_id = ${seasonId}
      ORDER BY st.priority ASC
    `,
    sql`
      SELECT maxrundiff, COALESCE(forfeit_run_diff, 0) AS forfeit_run_diff
      FROM seasons
      WHERE id = ${seasonId}
    `,
  ]);

  // Game query varies by mode
  let gameRows;
  if (asOfDate) {
    gameRows = await sql`
      SELECT id AS gameid, home, away, homescore, awayscore, gamestatusid
      FROM season_games
      WHERE season_id = ${seasonId}
        AND game_type = 'regular'
        AND gamestatusid IN (4, 6, 7)
        AND gamedate <= ${asOfDate}
    `;
  } else if (includeInProgress) {
    gameRows = await sql`
      SELECT id AS gameid, home, away, homescore, awayscore, gamestatusid
      FROM season_games
      WHERE season_id = ${seasonId}
        AND game_type = 'regular'
        AND gamestatusid IN (3, 4, 6, 7)
    `;
  } else {
    gameRows = await sql`
      SELECT id AS gameid, home, away, homescore, awayscore, gamestatusid
      FROM season_games
      WHERE season_id = ${seasonId}
        AND game_type = 'regular'
        AND gamestatusid IN (4, 6, 7)
    `;
  }

  const teams = teamRows as TeamRecord[];

  const games: GameRecord[] = (gameRows as {
    gameid: number;
    home: number;
    away: number;
    homescore: number | null;
    awayscore: number | null;
    gamestatusid: number;
  }[]).map((g) => ({
    gameid: Number(g.gameid),
    home: Number(g.home),
    away: Number(g.away),
    homescore: g.homescore != null ? Number(g.homescore) : null,
    awayscore: g.awayscore != null ? Number(g.awayscore) : null,
    winnerSide:
      g.gamestatusid === 6 ? "away"  // Home team forfeited → away wins
      : g.gamestatusid === 7 ? "home" // Away team forfeited → home wins
      : null,
  }));

  const tiebreakers: TiebreakerConfig[] = (tbRows as {
    code: string;
    sort_direction: string;
    priority: number;
  }[]).map((r) => ({
    code: r.code,
    sortDirection: (r.sort_direction === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC",
    priority: Number(r.priority),
  }));

  const cfg = configRows[0] as { maxrundiff: number; forfeit_run_diff: number };
  const config: SeasonConfig = {
    maxrundiff: Number(cfg?.maxrundiff ?? 10),
    forfeit_run_diff: Number(cfg?.forfeit_run_diff ?? 0),
  };

  return { games, teams, tiebreakers, config };
}

// ---------------------------------------------------------------------------
// Tournament (pool play) data fetcher
// ---------------------------------------------------------------------------

export async function fetchTournamentStandingsData(tournamentId: number): Promise<{
  games: GameRecord[];
  teams: TeamRecord[];
  tiebreakers: TiebreakerConfig[];
  config: SeasonConfig;
}> {
  const [teamRows, gameRows, tbRows, configRows] = await Promise.all([
    sql`
      SELECT tt.teamid, t.name AS team
      FROM tournamentteams tt
      JOIN teams t ON t.teamid = tt.teamid
      WHERE tt.tournamentid = ${tournamentId}
    `,
    sql`
      SELECT id AS gameid, home, away, homescore, awayscore
      FROM tournamentgames
      WHERE tournamentid = ${tournamentId}
        AND poolorbracket = 'Pool'
        AND homescore IS NOT NULL
        AND awayscore IS NOT NULL
        AND COALESCE(gamestatusid, 4) IN (4, 6, 7)
    `,
    sql`
      SELECT tb.tiebreaker AS code,
             tb."SortDirection" AS sort_direction,
             tt.priority
      FROM tournamenttiebreakers tt
      JOIN tiebreakers tb ON tb.id = tt.tiebreakerid
      WHERE tt.tournamentid = ${tournamentId}
      ORDER BY tt.priority ASC
    `,
    sql`
      SELECT maxrundiff
      FROM tournaments
      WHERE tournamentid = ${tournamentId}
    `,
  ]);

  const teams = teamRows as TeamRecord[];

  // Tournament pool games have no forfeits — winnerSide always null
  const games: GameRecord[] = (gameRows as {
    gameid: number;
    home: number;
    away: number;
    homescore: number;
    awayscore: number;
  }[]).map((g) => ({
    gameid: Number(g.gameid),
    home: Number(g.home),
    away: Number(g.away),
    homescore: Number(g.homescore),
    awayscore: Number(g.awayscore),
    winnerSide: null,
  }));

  const tiebreakers: TiebreakerConfig[] = (tbRows as {
    code: string;
    sort_direction: string;
    priority: number;
  }[]).map((r) => ({
    code: r.code,
    sortDirection: (r.sort_direction === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC",
    priority: Number(r.priority),
  }));

  const cfg = configRows[0] as { maxrundiff: number } | undefined;
  const config: SeasonConfig = {
    maxrundiff: Number(cfg?.maxrundiff ?? 10),
    forfeit_run_diff: 0, // tournaments don't use forfeit_run_diff
  };

  return { games, teams, tiebreakers, config };
}
