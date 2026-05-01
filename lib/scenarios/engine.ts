/**
 * Scenario analysis engine.
 * Two-layer approach:
 *   1. Possibility check (best-case heuristic)
 *   2. Monte Carlo simulation (Layer 1: win/loss only → Layer 2: with scores if ambiguous)
 *
 * `max_simulations` is a total budget across all layers — each call to the standings
 * function counts as 1 simulation.
 *
 * Standings are now computed in-memory via the TypeScript ranker — no DB round-trip
 * per simulation. Data is fetched once upfront before the Monte Carlo loop.
 */

import { sql } from "@/lib/db";
import {
  fetchSeasonStandingsData,
  fetchTournamentStandingsData,
  computeStandings,
} from "@/lib/standings";
import type { GameRecord, StandingsRow } from "@/lib/standings";
import {
  type RemainingGame,
  type SimulatedOutcome,
  type SampleGameOutcome,
  generateWinLossOutcomes,
  generateScoredOutcomes,
  generateBestCaseOutcomes,
  generateWorstCaseOutcomes,
  generateMatchupDirectedOutcomes,
  addScoresToOutcomes,
  meetsSeedTarget,
  isAmbiguous,
} from "./simulate";

type SeedMode = "exact" | "or_better" | "or_worse";

/** A contiguous seed range covered by one bracket (e.g. Gold = seeds 1-8). */
type BracketSlice = {
  startSeed: number; // first seed (inclusive)
  size: number;      // number of teams in this bracket
};

type ProgressCallback = (simRun: number) => void;

export type MatchupEntry = {
  teamId: number;
  teamName: string;
  probability: number;
};

export type EngineResult = {
  isPossible: boolean;
  probability: number | null; // 0-100, null if impossible
  simulationsRun: number;
  sampleWinningScenario: SampleGameOutcome[] | null;
  /** Populated only for most_likely_seed scenarios. */
  seedDistribution: { seed: number; probability: number }[] | null;
  mostLikelySeed: number | null;
  /** Populated only for most_likely_matchup scenarios. */
  matchupDistribution?: MatchupEntry[] | null;
  mostLikelyOpponentId?: number | null;
};

/** Convert a SimulatedOutcome to a GameRecord for the TypeScript ranker. */
function toGameRecord(outcome: SimulatedOutcome): GameRecord {
  return {
    gameid: -1,
    home: outcome.home,
    away: outcome.away,
    homescore: outcome.homescore,
    awayscore: outcome.awayscore,
    winnerSide: null,
  };
}

/** Get remaining (incomplete) regular-season games. */
async function getRemainingGames(seasonId: number): Promise<RemainingGame[]> {
  const rows = await sql`
    SELECT id, home, away
    FROM season_games
    WHERE season_id = ${seasonId}
      AND game_type = 'regular'
      AND (gamestatusid IS NULL OR gamestatusid = 1)
  `;
  return rows as unknown as RemainingGame[];
}

