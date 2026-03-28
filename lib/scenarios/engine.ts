/**
 * Scenario analysis engine.
 * Two-layer approach:
 *   1. Possibility check (best-case heuristic)
 *   2. Monte Carlo simulation (Layer 1: win/loss only → Layer 2: with scores if ambiguous)
 *
 * `max_simulations` is a total budget across all layers — each call to the standings
 * function counts as 1 simulation.
 */

import { sql } from "@/lib/db";
import {
  type RemainingGame,
  type SimulatedOutcome,
  type StandingsRow,
  generateWinLossOutcomes,
  generateScoredOutcomes,
  generateBestCaseOutcomes,
  generateWorstCaseOutcomes,
  generateMatchupDirectedOutcomes,
  meetsSeedTarget,
  isAmbiguous,
} from "./simulate";

type SeedMode = "exact" | "or_better";

type ProgressCallback = (simRun: number) => void;

export type EngineResult = {
  isPossible: boolean;
  probability: number | null; // 0-100, null if impossible
  simulationsRun: number;
};

/** Call the standings function with simulated outcomes. */
async function callStandings(
  seasonId: number,
  simulated: { home: number; away: number; homescore: number; awayscore: number }[]
): Promise<StandingsRow[]> {
  const json = JSON.stringify(simulated);
  const rows = await sql`
    SELECT teamid, team, wins, games, wltpct, runsscored, runsagainst,
           rundifferential, rank_final, lexi_key, details
    FROM public.fn_season_standings_lexi_noorder(
      ${seasonId}, false, true, ${json}::jsonb
    )
  `;
  // Neon returns numeric/bigint as strings — coerce to numbers
  return (rows as Record<string, unknown>[]).map((r) => ({
    teamid: Number(r.teamid),
    team: r.team as string | null,
    wins: Number(r.wins),
    games: Number(r.games),
    wltpct: Number(r.wltpct),
    runsscored: Number(r.runsscored),
    runsagainst: Number(r.runsagainst),
    rundifferential: Number(r.rundifferential),
    rank_final: Number(r.rank_final),
    lexi_key: Number(r.lexi_key),
    details: r.details as Record<string, unknown> | null,
  }));
}

/** Get remaining (incomplete) regular-season games. */
async function getRemainingGames(seasonId: number): Promise<RemainingGame[]> {
  const rows = await sql`
    SELECT id, home, away
    FROM season_games
    WHERE season_id = ${seasonId}
      AND game_type = 'regular'
      AND (gamestatusid IS NULL OR gamestatusid NOT IN (4, 6, 7))
  `;
  return rows as unknown as RemainingGame[];
}

/** Get season settings. */
async function getSeasonSettings(seasonId: number): Promise<{ maxRunDiff: number | null }> {
  const rows = await sql`SELECT maxrundiff FROM seasons WHERE id = ${seasonId}`;
  return { maxRunDiff: rows[0]?.maxrundiff ?? null };
}

/** Read max_simulations from app_settings. */
async function getMaxSimulations(): Promise<number> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = 'max_simulations'`;
  return rows.length ? parseInt(rows[0].value, 10) : 10000;
}

/** Run N async tasks with a concurrency limit. */
async function pooled<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Call the tournament pool standings function with simulated outcomes. */
async function callTournamentStandings(
  tournamentId: number,
  simulated: { home: number; away: number; homescore: number; awayscore: number }[]
): Promise<StandingsRow[]> {
  const json = JSON.stringify(simulated);
  const rows = await sql`
    SELECT teamid, team, wins, games, wltpct, runsscored, runsagainst,
           rundifferential, rank_final, lexi_key, details
    FROM public.fn_pool_standings_lexi_noorder(
      ${tournamentId}, false, true, ${json}::jsonb
    )
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    teamid: Number(r.teamid),
    team: r.team as string | null,
    wins: Number(r.wins),
    games: Number(r.games),
    wltpct: Number(r.wltpct),
    runsscored: Number(r.runsscored),
    runsagainst: Number(r.runsagainst),
    rundifferential: Number(r.rundifferential),
    rank_final: Number(r.rank_final),
    lexi_key: Number(r.lexi_key),
    details: r.details as Record<string, unknown> | null,
  }));
}

