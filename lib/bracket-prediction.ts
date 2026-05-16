/**
 * Bracket prediction engine — client-side only (no DB imports).
 *
 * Two methods:
 * 1. Pythagorean: deterministic walk using Log5 win probabilities & projected scores.
 * 2. Monte Carlo: N stochastic simulations; aggregates per-game win probabilities
 *    and championship frequencies.
 *
 * Pure functions for Pythagorean stats, Log5, and score projection are inlined here
 * (originally from `lib/scenarios/pythagorean.ts`) to avoid transitive imports of
 * `@/lib/db` which is server-only.
 */

import type { BracketStructure, BracketGame } from "@/components/bracket/types";
import { computeWinnerSeeds, getHomeSlotIndex } from "@/components/bracket/types";

// ---------------------------------------------------------------------------
// Lightweight type aliases (avoids importing from @/lib/standings which
// transitively pulls in @/lib/db — a server-only module).
// ---------------------------------------------------------------------------

export type GameRecord = {
  gameid: number;
  home: number;
  away: number;
  homescore: number | null;
  awayscore: number | null;
  winnerSide: "home" | "away" | null;
  /** ISO date string (YYYY-MM-DD). Used for as-of date filtering. */
  gamedate?: string | null;
};

export type TeamRecord = { teamid: number; team: string };

export type PythagoreanTeamStats = {
  teamId: number;
  gamesPlayed: number;
  runsScored: number;
  runsAgainst: number;
  rsPer: number;
  raPer: number;
  pytWinPct: number;
};

// ---------------------------------------------------------------------------
// Pythagorean helpers (inlined from lib/scenarios/pythagorean.ts)
// ---------------------------------------------------------------------------

/** Compute Pythagorean stats for each team from completed games. */
function computePythagoreanStats(
  games: GameRecord[],
  teams: TeamRecord[],
): PythagoreanTeamStats[] {
  const rsMap = new Map<number, number>();
  const raMap = new Map<number, number>();
  const gpMap = new Map<number, number>();

  for (const t of teams) {
    rsMap.set(t.teamid, 0);
    raMap.set(t.teamid, 0);
    gpMap.set(t.teamid, 0);
  }

  for (const g of games) {
    if (g.homescore === null || g.awayscore === null) continue;
    const hs = g.homescore;
    const as_ = g.awayscore;
    rsMap.set(g.home, (rsMap.get(g.home) ?? 0) + hs);
    raMap.set(g.home, (raMap.get(g.home) ?? 0) + as_);
    gpMap.set(g.home, (gpMap.get(g.home) ?? 0) + 1);
    rsMap.set(g.away, (rsMap.get(g.away) ?? 0) + as_);
    raMap.set(g.away, (raMap.get(g.away) ?? 0) + hs);
    gpMap.set(g.away, (gpMap.get(g.away) ?? 0) + 1);
  }

  return teams.map((t) => {
    const gp = gpMap.get(t.teamid) ?? 0;
    const rs = rsMap.get(t.teamid) ?? 0;
    const ra = raMap.get(t.teamid) ?? 0;
    const rsPer = gp > 0 ? rs / gp : 0;
    const raPer = gp > 0 ? ra / gp : 0;
    const rs2 = rs * rs;
    const ra2 = ra * ra;
    const pytWinPct = rs2 + ra2 > 0 ? rs2 / (rs2 + ra2) : 0.5;
    return { teamId: t.teamid, gamesPlayed: gp, runsScored: rs, runsAgainst: ra, rsPer, raPer, pytWinPct };
  });
}

/** Log5 head-to-head win probability for team A vs team B. Returns P(A wins). */
function log5WinProbability(winPctA: number, winPctB: number): number {
  const num = winPctA - winPctA * winPctB;
  const den = winPctA + winPctB - 2 * winPctA * winPctB;
  if (den === 0) return 0.5;
  return num / den;
}