/** Get remaining (incomplete) pool-play games for a tournament. */
async function getRemainingTournamentGames(tournamentId: number): Promise<RemainingGame[]> {
  const rows = await sql`
    SELECT id, home, away
    FROM tournamentgames
    WHERE tournamentid = ${tournamentId}
      AND poolorbracket = 'Pool'
      AND (gamestatusid IS NULL OR gamestatusid = 1)
  `;
  return rows as unknown as RemainingGame[];
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

/** Get all playoff bracket slices for a season, ordered by sort_order. */
async function getBracketSlicesForSeason(seasonId: number): Promise<BracketSlice[]> {
  const bracketRows = await sql`
    SELECT COALESCE(bt.seed_count, (sb.structure->>'numTeams')::int) AS size
    FROM season_brackets sb
    LEFT JOIN bracket_templates bt ON bt.id = sb.template_id
    WHERE sb.season_id = ${seasonId}
    ORDER BY sb.sort_order
  `;

  if (bracketRows.length === 0) {
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM season_teams WHERE season_id = ${seasonId}`;
    const total = Number(countRows[0]?.count ?? 0);
    return total > 0 ? [{ startSeed: 1, size: total }] : [];
  }

  const slices: BracketSlice[] = [];
  let nextStart = 1;
  for (const row of bracketRows) {
    const size = Number(row.size);
    if (size > 0) {
      slices.push({ startSeed: nextStart, size });
      nextStart += size;
    }
  }
  return slices;
}

/** Get all playoff bracket slices for a tournament. */
async function getBracketSlicesForTournament(tournamentId: number): Promise<BracketSlice[]> {
  const bracketRows = await sql`
    SELECT COALESCE(bt.seed_count, (tb.structure->>'numTeams')::int) AS size
    FROM tournament_bracket tb
    LEFT JOIN bracket_templates bt ON bt.id = tb.template_id
    WHERE tb.tournament_id = ${tournamentId}
  `;

  if (bracketRows.length === 0) {
    const countRows = await sql`SELECT COUNT(*)::int AS count FROM tournamentteams WHERE tournamentid = ${tournamentId}`;
    const total = Number(countRows[0]?.count ?? 0);
    return total > 0 ? [{ startSeed: 1, size: total }] : [];
  }

  const slices: BracketSlice[] = [];
  let nextStart = 1;
  for (const row of bracketRows) {
    const size = Number(row.size);
    if (size > 0) {
      slices.push({ startSeed: nextStart, size });
      nextStart += size;
    }
  }
  return slices;
}

/**
 * Check if two teams are paired in round 1 of ANY bracket.
 * Within a bracket covering seeds [start, start+size-1], seeds pair when
 * their sum equals start + (start + size - 1) = 2*start + size - 1.
 */
function meetsFirstRoundMatchup(
  standings: StandingsRow[],
  teamId: number,
  opponentTeamId: number,
  bracketSlices: BracketSlice[]
): boolean {
  const teamRow = standings.find((r) => r.teamid === teamId);
  const opponentRow = standings.find((r) => r.teamid === opponentTeamId);
  if (!teamRow || !opponentRow) return false;
  const s1 = teamRow.rank_final;
  const s2 = opponentRow.rank_final;

  for (const slice of bracketSlices) {
    const endSeed = slice.startSeed + slice.size - 1;
    if (s1 >= slice.startSeed && s1 <= endSeed &&
        s2 >= slice.startSeed && s2 <= endSeed) {
      return s1 + s2 === slice.startSeed + endSeed;
    }
  }
  return false;
}

/**
 * Build a sample path for "can two teams meet in round 1?" scenarios.
 * Both teams' games are "target_game". Key games are those where either
 * participant ended within ±2 seeds of either team's final seed.
 */
function buildMatchupSampleScenario(
  outcomes: SimulatedOutcome[],
  remainingGames: RemainingGame[],
  teamId: number,
  opponentTeamId: number,
  finalStandings: StandingsRow[],
  teamNames: Map<number, string>
): SampleGameOutcome[] {
  const finalRankByTeamId = new Map(finalStandings.map((r) => [r.teamid, r.rank_final]));
  const teamSeed = finalRankByTeamId.get(teamId) ?? 0;
  const opponentSeed = finalRankByTeamId.get(opponentTeamId) ?? 0;
  const SEED_WINDOW = 2;

  return outcomes.map((o, i) => {
    const gameId = remainingGames[i].id;
    const homeEndedAt = finalRankByTeamId.get(o.home) ?? 0;
    const awayEndedAt = finalRankByTeamId.get(o.away) ?? 0;

    if (o.home === teamId || o.away === teamId ||
        o.home === opponentTeamId || o.away === opponentTeamId) {
      return {
        gameId,
        home: o.home, homeName: teamNames.get(o.home) ?? `Team ${o.home}`, homeEndedAt,
        away: o.away, awayName: teamNames.get(o.away) ?? `Team ${o.away}`, awayEndedAt,
        homescore: o.homescore, awayscore: o.awayscore,
        category: "target_game",
      };
    }
    const nearBoundary =
      Math.abs(homeEndedAt - teamSeed) <= SEED_WINDOW ||
      Math.abs(awayEndedAt - teamSeed) <= SEED_WINDOW ||
      Math.abs(homeEndedAt - opponentSeed) <= SEED_WINDOW ||
      Math.abs(awayEndedAt - opponentSeed) <= SEED_WINDOW;
    return {
      gameId,
      home: o.home, homeName: teamNames.get(o.home) ?? `Team ${o.home}`, homeEndedAt,
      away: o.away, awayName: teamNames.get(o.away) ?? `Team ${o.away}`, awayEndedAt,
      homescore: o.homescore, awayscore: o.awayscore,
      category: nearBoundary ? "key_game" : "other",
    };
  });
}

/**
 * Build a sample winning scenario from a set of simulated outcomes.
 *
 * Classification is based on where teams ended up in the final standings of
 * THIS simulation, centered on the target seed — not the teams' current ranks.
 * This makes it direction-agnostic: works for climbing, holding, and falling.
 *
 * A game is "key_game" if either participant ended within ±2 seeds of targetSeed.
 */
function buildSampleScenario(
  outcomes: SimulatedOutcome[],
  remainingGames: RemainingGame[],
  teamId: number,
  targetSeed: number,
  finalStandings: StandingsRow[],
  teamNames: Map<number, string>
): SampleGameOutcome[] {
  const finalRankByTeamId = new Map(finalStandings.map((r) => [r.teamid, r.rank_final]));
  const SEED_WINDOW = 2;

  return outcomes.map((o, i) => {
    const gameId = remainingGames[i].id;
    const homeEndedAt = finalRankByTeamId.get(o.home) ?? 0;
    const awayEndedAt = finalRankByTeamId.get(o.away) ?? 0;

    if (o.home === teamId || o.away === teamId) {
      return {
        gameId,
        home: o.home, homeName: teamNames.get(o.home) ?? `Team ${o.home}`, homeEndedAt,
        away: o.away, awayName: teamNames.get(o.away) ?? `Team ${o.away}`, awayEndedAt,
        homescore: o.homescore, awayscore: o.awayscore,
        category: "target_game",
      };
    }
    const nearBoundary =
      Math.abs(homeEndedAt - targetSeed) <= SEED_WINDOW ||
      Math.abs(awayEndedAt - targetSeed) <= SEED_WINDOW;
    return {
      gameId,
      home: o.home, homeName: teamNames.get(o.home) ?? `Team ${o.home}`, homeEndedAt,
      away: o.away, awayName: teamNames.get(o.away) ?? `Team ${o.away}`, awayEndedAt,
      homescore: o.homescore, awayscore: o.awayscore,
      category: nearBoundary ? "key_game" : "other",
    };
  });
}

/**
 * Core Monte Carlo analysis — shared between season and tournament modes.
 * callStandingsFn is now synchronous under the hood (returns Promise.resolve).
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

  // Compute current standings once to get team names (not counted as a sim).
  const currentStandings = await callStandingsFn([]);
  const teamNames = new Map(currentStandings.map((r) => [r.teamid, r.team ?? `Team ${r.teamid}`]));

  if (remainingGames.length === 0) {
    simulationsRun++;
    onProgress?.(simulationsRun);
    const met = meetsSeedTarget(currentStandings, teamId, targetSeed, seedMode);
    return { isPossible: met, probability: met ? 100 : 0, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null };
  }

  const POSSIBILITY_ATTEMPTS = Math.min(50, budget);
  const halfAttempts = Math.ceil(POSSIBILITY_ATTEMPTS / 2);

  let bestCaseMinRank = Infinity;
  let worstCaseMaxRank = 0;

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

  const isPossible = bestCaseMinRank !== Infinity && worstCaseMaxRank !== 0 && (
    seedMode === "or_better"
      ? bestCaseMinRank <= targetSeed      // can reach targetSeed or above (better)
      : seedMode === "or_worse"
      ? worstCaseMaxRank >= targetSeed     // can reach targetSeed or below (worse)
      : targetSeed >= bestCaseMinRank && targetSeed <= worstCaseMaxRank // exact: target in range
  );

  if (!isPossible) {
    return { isPossible: false, probability: null, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null };
  }

  const layer1Budget = Math.floor(budget * 0.7);
  let achieves = 0;
  let ambiguousCount = 0;
  let layer1Total = 0;
  let capturedSample: SampleGameOutcome[] | null = null;

  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < layer1Budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, layer1Budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateWinLossOutcomes(remainingGames);
      const standings = await callStandingsFn(outcomes);
      const met = meetsSeedTarget(standings, teamId, targetSeed, seedMode);
      const amb = isAmbiguous(standings, teamId, targetSeed, seedMode);
      return { met, amb, outcomes, standings };
    });

    const results = await pooled(tasks, BATCH_SIZE);
    for (const { met, amb, outcomes, standings } of results) {
      layer1Total++;
      simulationsRun++;
      if (met) {
        achieves++;
        if (capturedSample === null) {
          const scored = addScoresToOutcomes(outcomes, maxRunDiff ?? 10);
          capturedSample = buildSampleScenario(
            scored, remainingGames, teamId, targetSeed, standings, teamNames
          );
        }
      }
      if (amb) ambiguousCount++;
    }

    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }

    if (layer1Total >= 1000 && ambiguousCount === 0) {
      const pct = (achieves / layer1Total) * 100;
      if (pct === 0 || pct === 100) {
        onProgress?.(simulationsRun);
        return { isPossible: true, probability: pct, simulationsRun, sampleWinningScenario: capturedSample, seedDistribution: null, mostLikelySeed: null };
      }
    }
  }

  onProgress?.(simulationsRun);

  if (ambiguousCount === 0) {
    const probability = (achieves / layer1Total) * 100;
    return {
      isPossible: true,
      probability: Math.round(probability * 10000) / 10000,
      simulationsRun,
      sampleWinningScenario: capturedSample,
      seedDistribution: null,
      mostLikelySeed: null,
    };
  }

  const layer2Budget = budget - layer1Budget;
  let layer2Achieves = 0;
  let layer2Total = 0;

  for (let offset = 0; offset < layer2Budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, layer2Budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      const met = meetsSeedTarget(standings, teamId, targetSeed, seedMode);
      return { met, outcomes, standings };
    });

    const results = await pooled(tasks, BATCH_SIZE);
    for (const { met, outcomes, standings } of results) {
      layer2Total++;
      simulationsRun++;
      if (met) {
        layer2Achieves++;
        if (capturedSample === null) {
          capturedSample = buildSampleScenario(
            outcomes, remainingGames, teamId, targetSeed, standings, teamNames
          );
        }
      }
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
    sampleWinningScenario: capturedSample,
    seedDistribution: null,
    mostLikelySeed: null,
  };
}

/**
 * Monte Carlo analysis for "Can team X face team Y in round 1?"
 */
async function runMatchupMonteCarlo(
  remainingGames: RemainingGame[],
  teamId: number,
  opponentTeamId: number,
  bracketSlices: BracketSlice[],
  maxRunDiff: number | null,
  callStandingsFn: (simulated: SimulatedOutcome[]) => Promise<StandingsRow[]>,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const budget = await getMaxSimulations();
  let simulationsRun = 0;

  if (bracketSlices.length === 0 || bracketSlices.every((s) => s.size < 2)) {
    return { isPossible: false, probability: null, simulationsRun: 0, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null };
  }

  // Compute team names once upfront (not counted as a sim).
  const currentStandings = await callStandingsFn([]);
  const teamNames = new Map(currentStandings.map((r) => [r.teamid, r.team ?? `Team ${r.teamid}`]));

  if (remainingGames.length === 0) {
    simulationsRun++;
    onProgress?.(simulationsRun);
    const met = meetsFirstRoundMatchup(currentStandings, teamId, opponentTeamId, bracketSlices);
    const sample = met
      ? buildMatchupSampleScenario([], remainingGames, teamId, opponentTeamId, currentStandings, teamNames)
      : null;
    return { isPossible: met, probability: met ? 100 : 0, simulationsRun, sampleWinningScenario: sample, seedDistribution: null, mostLikelySeed: null };
  }

  const POSSIBILITY_ATTEMPTS = Math.min(50, budget);
  const DIRECTED_COMBOS: [boolean, boolean][] = [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
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

  // Check if a first-round pairing is possible in ANY bracket slice.
  let isPossible = false;
  if (xMinRank !== Infinity && yMinRank !== Infinity) {
    for (const slice of bracketSlices) {
      const endSeed = slice.startSeed + slice.size - 1;
      const magicSum = slice.startSeed + endSeed; // paired seeds sum to this

      // Range of seeds x could land at within this bracket
      const xLo = Math.max(xMinRank, slice.startSeed);
      const xHi = Math.min(xMaxRank, endSeed);
      if (xLo > xHi) continue;

      // y must equal magicSum - x, so y ranges from magicSum - xHi to magicSum - xLo
      // and y must also be in [startSeed, endSeed] ∩ [yMinRank, yMaxRank]
      const yLo = Math.max(yMinRank, slice.startSeed, magicSum - xHi);
      const yHi = Math.min(yMaxRank, endSeed, magicSum - xLo);
      if (yLo <= yHi) {
        isPossible = true;
        break;
      }
    }
  }

  if (!isPossible) {
    return { isPossible: false, probability: null, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null };
  }

  const remainingBudget = budget - simulationsRun;
  let achieves = 0;
  let total = 0;
  let capturedSample: SampleGameOutcome[] | null = null;
  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < remainingBudget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, remainingBudget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      const met = meetsFirstRoundMatchup(standings, teamId, opponentTeamId, bracketSlices);
      return { met, outcomes, standings };
    });
    const results = await pooled(tasks, BATCH_SIZE);
    for (const { met, outcomes, standings } of results) {
      total++;
      simulationsRun++;
      if (met) {
        achieves++;
        if (capturedSample === null) {
          capturedSample = buildMatchupSampleScenario(
            outcomes, remainingGames, teamId, opponentTeamId, standings, teamNames
          );
        }
      }
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
    sampleWinningScenario: capturedSample,
    seedDistribution: null,
    mostLikelySeed: null,
  };
}

/**
 * Monte Carlo analysis for "What seed will this team most likely finish?"
 * Runs scored simulations across the full budget and tallies the distribution
 * of final seeds. Returns distribution sorted by seed, mode as mostLikelySeed,
 * and mode's probability as the top-level probability field.
 */
async function runMostLikelySeedMonteCarlo(
  remainingGames: RemainingGame[],
  teamId: number,
  maxRunDiff: number | null,
  callStandingsFn: (simulated: SimulatedOutcome[]) => Promise<StandingsRow[]>,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const budget = await getMaxSimulations();
  let simulationsRun = 0;
  const seedCounts = new Map<number, number>();

  if (remainingGames.length === 0) {
    const standings = await callStandingsFn([]);
    simulationsRun++;
    onProgress?.(simulationsRun);
    const row = standings.find((r) => r.teamid === teamId);
    const seed = row?.rank_final ?? null;
    if (seed !== null) seedCounts.set(seed, 1);
    const distribution = seed !== null ? [{ seed, probability: 100 }] : [];
    return {
      isPossible: true,
      probability: 100,
      simulationsRun,
      sampleWinningScenario: null,
      seedDistribution: distribution,
      mostLikelySeed: seed,
    };
  }

  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      const row = standings.find((r) => r.teamid === teamId);
      return row?.rank_final ?? null;
    });

    const ranks = await pooled(tasks, BATCH_SIZE);
    for (const rank of ranks) {
      simulationsRun++;
      if (rank !== null) seedCounts.set(rank, (seedCounts.get(rank) ?? 0) + 1);
    }

    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }
  }

  onProgress?.(simulationsRun);

  if (seedCounts.size === 0) {
    return {
      isPossible: false,
      probability: null,
      simulationsRun,
      sampleWinningScenario: null,
      seedDistribution: null,
      mostLikelySeed: null,
    };
  }

  const total = simulationsRun;
  const distribution = Array.from(seedCounts.entries())
    .map(([seed, count]) => ({ seed, probability: Math.round((count / total) * 10000) / 100 }))
    .sort((a, b) => a.seed - b.seed);

  let mostLikelySeed = distribution[0].seed;
  let maxProbability = distribution[0].probability;
  for (const entry of distribution) {
    if (entry.probability > maxProbability) {
      maxProbability = entry.probability;
      mostLikelySeed = entry.seed;
    }
  }

  return {
    isPossible: true,
    probability: maxProbability,
    simulationsRun,
    sampleWinningScenario: null,
    seedDistribution: distribution,
    mostLikelySeed,
  };
}

/**
 * Given standings and bracket slices, find the first-round opponent for a team.
 * Returns the opponent's teamid, or null if the team isn't in any bracket.
 */
function findFirstRoundOpponent(
  standings: StandingsRow[],
  teamId: number,
  bracketSlices: BracketSlice[]
): number | null {
  const teamRow = standings.find((r) => r.teamid === teamId);
  if (!teamRow) return null;
  const seed = teamRow.rank_final;

  for (const slice of bracketSlices) {
    const endSeed = slice.startSeed + slice.size - 1;
    if (seed >= slice.startSeed && seed <= endSeed) {
      const opponentSeed = slice.startSeed + endSeed - seed;
      if (opponentSeed === seed) return null; // odd-sized bracket, team has a bye
      const opponentRow = standings.find((r) => r.rank_final === opponentSeed);
      return opponentRow?.teamid ?? null;
    }
  }
  return null;
}

/**
 * Monte Carlo analysis for "Who will this team most likely face in round 1?"
 * Runs scored simulations and tallies first-round opponents across all brackets.
 */
async function runMostLikelyMatchupMonteCarlo(
  remainingGames: RemainingGame[],
  teamId: number,
  bracketSlices: BracketSlice[],
  maxRunDiff: number | null,
  callStandingsFn: (simulated: SimulatedOutcome[]) => Promise<StandingsRow[]>,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const budget = await getMaxSimulations();
  let simulationsRun = 0;
  const matchupCounts = new Map<number, number>();

  if (bracketSlices.length === 0 || bracketSlices.every((s) => s.size < 2)) {
    return { isPossible: false, probability: null, simulationsRun: 0, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null, matchupDistribution: null, mostLikelyOpponentId: null };
  }

  const currentStandings = await callStandingsFn([]);
  const teamNames = new Map(currentStandings.map((r) => [r.teamid, r.team ?? `Team ${r.teamid}`]));

  if (remainingGames.length === 0) {
    simulationsRun++;
    onProgress?.(simulationsRun);
    const opponent = findFirstRoundOpponent(currentStandings, teamId, bracketSlices);
    if (opponent !== null) {
      const dist: MatchupEntry[] = [{ teamId: opponent, teamName: teamNames.get(opponent) ?? `Team ${opponent}`, probability: 100 }];
      return { isPossible: true, probability: 100, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null, matchupDistribution: dist, mostLikelyOpponentId: opponent };
    }
    return { isPossible: false, probability: null, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null, matchupDistribution: null, mostLikelyOpponentId: null };
  }

  const BATCH_SIZE = 20;
  const PROGRESS_INTERVAL = 500;

  for (let offset = 0; offset < budget; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, budget - offset);
    const tasks = Array.from({ length: batchCount }, () => async () => {
      const outcomes = generateScoredOutcomes(remainingGames, maxRunDiff);
      const standings = await callStandingsFn(outcomes);
      return findFirstRoundOpponent(standings, teamId, bracketSlices);
    });

    const opponents = await pooled(tasks, BATCH_SIZE);
    for (const opp of opponents) {
      simulationsRun++;
      if (opp !== null) matchupCounts.set(opp, (matchupCounts.get(opp) ?? 0) + 1);
    }

    if (simulationsRun % PROGRESS_INTERVAL < BATCH_SIZE) {
      onProgress?.(simulationsRun);
    }
  }

  onProgress?.(simulationsRun);

  if (matchupCounts.size === 0) {
    return { isPossible: false, probability: null, simulationsRun, sampleWinningScenario: null, seedDistribution: null, mostLikelySeed: null, matchupDistribution: null, mostLikelyOpponentId: null };
  }

  const total = simulationsRun;
  const distribution: MatchupEntry[] = Array.from(matchupCounts.entries())
    .map(([tid, count]) => ({
      teamId: tid,
      teamName: teamNames.get(tid) ?? `Team ${tid}`,
      probability: Math.round((count / total) * 10000) / 100,
    }))
    .sort((a, b) => b.probability - a.probability);

  const top = distribution[0];

  return {
    isPossible: true,
    probability: top.probability,
    simulationsRun,
    sampleWinningScenario: null,
    seedDistribution: null,
    mostLikelySeed: null,
    matchupDistribution: distribution,
    mostLikelyOpponentId: top.teamId,
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function runScenarioAnalysis(
  seasonId: number,
  teamId: number,
  targetSeed: number,
  seedMode: SeedMode,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData] = await Promise.all([
    getRemainingGames(seasonId),
    fetchSeasonStandingsData(seasonId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMonteCarloAnalysis(remainingGames, teamId, targetSeed, seedMode, maxRunDiff, callFn, onProgress);
}

export async function runTournamentScenarioAnalysis(
  tournamentId: number,
  teamId: number,
  targetSeed: number,
  seedMode: SeedMode,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData] = await Promise.all([
    getRemainingTournamentGames(tournamentId),
    fetchTournamentStandingsData(tournamentId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMonteCarloAnalysis(remainingGames, teamId, targetSeed, seedMode, maxRunDiff, callFn, onProgress);
}

export async function runFirstRoundMatchupAnalysis(
  seasonId: number,
  teamId: number,
  opponentTeamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData, bracketSlices] = await Promise.all([
    getRemainingGames(seasonId),
    fetchSeasonStandingsData(seasonId),
    getBracketSlicesForSeason(seasonId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMatchupMonteCarlo(remainingGames, teamId, opponentTeamId, bracketSlices, maxRunDiff, callFn, onProgress);
}

export async function runTournamentFirstRoundMatchupAnalysis(
  tournamentId: number,
  teamId: number,
  opponentTeamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData, bracketSlices] = await Promise.all([
    getRemainingTournamentGames(tournamentId),
    fetchTournamentStandingsData(tournamentId),
    getBracketSlicesForTournament(tournamentId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMatchupMonteCarlo(remainingGames, teamId, opponentTeamId, bracketSlices, maxRunDiff, callFn, onProgress);
}

export async function runMostLikelySeedAnalysis(
  seasonId: number,
  teamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData] = await Promise.all([
    getRemainingGames(seasonId),
    fetchSeasonStandingsData(seasonId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMostLikelySeedMonteCarlo(remainingGames, teamId, maxRunDiff, callFn, onProgress);
}

export async function runTournamentMostLikelySeedAnalysis(
  tournamentId: number,
  teamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData] = await Promise.all([
    getRemainingTournamentGames(tournamentId),
    fetchTournamentStandingsData(tournamentId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMostLikelySeedMonteCarlo(remainingGames, teamId, maxRunDiff, callFn, onProgress);
}

export async function runMostLikelyMatchupAnalysis(
  seasonId: number,
  teamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData, bracketSlices] = await Promise.all([
    getRemainingGames(seasonId),
    fetchSeasonStandingsData(seasonId),
    getBracketSlicesForSeason(seasonId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMostLikelyMatchupMonteCarlo(remainingGames, teamId, bracketSlices, maxRunDiff, callFn, onProgress);
}

export async function runTournamentMostLikelyMatchupAnalysis(
  tournamentId: number,
  teamId: number,
  onProgress?: ProgressCallback
): Promise<EngineResult> {
  const [remainingGames, standingsData, bracketSlices] = await Promise.all([
    getRemainingTournamentGames(tournamentId),
    fetchTournamentStandingsData(tournamentId),
    getBracketSlicesForTournament(tournamentId),
  ]);
  const maxRunDiff = standingsData.config.maxrundiff;

  const callFn = (simulated: SimulatedOutcome[]): Promise<StandingsRow[]> =>
    Promise.resolve(
      computeStandings(
        [...standingsData.games, ...simulated.map(toGameRecord)],
        standingsData.teams,
        standingsData.tiebreakers,
        standingsData.config
      )
    );

  return runMostLikelyMatchupMonteCarlo(remainingGames, teamId, bracketSlices, maxRunDiff, callFn, onProgress);
}