/** Get remaining (incomplete) pool-play games for a tournament. */
async function getRemainingTournamentGames(tournamentId: number): Promise<RemainingGame[]> {
  const rows = await sql`
    SELECT id, home, away
    FROM tournamentgames
    WHERE tournamentid = ${tournamentId}
      AND poolorbracket = 'Pool'
      AND (gamestatusid IS NULL OR gamestatusid NOT IN (4, 6, 7))
  `;
  return rows as unknown as RemainingGame[];
}

/** Get tournament settings. */
async function getTournamentSettings(tournamentId: number): Promise<{ maxRunDiff: number | null }> {
  const rows = await sql`SELECT maxrundiff FROM tournaments WHERE tournamentid = ${tournamentId}`;
  return { maxRunDiff: rows[0]?.maxrundiff ?? null };
}

/**
 * Core Monte Carlo analysis — shared between season and tournament modes.
 */
async function runMonteCarloAnalysis(
  remainingGames: RemainingGame[],
  teamId: number,
  targetSeed: number,
  seedMode: SeedMode,
  maxRunDiff: number | null,
  callStandingsFn: (simulated: SimulatedOutcome[]) => Promise<StandingsRow[]>,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  let budget = await getMaxSimulations();
  let simulationsRun = 0;

  // --- No remaining games: check current standings ---
  if (remainingGames.length === 0) {
    const standings = await callStandingsFn([]);
    simulationsRun++;
    onProgress?.(simulationsRun);
    const met = meetsSeedTarget(standings, teamId, targetSeed, seedMode);
    return { isPossible: met, probability: met ? 100 : 0, simulationsRun };
  }

  // --- Step 1: Possibility check (range-based heuristic) ---
  // Run best-case (team wins all) to find the minimum achievable rank, and
  // worst-case (team loses all) to find the maximum achievable rank. The target
  // seed is possible iff it falls within [bestCaseMinRank, worstCaseMaxRank].
  // This correctly handles seeds in both directions from the team's current position.
  const POSSIBILITY_ATTEMPTS = Math.min(50, budget);
  const halfAttempts = Math.ceil(POSSIBILITY_ATTEMPTS / 2);

  let bestCaseMinRank = Infinity;   // lowest rank # the team achieves when winning all
  let worstCaseMaxRank = 0;         // highest rank # the team achieves when losing all

  for (let i = 0; i < halfAttempts; i++) {
    const outcomes = generateBestCaseOutcomes(remainingGames, teamId, maxRunDiff);
    const standings = await callStandingsFn(outcomes);
    simulationsRun++;
    const row = standings.find((r) => r.teamid === teamId);
    if (row) bestCaseMinRank = Math.min(bestCaseMinRank, row.rank_final);
  }

  for (let i = 0; i < halfAttempts; i++) {
    const outcomes = generateWorstCaseOutcomes(remainingGames, teamId, maxRunDiff);
    const standings = await callStandingsFn(outcomes);
    simulationsRun++;
    const row = standings.find((r) => r.teamid === teamId);
    if (row) worstCaseMaxRank = Math.max(worstCaseMaxRank, row.rank_final);
  }

  budget -= simulationsRun;
  onProgress?.(simulationsRun);

  // Determine if target seed falls within achievable range
  const isPossible = bestCaseMinRank !== Infinity && worstCaseMaxRank !== 0 && (
    seedMode === "or_better"
      ? bestCaseMinRank <= targetSeed
      : targetSeed >= bestCaseMinRank && targetSeed <= worstCaseMaxRank
  );

  if (!isPossible) {
    return { isPossible: false, probability: null, simulationsRun };
  }

  // --- Step 2: Monte Carlo Layer 1 (win/loss only, 50/50) ---
  const layer1Budget = Math.floor(budget * 0.7);
  let achieves = 0;
  let ambiguousCount = 0;
  let layer1Total = 0;

  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < layer1Budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, layer1Budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateWinLossOutcomes(remainingGames);
      const standings = await callStandingsFn(outcomes);
      const met = meetsSeedTarget(standings, teamId, targetSeed, seedMode);
      const amb = isAmbiguous(standings, teamId, targetSeed, seedMode);
      return { met, amb };
    });

    const results = await pooled(tasks, BATCH_SIZE);
    for (const { met, amb } of results) {
      layer1Total++;
      simulationsRun++;
      if (met) achieves++;
      if (amb) ambiguousCount++;
    }

    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }

    // Early termination: if after 1000+ sims, result is clearly 0% or 100% with no ambiguity
    if (layer1Total >= 1000 && ambiguousCount === 0) {
      const pct = (achieves / layer1Total) * 100;
      if (pct === 0 || pct === 100) {
        onProgress?.(simulationsRun);
        return { isPossible: true, probability: pct, simulationsRun };
      }
    }
  }

  onProgress?.(simulationsRun);

  // --- If no ambiguous cases, we have a firm answer ---
  if (ambiguousCount === 0) {
    const probability = (achieves / layer1Total) * 100;
    return {
      isPossible: true,
      probability: Math.round(probability * 10000) / 10000,
      simulationsRun,
    };
  }

  // --- Step 3: Monte Carlo Layer 2 (with scores, for ambiguous cases) ---
  const layer2Budget = budget - layer1Budget;
  let layer2Achieves = 0;
  let layer2Total = 0;

  for (let offset = 0; offset < layer2Budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, layer2Budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      return meetsSeedTarget(standings, teamId, targetSeed, seedMode);
    });

    const results = await pooled(tasks, BATCH_SIZE);
    for (const met of results) {
      layer2Total++;
      simulationsRun++;
      if (met) layer2Achieves++;
    }

    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }
  }

  onProgress?.(simulationsRun);

  const finalProbability = layer2Total > 0
    ? (layer2Achieves / layer2Total) * 100
    : (achieves / layer1Total) * 100;

  return {
    isPossible: true,
    probability: Math.round(finalProbability * 10000) / 10000,
    simulationsRun,
  };
}

