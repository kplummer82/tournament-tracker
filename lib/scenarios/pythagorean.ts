/**
 * Pythagorean Expectation prediction engine.
 *
 * Uses each team's runs scored / runs allowed history to deterministically
 * project remaining game outcomes.
 *
 * Formula:
 *   Pythagorean Win% = RS² / (RS² + RA²)
 *   Log5 P(A beats B) = (WA - WA×WB) / (WA + WB - 2×WA×WB)
 *   Projected score = teamRS/G × (opponentRA/G / leagueAvgRA/G)
 *
 * Validity: all teams in the season must have played at least one completed
 * game (non-null homescore/awayscore).
 */

import {
  computeStandings,
  type GameRecord,
  type TeamRecord,
  type TiebreakerConfig,
  type SeasonConfig,
} from "@/lib/standings";
import type { StandingsRow } from "@/lib/standings";
import type { RemainingGame, SimulatedOutcome } from "./simulate";
import type { EngineResult, MatchupEntry } from "./engine";
import {
  toGameRecord,
  buildSampleScenario,
  buildMatchupSampleScenario,
  meetsFirstRoundMatchup,
  findFirstRoundOpponent as findOpponent,
} from "./engine";
import { meetsSeedTarget } from "./simulate";

type SeedMode = "exact" | "or_better" | "or_worse";

type BracketSlice = {
  startSeed: number;
  size: number;
};

export type PythagoreanTeamStats = {
  teamId: number;
  gamesPlayed: number;
  runsScored: number;
  runsAgainst: number;
  rsPer: number;     // RS per game
  raPer: number;     // RA per game
  pytWinPct: number; // RS² / (RS² + RA²)
};

/**
 * Compute Pythagorean stats for each team from completed games.
 * Skips games where either score is null (not yet played or data missing).
 * Forfeit games (winnerSide non-null) are counted normally — they represent a real win/loss.
 */
