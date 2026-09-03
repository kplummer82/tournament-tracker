/**
 * Project the rest of a tournament.
 *
 * Pool games that have already been played are kept exactly as they are; every
 * unplayed one gets a deterministic Pythagorean/Log5 projection, and the two
 * sets together are run through the normal standings ranker so the projected
 * table honours the tournament's own tiebreakers.
 *
 * The team strength that drives the projection comes from the viewer's selected
 * game sources (`?sources=`), not just this tournament's handful of pool games —
 * that cross-source history is the whole reason records are surfaced in the UI.
 *
 * Bracket play is *not* walked here. The client owns that step so it can reuse
 * `lib/bracket-prediction.ts` against whichever bracket structures are loaded;
 * this route hands back the per-team stats and the projected seed order it needs.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import {
  fetchTournamentStandingsData,
  computeStandings,
  type GameRecord,
} from "@/lib/standings";
import {
  predictGameOutcome,
  type PythagoreanTeamStats,
} from "@/lib/scenarios/pythagorean";
import { fetchTeamGameAggregates } from "@/lib/teams/gameHistory";
import { parseGameSources, sumRunStats } from "@/lib/teams/gameSources";
import type { TournamentStandingsRow } from "./standings";

export type ProjectedPoolGame = {
  gameid: number;
  home: number;
  away: number;
  homescore: number;
  awayscore: number;
};

export type TournamentPredictionResponse = {
  standings: TournamentStandingsRow[];
  projectedGames: ProjectedPoolGame[];
  seedOrder: number[];
  stats: PythagoreanTeamStats[];
  leagueAvgRaPerG: number;
  projectedGamesCount: number;
  completedGamesCount: number;
  warning: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const tournamentId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournamentid" });
  }

  const sources = parseGameSources(req.query.sources);
  const includeInProgress = req.query.includeInProgress === "true";

  try {
    const [data, unplayedRows, groupRows] = await Promise.all([
      fetchTournamentStandingsData(tournamentId, { includeInProgress }),
      // Pool games still to be played. This must be the complement of the
      // completed predicate used by fetchTournamentStandingsData, not a plain
      // `status IN (1,2,3)`: on tournamentgames a NULL status means Final by
      // legacy convention, so an untouched row would otherwise count as neither.
      sql`
        SELECT id AS gameid, home, away
        FROM tournamentgames
        WHERE tournamentid = ${tournamentId}
          AND poolorbracket = 'Pool'
          AND home IS NOT NULL
          AND away IS NOT NULL
          AND COALESCE(gamestatusid, 4) NOT IN (5, 6, 7, 8)
          AND NOT (
            COALESCE(gamestatusid, 4) = 4
            AND homescore IS NOT NULL
            AND awayscore IS NOT NULL
          )
        ORDER BY gamedate NULLS LAST, gametime NULLS LAST, id
      `,
      sql`
        SELECT teamid, pool_group
        FROM public.tournamentteams
        WHERE tournamentid = ${tournamentId}
      `,
    ]);

    const teamIds = data.teams.map((t) => t.teamid);

    // Team strength from the selected sources, across all of history.
    const aggregates = await fetchTeamGameAggregates(teamIds);
    const stats: PythagoreanTeamStats[] = data.teams.map((t) => {
      const own = aggregates.filter((a) => a.team_id === t.teamid);
      const s = sumRunStats(own, sources);
      return {
        teamId: t.teamid,
        gamesPlayed: s.gamesPlayed,
        runsScored: s.runsScored,
        runsAgainst: s.runsAgainst,
        rsPer: s.rsPer,
        raPer: s.raPer,
        pytWinPct: s.pytWinPct,
      };
    });
    const statsMap = new Map<number, PythagoreanTeamStats>(stats.map((s) => [s.teamId, s]));

    const withHistory = stats.filter((s) => s.gamesPlayed > 0);
    const leagueAvgRaPerG =
      withHistory.length > 0
        ? withHistory.reduce((sum, s) => sum + s.raPer, 0) / withHistory.length
        : 1;

    const unplayed = (unplayedRows as { gameid: number; home: number; away: number }[]).map((g) => ({
      gameid: Number(g.gameid),
      home: Number(g.home),
      away: Number(g.away),
    }));

    const projectedGames: ProjectedPoolGame[] = unplayed.map((g) => {
      const outcome = predictGameOutcome(g.home, g.away, statsMap, leagueAvgRaPerG);
      return {
        gameid: g.gameid,
        home: g.home,
        away: g.away,
        homescore: outcome.homescore,
        awayscore: outcome.awayscore,
      };
    });

    const projectedRecords: GameRecord[] = projectedGames.map((g) => ({
      gameid: g.gameid,
      home: g.home,
      away: g.away,
      homescore: g.homescore,
      awayscore: g.awayscore,
      winnerSide: null,
    }));

    // Projected ranks are hypothetical, so no manual coin-toss result is applied.
    const rows = computeStandings(
      [...data.games, ...projectedRecords],
      data.teams,
      data.tiebreakers,
      data.config
    );

    const groupMap = new Map(
      (groupRows as { teamid: number; pool_group: string | null }[]).map((r) => [
        Number(r.teamid),
        r.pool_group ?? null,
      ])
    );

    const standings: TournamentStandingsRow[] = rows
      .slice()
      .sort((a, b) => a.rank_final - b.rank_final)
      .map((r) => ({ ...r, pool_group: groupMap.get(r.teamid) ?? null }));

    const noHistory = stats.filter((s) => s.gamesPlayed === 0);
    const warning =
      noHistory.length > 0
        ? `${noHistory.length} team${noHistory.length > 1 ? "s have" : " has"} no game history in the selected sources — those matchups are projected as coin flips.`
        : null;

    const payload: TournamentPredictionResponse = {
      standings,
      projectedGames,
      seedOrder: standings.map((r) => r.teamid),
      stats,
      leagueAvgRaPerG,
      projectedGamesCount: projectedGames.length,
      completedGamesCount: data.games.length,
      warning,
    };

    return res.status(200).json(payload);
  } catch (err: unknown) {
    console.error("[tournament prediction]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