/** Get the playoff bracket size for a season (used for first-round matchup pairing). */
async function getBracketSizeForSeason(seasonId: number): Promise<number> {
  // Prefer the seed_count from the season's first bracket template
  const bracketRows = await sql`
    SELECT COALESCE(bt.seed_count, (sb.structure->>'numTeams')::int) AS size
    FROM season_brackets sb
    LEFT JOIN bracket_templates bt ON bt.id = sb.template_id
    WHERE sb.season_id = ${seasonId}
    ORDER BY sb.sort_order
    LIMIT 1
  `;
  const size = bracketRows[0]?.size ? Number(bracketRows[0].size) : 0;
  if (size > 0) return size;
  // Fallback: total teams in season
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM season_teams WHERE season_id = ${seasonId}`;
  return Number(countRows[0]?.count ?? 0);
}

/** Get the playoff bracket size for a tournament. */
async function getBracketSizeForTournament(tournamentId: number): Promise<number> {
  const bracketRows = await sql`
    SELECT COALESCE(bt.seed_count, (tb.structure->>'numTeams')::int) AS size
    FROM tournament_bracket tb
    LEFT JOIN bracket_templates bt ON bt.id = tb.template_id
    WHERE tb.tournament_id = ${tournamentId}
  `;
  const size = bracketRows[0]?.size ? Number(bracketRows[0].size) : 0;
  if (size > 0) return size;
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM tournamentteams WHERE tournamentid = ${tournamentId}`;
  return Number(countRows[0]?.count ?? 0);
}

