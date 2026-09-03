/**
 * Client-side access to the tournament projection.
 *
 * Deliberately free of `@/lib/db` imports — the Pool, Standings and Bracket
 * tabs all call `fetchTournamentPrediction` from the browser, then each renders
 * the slice of the response it cares about.
 */
import type { PythagoreanTeamStats } from "@/lib/bracket-prediction";
import { gameSourcesQuery, type GameSource } from "@/lib/teams/gameSources";

export type ProjectedPoolGame = {
  gameid: number;
  home: number;
  away: number;
  homescore: number;
  awayscore: number;
};

/** Mirrors the standings row shape, with the pool group attached. */
export type ProjectedStandingsRow = {
  teamid: number;
  team: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  wltpct: number;
  runsscored: number;
  runsagainst: number;
  rundifferential: number;
  rank_final: number;
  pool_group: string | null;
};

export type TournamentPrediction = {
  standings: ProjectedStandingsRow[];
  projectedGames: ProjectedPoolGame[];
  /** Team ids in projected finishing order — the seed source for bracket play. */
  seedOrder: number[];
  stats: PythagoreanTeamStats[];
  leagueAvgRaPerG: number;
  projectedGamesCount: number;
  completedGamesCount: number;
  warning: string | null;
};

export async function fetchTournamentPrediction(
  tournamentId: number,
  sources: GameSource[],
  includeInProgress: boolean
): Promise<TournamentPrediction> {
  const params = new URLSearchParams({
    sources: gameSourcesQuery(sources),
    includeInProgress: String(includeInProgress),
  });
  const res = await fetch(`/api/tournaments/${tournamentId}/prediction?${params}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Prediction failed (HTTP ${res.status})`);
  }
  return (await res.json()) as TournamentPrediction;
}

/** Rebuild the stats lookup `lib/bracket-prediction` expects from the API payload. */
export function statsMapFrom(stats: PythagoreanTeamStats[]): Map<number, PythagoreanTeamStats> {
  return new Map(stats.map((s) => [s.teamId, s]));
}

/** Scores keyed by pool game id, for overlaying onto the Pool tab. */
export function projectedGamesById(
  games: ProjectedPoolGame[]
): Map<number, ProjectedPoolGame> {
  return new Map(games.map((g) => [g.gameid, g]));
}