type SimulatedOutcome = { home: number; away: number; homescore: number; awayscore: number };

/** Predict a single game outcome using Pythagorean stats + Log5. */
function predictGameOutcome(
  homeTeamId: number,
  awayTeamId: number,
  statsMap: Map<number, PythagoreanTeamStats>,
  leagueAvgRaPerG: number,
): SimulatedOutcome {
  const homeStats = statsMap.get(homeTeamId);
  const awayStats = statsMap.get(awayTeamId);
  const homeWinPct = homeStats?.pytWinPct ?? 0.5;
  const awayWinPct = awayStats?.pytWinPct ?? 0.5;
  const homeWinProb = log5WinProbability(homeWinPct, awayWinPct);
  const homeWins = homeWinProb >= 0.5;

  const safeLeagueRA = leagueAvgRaPerG > 0 ? leagueAvgRaPerG : 1;
  const projHome = (homeStats?.rsPer ?? 1) * ((awayStats?.raPer ?? safeLeagueRA) / safeLeagueRA);
  const projAway = (awayStats?.rsPer ?? 1) * ((homeStats?.raPer ?? safeLeagueRA) / safeLeagueRA);

  let homescore = Math.max(0, Math.round(projHome));
  let awayscore = Math.max(0, Math.round(projAway));

  if (homeWins) {
    if (homescore <= awayscore) homescore = awayscore + 1;
  } else {
    if (awayscore <= homescore) awayscore = homescore + 1;
  }

  return { home: homeTeamId, away: awayTeamId, homescore, awayscore };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PredictionMethod = "pythagorean" | "monte_carlo";

/** Actual result for a bracket game that has already been played. */
export type ActualGameResult = {
  home: number;
  away: number;
  homescore: number;
  awayscore: number;
  gamestatusid: number | null;
};

/** Prediction output for a single bracket game. */
export type BracketGamePrediction = {
  bracketGameId: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeTeamName: string;
  awayTeamName: string;
  isActualResult: boolean;
  isBye: boolean;
  homescore: number | null;
  awayscore: number | null;
  /** Monte Carlo: probability home team wins (0–1). null for Pythagorean/bye/actual. */
  homeWinProbability: number | null;
  winnerId: number | null;
};

/** Full prediction result for an entire bracket. */
export type BracketPredictionResult = {
  method: PredictionMethod;
  games: Record<string, BracketGamePrediction>;
  championId: number | null;
  championName: string;
  /** Monte Carlo only: teamId → championship win % (0–100). */
  championshipProbabilities?: Record<number, number>;
  simulationsRun?: number;
  warning?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the two team IDs for a bracket game (from seeds or feeder winners). */
function resolveGameTeams(
  game: BracketGame,
  roundIndex: number,
  assignments: Record<number, number>,
  winnersMap: Record<string, number>,
): [number | null, number | null] {
  if (roundIndex === 0 && game.seeds) {
    if (game.seeds.length === 1) {
      return [assignments[game.seeds[0]] ?? null, null]; // bye
    }
    return [
      assignments[game.seeds[0]] ?? null,
      assignments[game.seeds[1]] ?? null,
    ];
  }
  if (game.feedsFrom) {
    return [
      winnersMap[game.feedsFrom[0]] ?? null,
      winnersMap[game.feedsFrom[1]] ?? null,
    ];
  }
  return [null, null];
}

/** Determine home/away from seed-based logic. Returns [homeId, awayId]. */
function orientHomeAway(
  game: BracketGame,
  roundIndex: number,
  teamA: number,
  teamB: number,
  structure: BracketStructure,
): [number, number] {
  if (roundIndex === 0 && game.seeds && game.seeds.length >= 2) {
    // First round: lower seed number = home
    return game.seeds[0] < game.seeds[1] ? [teamA, teamB] : [teamB, teamA];
  }

  const winnerSeeds = computeWinnerSeeds(structure);
  const seedsA = winnerSeeds.get(game.feedsFrom?.[0] ?? "") ?? new Set<number>();
  const seedsB = winnerSeeds.get(game.feedsFrom?.[1] ?? "") ?? new Set<number>();

  const homeIdx = getHomeSlotIndex(seedsA, seedsB);
  if (homeIdx === 0) return [teamA, teamB];
  if (homeIdx === 1) return [teamB, teamA];
  return [teamA, teamB]; // default: first slot = home
}

function determineWinner(
  homescore: number,
  awayscore: number,
  homeId: number,
  awayId: number,
  gamestatusid?: number | null,
): number {
  // Forfeit statuses
  if (gamestatusid === 6) return awayId;  // home forfeited
  if (gamestatusid === 7) return homeId;  // away forfeited
  return homescore >= awayscore ? homeId : awayId;
}

function isByeGame(game: BracketGame, roundIndex: number): boolean {
  return roundIndex === 0 && (game.seeds?.length ?? 0) === 1;
}

/** Find the final game in the bracket (last round, only game). */
function findFinalGameId(structure: BracketStructure): string | null {
  const lastRound = structure.rounds[structure.rounds.length - 1];
  if (!lastRound?.games.length) return null;
  return lastRound.games[lastRound.games.length - 1].id;
}

// ---------------------------------------------------------------------------
// Prepare stats from raw game data
// ---------------------------------------------------------------------------

export function preparePredictionStats(
  completedGames: GameRecord[],
  teams: TeamRecord[],
): {
  statsMap: Map<number, PythagoreanTeamStats>;
  leagueAvgRaPerG: number;
  warning: string | null;
} {
  const allStats = computePythagoreanStats(completedGames, teams);
  const statsMap = new Map<number, PythagoreanTeamStats>(
    allStats.map((s) => [s.teamId, s]),
  );

  const teamsWithGames = allStats.filter((s) => s.gamesPlayed > 0);
  const leagueAvgRaPerG =
    teamsWithGames.length > 0
      ? teamsWithGames.reduce((sum, s) => sum + s.raPer, 0) / teamsWithGames.length
      : 1;

  const noGames = allStats.filter((s) => s.gamesPlayed === 0);
  const warning =
    noGames.length > 0
      ? `${noGames.length} team${noGames.length > 1 ? "s have" : " has"} no game history — predictions may be less accurate.`
      : null;

  return { statsMap, leagueAvgRaPerG, warning };
}

// ---------------------------------------------------------------------------
// Single-simulation walk (used by both Pythagorean and each MC iteration)
// ---------------------------------------------------------------------------

type SimWalkResult = {
  games: Record<string, BracketGamePrediction>;
  winnersMap: Record<string, number>;
};

function simulateBracketWalk(
  structure: BracketStructure,
  assignments: Record<number, number>,
  teamNames: Record<number, string>,
  actualResults: Record<string, ActualGameResult>,
  statsMap: Map<number, PythagoreanTeamStats>,
  leagueAvgRaPerG: number,
  mode: "deterministic" | "stochastic",
): SimWalkResult {
  const winnersMap: Record<string, number> = {};
  const games: Record<string, BracketGamePrediction> = {};

  for (const round of structure.rounds) {
    for (const game of round.games) {
      // Bye game
      if (isByeGame(game, round.round)) {
        const teamId = assignments[game.seeds![0]] ?? null;
        if (teamId != null) winnersMap[game.id] = teamId;
        games[game.id] = {
          bracketGameId: game.id,
          homeTeamId: teamId,
          awayTeamId: null,
          homeTeamName: teamId != null ? (teamNames[teamId] ?? `Team ${teamId}`) : "TBD",
          awayTeamName: "",
          isActualResult: false,
          isBye: true,
          homescore: null,
          awayscore: null,
          homeWinProbability: null,
          winnerId: teamId,
        };
        continue;
      }

      const [teamA, teamB] = resolveGameTeams(game, round.round, assignments, winnersMap);

      // Already completed — use actual result
      const actual = actualResults[game.id];
      if (actual && actual.homescore != null && actual.awayscore != null) {
        // Always re-derive home/away from current assignments/winnersMap rather than trusting
        // the DB record. The DB home/away on first-round games can be stale if seeds changed
        // after scores were entered; later-round games may have null home/away if advanceWinner
        // hasn't run yet (e.g. as-of mode). Fall back to DB values only when we can't resolve.
        let homeId: number;
        let awayId: number;
        if (teamA != null && teamB != null) {
          [homeId, awayId] = orientHomeAway(game, round.round, teamA, teamB, structure);
        } else {
          homeId = actual.home;
          awayId = actual.away;
        }
        const winner = determineWinner(actual.homescore, actual.awayscore, homeId, awayId, actual.gamestatusid);
        winnersMap[game.id] = winner;
        games[game.id] = {
          bracketGameId: game.id,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeTeamName: teamNames[homeId] ?? `Team ${homeId}`,
          awayTeamName: teamNames[awayId] ?? `Team ${awayId}`,
          isActualResult: true,
          isBye: false,
          homescore: actual.homescore,
          awayscore: actual.awayscore,
          homeWinProbability: null,
          winnerId: winner,
        };
        continue;
      }

      // If we can't resolve both teams, mark TBD
      if (teamA == null || teamB == null) {
        games[game.id] = {
          bracketGameId: game.id,
          homeTeamId: teamA,
          awayTeamId: teamB,
          homeTeamName: teamA != null ? (teamNames[teamA] ?? `Team ${teamA}`) : "TBD",
          awayTeamName: teamB != null ? (teamNames[teamB] ?? `Team ${teamB}`) : "TBD",
          isActualResult: false,
          isBye: false,
          homescore: null,
          awayscore: null,
          homeWinProbability: null,
          winnerId: null,
        };
        continue;
      }

      // Orient home/away
      const [homeId, awayId] = orientHomeAway(game, round.round, teamA, teamB, structure);

      const homeStats = statsMap.get(homeId);
      const awayStats = statsMap.get(awayId);
      const homeWinPct = homeStats?.pytWinPct ?? 0.5;
      const awayWinPct = awayStats?.pytWinPct ?? 0.5;
      const homeWinProb = log5WinProbability(homeWinPct, awayWinPct);

      let homescore: number;
      let awayscore: number;
      let winnerId: number;

      if (mode === "deterministic") {
        const outcome = predictGameOutcome(homeId, awayId, statsMap, leagueAvgRaPerG);
        homescore = outcome.homescore;
        awayscore = outcome.awayscore;
        winnerId = homescore >= awayscore ? homeId : awayId;
      } else {
        // Stochastic: sample winner based on probability
        const homeWins = Math.random() < homeWinProb;
        winnerId = homeWins ? homeId : awayId;
        // Generate plausible scores
        const outcome = predictGameOutcome(homeId, awayId, statsMap, leagueAvgRaPerG);
        if (homeWins) {
          homescore = Math.max(outcome.homescore, outcome.awayscore + 1);
          awayscore = Math.min(outcome.homescore, outcome.awayscore);
        } else {
          awayscore = Math.max(outcome.homescore, outcome.awayscore + 1);
          homescore = Math.min(outcome.homescore, outcome.awayscore);
        }
      }

      winnersMap[game.id] = winnerId;
      games[game.id] = {
        bracketGameId: game.id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: teamNames[homeId] ?? `Team ${homeId}`,
        awayTeamName: teamNames[awayId] ?? `Team ${awayId}`,
        isActualResult: false,
        isBye: false,
        homescore,
        awayscore,
        homeWinProbability: mode === "stochastic" ? homeWinProb : null,
        winnerId,
      };
    }
  }

  return { games, winnersMap };
}

// ---------------------------------------------------------------------------
// Pythagorean (deterministic)
// ---------------------------------------------------------------------------

export function predictBracketPythagorean(
  structure: BracketStructure,
  assignments: Record<number, number>,
  teamNames: Record<number, string>,
  actualResults: Record<string, ActualGameResult>,
  statsMap: Map<number, PythagoreanTeamStats>,
  leagueAvgRaPerG: number,
  warning?: string | null,
): BracketPredictionResult {
  const { games, winnersMap } = simulateBracketWalk(
    structure, assignments, teamNames, actualResults,
    statsMap, leagueAvgRaPerG, "deterministic",
  );

  const finalGameId = findFinalGameId(structure);
  const championId = finalGameId ? (winnersMap[finalGameId] ?? null) : null;
  const championName = championId != null ? (teamNames[championId] ?? `Team ${championId}`) : "Unknown";

  return {
    method: "pythagorean",
    games,
    championId,
    championName,
    ...(warning ? { warning } : {}),
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo (stochastic)
// ---------------------------------------------------------------------------

export function predictBracketMonteCarlo(
  structure: BracketStructure,
  assignments: Record<number, number>,
  teamNames: Record<number, string>,
  actualResults: Record<string, ActualGameResult>,
  statsMap: Map<number, PythagoreanTeamStats>,
  leagueAvgRaPerG: number,
  numSimulations = 1000,
  warning?: string | null,
): BracketPredictionResult {
  const finalGameId = findFinalGameId(structure);

  // Aggregate counters
  const homeWinCounts: Record<string, number> = {};
  const gameTotals: Record<string, number> = {};
  const championCounts: Record<number, number> = {};

  // Keep the first simulation's games as representative display data
  let representativeGames: Record<string, BracketGamePrediction> | null = null;

  for (let i = 0; i < numSimulations; i++) {
    const { games, winnersMap } = simulateBracketWalk(
      structure, assignments, teamNames, actualResults,
      statsMap, leagueAvgRaPerG, "stochastic",
    );

    if (i === 0) representativeGames = games;

    // Count per-game home wins
    for (const [gameId, pred] of Object.entries(games)) {
      if (pred.isBye || pred.isActualResult) continue;
      gameTotals[gameId] = (gameTotals[gameId] ?? 0) + 1;
      if (pred.winnerId === pred.homeTeamId) {
        homeWinCounts[gameId] = (homeWinCounts[gameId] ?? 0) + 1;
      }
    }

    // Count championship wins
    if (finalGameId) {
      const champId = winnersMap[finalGameId];
      if (champId != null) {
        championCounts[champId] = (championCounts[champId] ?? 0) + 1;
      }
    }
  }

  // Compute per-game probabilities and inject into representative games
  const finalGames: Record<string, BracketGamePrediction> = {};
  if (representativeGames) {
    for (const [gameId, pred] of Object.entries(representativeGames)) {
      const total = gameTotals[gameId] ?? 0;
      const homeWins = homeWinCounts[gameId] ?? 0;
      finalGames[gameId] = {
        ...pred,
        homeWinProbability: total > 0 ? homeWins / total : null,
      };
    }
  }

  // Championship probabilities as percentages
  const championshipProbabilities: Record<number, number> = {};
  for (const [teamIdStr, count] of Object.entries(championCounts)) {
    championshipProbabilities[Number(teamIdStr)] = (count / numSimulations) * 100;
  }

  // Find most likely champion
  let championId: number | null = null;
  let maxCount = 0;
  for (const [teamIdStr, count] of Object.entries(championCounts)) {
    if (count > maxCount) {
      maxCount = count;
      championId = Number(teamIdStr);
    }
  }
  const championName = championId != null ? (teamNames[championId] ?? `Team ${championId}`) : "Unknown";

  return {
    method: "monte_carlo",
    games: finalGames,
    championId,
    championName,
    championshipProbabilities,
    simulationsRun: numSimulations,
    ...(warning ? { warning } : {}),
  };
}