/**
 * Check if two teams are paired in round 1 of a standard bracket.
 * Standard pairing: seed k plays seed (bracketSize + 1 - k).
 * Both teams must qualify (seed <= bracketSize).
 */
function meetsFirstRoundMatchup(
  standings: StandingsRow[],
  teamId: number,
  opponentTeamId: number,
  bracketSize: number
): boolean {
  const teamRow = standings.find((r) => r.teamid === teamId);
  const opponentRow = standings.find((r) => r.teamid === opponentTeamId);
  if (!teamRow || !opponentRow) return false;
  const s1 = teamRow.rank_final;
  const s2 = opponentRow.rank_final;
  if (s1 > bracketSize || s2 > bracketSize) return false;
  return s1 + s2 === bracketSize + 1;
}

/**
 * Monte Carlo analysis for "Can team X face team Y in round 1?"
 * Uses scored outcomes (layer 2 only) after a quick possibility check.
 */
async function runMatchupMonteCarlo(
  remainingGames: RemainingGame[],
  teamId: number,
  opponentTeamId: number,
  bracketSize: number,
  maxRunDiff: number | null,
  callStandingsFn: (simulated: SimulatedOutcome[]) => Promise<StandingsRow[]>,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const budget = await getMaxSimulations();
  let simulationsRun = 0;

  if (bracketSize < 2) {
    return { isPossible: false, probability: null, simulationsRun: 0 };
  }

  // --- No remaining games: check current standings ---
  if (remainingGames.length === 0) {
    const standings = await callStandingsFn([]);
    simulationsRun++;
    onProgress?.(simulationsRun);
    const met = meetsFirstRoundMatchup(standings, teamId, opponentTeamId, bracketSize);
    return { isPossible: met, probability: met ? 100 : 0, simulationsRun };
  }

  // --- Possibility check: range-based across 4 win/loss combos ---
  // Run directed simulations to discover each team's achievable rank range, then
  // check if any valid bracket pairing (k, bracketSize+1-k) falls within both
  // ranges. This avoids requiring the exact matchup to appear by chance in ~50
  // samples — which causes false IMPOSSIBLE results for achievable matchups.
  const POSSIBILITY_ATTEMPTS = Math.min(50, budget);
  const DIRECTED_COMBOS: [boolean, boolean][] = [
    [true, false],   // X wins all, Y loses all → X gets best ranks, Y gets worst
    [false, true],   // X loses all, Y wins all → X gets worst ranks, Y gets best
    [true, true],    // both win → explore upper-seed range together
    [false, false],  // both lose → explore lower-seed range together
  ];
  const attemptsPerCombo = Math.max(2, Math.ceil(POSSIBILITY_ATTEMPTS / DIRECTED_COMBOS.length));

  let xMinRank = Infinity, xMaxRank = 0;
  let yMinRank = Infinity, yMaxRank = 0;

  for (const [xWins, yWins] of DIRECTED_COMBOS) {
    for (let i = 0; i < attemptsPerCombo; i++) {
      const outcomes = generateMatchupDirectedOutcomes(
        remainingGames, teamId, xWins, opponentTeamId, yWins, maxRunDiff
      );
      const standings = await callStandingsFn(outcomes);
      simulationsRun++;
      const xRow = standings.find((r) => r.teamid === teamId);
      const yRow = standings.find((r) => r.teamid === opponentTeamId);
      if (xRow) { xMinRank = Math.min(xMinRank, xRow.rank_final); xMaxRank = Math.max(xMaxRank, xRow.rank_final); }
      if (yRow) { yMinRank = Math.min(yMinRank, yRow.rank_final); yMaxRank = Math.max(yMaxRank, yRow.rank_final); }
    }
  }
  onProgress?.(simulationsRun);

  // A matchup is possible if ∃ k such that:
  //   k ∈ [xMinRank, xMaxRank], (bracketSize+1-k) ∈ [yMinRank, yMaxRank], 1 ≤ k ≤ bracketSize
  // Solving for k: max(xMinRank, bracketSize+1-yMaxRank, 1) ≤ min(xMaxRank, bracketSize+1-yMinRank, bracketSize)
  const kLow  = Math.max(xMinRank, bracketSize + 1 - yMaxRank, 1);
  const kHigh = Math.min(xMaxRank, bracketSize + 1 - yMinRank, bracketSize);
  const isPossible = xMinRank !== Infinity && yMinRank !== Infinity && kLow <= kHigh;

  if (!isPossible) {
    return { isPossible: false, probability: null, simulationsRun };
  }

  // --- Full Monte Carlo with scored outcomes ---
  const remainingBudget = budget - simulationsRun;
  let achieves = 0;
  let total = 0;
  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < remainingBudget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, remainingBudget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      return meetsFirstRoundMatchup(standings, teamId, opponentTeamId, bracketSize);
    });
    const results = await pooled(tasks, BATCH_SIZE);
    for (const met of results) {
      total++;
      simulationsRun++;
      if (met) achieves++;
    }
    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }
  }

  onProgress?.(simulationsRun);

  const probability = total > 0 ? (achieves / total) * 100 : 0;
  return {
    isPossible: true,
    probability: Math.round(probability * 10000) / 10000,
    simulationsRun,
  };
}