export function computePythagoreanStats(
  games: GameRecord[],
  teams: TeamRecord[]
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

/**
 * Log5 head-to-head win probability for team A vs team B.
 * Returns the probability A wins (0–1).
 */
export function log5WinProbability(winPctA: number, winPctB: number): number {
  const num = winPctA - winPctA * winPctB;
  const den = winPctA + winPctB - 2 * winPctA * winPctB;
  if (den === 0) return 0.5;
  return num / den;
}

/**
 * Predict the outcome of a single game using Pythagorean stats.
 * Winner is determined by Log5. Scores are projected from RS/G adjusted for
 * opponent run prevention, then rounded to integers with winner ≥ loser + 1.
 */
export function predictGameOutcome(
  homeTeamId: number,
  awayTeamId: number,
  statsMap: Map<number, PythagoreanTeamStats>,
  leagueAvgRaPerG: number
): SimulatedOutcome {
  const homeStats = statsMap.get(homeTeamId);
  const awayStats = statsMap.get(awayTeamId);

  const homeWinPct = homeStats?.pytWinPct ?? 0.5;
  const awayWinPct = awayStats?.pytWinPct ?? 0.5;
  const homeWinProb = log5WinProbability(homeWinPct, awayWinPct);
  const homeWins = homeWinProb >= 0.5;

  // Opponent-adjusted score projection
  const safeLeagueRA = leagueAvgRaPerG > 0 ? leagueAvgRaPerG : 1;
  const projHome = (homeStats?.rsPer ?? 1) * ((awayStats?.raPer ?? safeLeagueRA) / safeLeagueRA);
  const projAway = (awayStats?.rsPer ?? 1) * ((homeStats?.raPer ?? safeLeagueRA) / safeLeagueRA);

  let homescore = Math.round(projHome);
  let awayscore = Math.round(projAway);

  // Ensure scores are non-negative
  homescore = Math.max(0, homescore);
  awayscore = Math.max(0, awayscore);

  // Enforce winner has the higher score (winner score >= loser score + 1)
  if (homeWins) {
    if (homescore <= awayscore) homescore = awayscore + 1;
  } else {
    if (awayscore <= homescore) awayscore = homescore + 1;
  }

  return { home: homeTeamId, away: awayTeamId, homescore, awayscore };
}

/**
 * Validate that all teams have at least one completed game.
 * Returns eligible: true if the Pythagorean method can be used.
 */
export function validatePythagoreanEligibility(
  stats: PythagoreanTeamStats[]
): { eligible: boolean; reason?: string } {
  const noGames = stats.filter((s) => s.gamesPlayed === 0);
  if (noGames.length > 0) {
    return {
      eligible: false,
      reason: `Pythagorean prediction requires all teams to have played at least one game. ${noGames.length} team${noGames.length > 1 ? "s have" : " has"} not played yet.`,
    };
  }
  return { eligible: true };
}

/**
 * Run a deterministic Pythagorean projection for any scenario question type.
 * Used in place of the Monte Carlo engine when simulationMethod === "pythagorean".
 */
export function runPythagoreanAnalysis(
  remainingGames: RemainingGame[],
  standingsData: {
    games: GameRecord[];
    teams: TeamRecord[];
    tiebreakers: TiebreakerConfig[];
    config: SeasonConfig;
  },
  questionType: "seed_achievable" | "first_round_matchup" | "most_likely_seed" | "most_likely_matchup",
  teamId: number,
  targetSeed: number | null,
  seedMode: SeedMode | null,
  opponentTeamId: number | null,
  bracketSlices: BracketSlice[]
): EngineResult {
  const { games, teams, tiebreakers, config } = standingsData;

  // Compute Pythagorean stats for all teams
  const allStats = computePythagoreanStats(games, teams);

  // Validate eligibility
  const eligibility = validatePythagoreanEligibility(allStats);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }

  // Build stats lookup map
  const statsMap = new Map<number, PythagoreanTeamStats>(
    allStats.map((s) => [s.teamId, s])
  );

  // League-average RA/G (simple mean across all teams)
  const teamsWithGames = allStats.filter((s) => s.gamesPlayed > 0);
  const leagueAvgRaPerG =
    teamsWithGames.length > 0
      ? teamsWithGames.reduce((sum, s) => sum + s.raPer, 0) / teamsWithGames.length
      : 1;

  // Deterministically project all remaining games
  const projectedOutcomes: SimulatedOutcome[] = remainingGames.map((g) =>
    predictGameOutcome(g.home, g.away, statsMap, leagueAvgRaPerG)
  );

  // Combine with completed games to compute final standings
  const allGameRecords: GameRecord[] = [
    ...games,
    ...projectedOutcomes.map(toGameRecord),
  ];
  const finalStandings: StandingsRow[] = computeStandings(allGameRecords, teams, tiebreakers, config);

  // Build team name map
  const teamNames = new Map<number, string>(
    finalStandings.map((r) => [r.teamid, r.team ?? `Team ${r.teamid}`])
  );

  if (questionType === "seed_achievable") {
    const met = meetsSeedTarget(finalStandings, teamId, targetSeed!, seedMode!);
    const sample = met
      ? buildSampleScenario(projectedOutcomes, remainingGames, teamId, targetSeed!, finalStandings, teamNames)
      : null;
    return {
      isPossible: met,
      probability: met ? 100 : 0,
      simulationsRun: 1,
      sampleWinningScenario: sample,
      seedDistribution: null,
      mostLikelySeed: null,
      matchupDistribution: null,
      mostLikelyOpponentId: null,
    };
  }

  if (questionType === "first_round_matchup") {
    const met = meetsFirstRoundMatchup(finalStandings, teamId, opponentTeamId!, bracketSlices);
    const sample = met
      ? buildMatchupSampleScenario(projectedOutcomes, remainingGames, teamId, opponentTeamId!, finalStandings, teamNames)
      : null;
    return {
      isPossible: met,
      probability: met ? 100 : 0,
      simulationsRun: 1,
      sampleWinningScenario: sample,
      seedDistribution: null,
      mostLikelySeed: null,
      matchupDistribution: null,
      mostLikelyOpponentId: null,
    };
  }

  if (questionType === "most_likely_seed") {
    const row = finalStandings.find((r) => r.teamid === teamId);
    const seed = row?.rank_final ?? null;
    const sample = seed !== null
      ? buildSampleScenario(projectedOutcomes, remainingGames, teamId, seed, finalStandings, teamNames)
      : null;
    return {
      isPossible: seed !== null,
      probability: seed !== null ? 100 : null,
      simulationsRun: 1,
      sampleWinningScenario: sample,
      seedDistribution: seed !== null ? [{ seed, probability: 100 }] : null,
      mostLikelySeed: seed,
      matchupDistribution: null,
      mostLikelyOpponentId: null,
    };
  }

  // most_likely_matchup
  if (bracketSlices.length === 0 || bracketSlices.every((s) => s.size < 2)) {
    return {
      isPossible: false,
      probability: null,
      simulationsRun: 1,
      sampleWinningScenario: null,
      seedDistribution: null,
      mostLikelySeed: null,
      matchupDistribution: null,
      mostLikelyOpponentId: null,
    };
  }

  const opponentId = findOpponent(finalStandings, teamId, bracketSlices);
  if (opponentId === null) {
    return {
      isPossible: false,
      probability: null,
      simulationsRun: 1,
      sampleWinningScenario: null,
      seedDistribution: null,
      mostLikelySeed: null,
      matchupDistribution: null,
      mostLikelyOpponentId: null,
    };
  }

  const dist: MatchupEntry[] = [{
    teamId: opponentId,
    teamName: teamNames.get(opponentId) ?? `Team ${opponentId}`,
    probability: 100,
  }];

  const teamRow = finalStandings.find((r) => r.teamid === teamId);
  const projectedSeed = teamRow?.rank_final ?? 1;
  const sample = buildMatchupSampleScenario(projectedOutcomes, remainingGames, teamId, opponentId, finalStandings, teamNames);

  return {
    isPossible: true,
    probability: 100,
    simulationsRun: 1,
    sampleWinningScenario: sample,
    seedDistribution: null,
    mostLikelySeed: projectedSeed,
    matchupDistribution: dist,
    mostLikelyOpponentId: opponentId,
  };
}