/**
 * Main entry point: run the full scenario analysis for "Can team X achieve seed #Y?"
 * Season mode — analyzes remaining regular-season games.
 */
export async function runScenarioAnalysis(
  seasonId: number,
  teamId: number,
  targetSeed: number,
  seedMode: SeedMode,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const remainingGames = await getRemainingGames(seasonId);
  const { maxRunDiff } = await getSeasonSettings(seasonId);
  const callFn = (simulated: SimulatedOutcome[]) => callStandings(seasonId, simulated);
  return runMonteCarloAnalysis(remainingGames, teamId, targetSeed, seedMode, maxRunDiff, callFn, onProgress);
}

/**
 * Tournament mode — analyzes remaining pool-play games for bracket seeds.
 */
export async function runTournamentScenarioAnalysis(
  tournamentId: number,
  teamId: number,
  targetSeed: number,
  seedMode: SeedMode,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const remainingGames = await getRemainingTournamentGames(tournamentId);
  const { maxRunDiff } = await getTournamentSettings(tournamentId);
  const callFn = (simulated: SimulatedOutcome[]) => callTournamentStandings(tournamentId, simulated);
  return runMonteCarloAnalysis(remainingGames, teamId, targetSeed, seedMode, maxRunDiff, callFn, onProgress);
}

/**
 * Season mode — "Can team X face team Y in the first round of bracket play?"
 */
export async function runFirstRoundMatchupAnalysis(
  seasonId: number,
  teamId: number,
  opponentTeamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const remainingGames = await getRemainingGames(seasonId);
  const { maxRunDiff } = await getSeasonSettings(seasonId);
  const bracketSize = await getBracketSizeForSeason(seasonId);
  const callFn = (simulated: SimulatedOutcome[]) => callStandings(seasonId, simulated);
  return runMatchupMonteCarlo(remainingGames, teamId, opponentTeamId, bracketSize, maxRunDiff, callFn, onProgress);
}

/**
 * Tournament mode — "Can team X face team Y in the first round of bracket play?"
 */
export async function runTournamentFirstRoundMatchupAnalysis(
  tournamentId: number,
  teamId: number,
  opponentTeamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const remainingGames = await getRemainingTournamentGames(tournamentId);
  const { maxRunDiff } = await getTournamentSettings(tournamentId);
  const bracketSize = await getBracketSizeForTournament(tournamentId);
  const callFn = (simulated: SimulatedOutcome[]) => callTournamentStandings(tournamentId, simulated);
  return runMatchupMonteCarlo(remainingGames, teamId, opponentTeamId, bracketSize, maxRunDiff, callFn, onProgress);
}
