/**
 * Helpers for generating simulated game outcomes.
 */

export type RemainingGame = {
  id: number;
  home: number;
  away: number;
};

export type SimulatedOutcome = {
  home: number;
  away: number;
  homescore: number;
  awayscore: number;
};

/**
 * A single game in the sample winning path, with team names and display category.
 * - "target_game": the tracked team is playing
 * - "key_game": a game where at least one team ended up within ±2 seeds of the
 *   target seed in this specific simulation — direction-agnostic (covers climbing,
 *   holding position, and falling scenarios)
 * - "other": neither; not shown in the UI
 */
export type SampleGameOutcome = {
  gameId: number;
  home: number;
  homeName: string;
  /** Where the home team ended up in this simulated scenario. */
  homeEndedAt: number;
  away: number;
  awayName: string;
  /** Where the away team ended up in this simulated scenario. */
  awayEndedAt: number;
  homescore: number;
  awayscore: number;
  category: "target_game" | "key_game" | "other";
};

export type StandingsRow = {
  teamid: number;
  team: string | null;
  wins: number;
  games: number;
  wltpct: number;
  runsscored: number;
  runsagainst: number;
  rundifferential: number;
  rank_final: number;
  lexi_key: number;
  details: Record<string, unknown> | null;
};

/**
 * Generate win/loss-only outcomes (scores = 1-0) with 50/50 random winners.
 * If `favorTeamId` is provided, that team always wins its games.
 */
export function generateWinLossOutcomes(
  games: RemainingGame[],
  favorTeamId?: number
): SimulatedOutcome[] {
  return games.map((g) => {
    let homeWins: boolean;
    if (favorTeamId !== undefined) {
      if (g.home === favorTeamId) homeWins = true;
      else if (g.away === favorTeamId) homeWins = false;
      else homeWins = Math.random() < 0.5;
    } else {
      homeWins = Math.random() < 0.5;
    }
    return {
      home: g.home,
      away: g.away,
      homescore: homeWins ? 1 : 0,
      awayscore: homeWins ? 0 : 1,
    };
  });
}

/**
 * Generate outcomes with realistic random scores. 50/50 winner selection.
 * Winner gets 1–10 runs, loser gets 0 to (winner-1) runs.
 * Scores are capped at maxRunDiff if set.
 */
export function generateScoredOutcomes(
  games: RemainingGame[],
  maxRunDiff: number | null
): SimulatedOutcome[] {
  return games.map((g) => {
    const homeWins = Math.random() < 0.5;
    const winnerRuns = Math.floor(Math.random() * 10) + 1;
    const loserRuns = Math.floor(Math.random() * winnerRuns); // 0 to winner-1

    let homescore = homeWins ? winnerRuns : loserRuns;
    let awayscore = homeWins ? loserRuns : winnerRuns;

    // Cap run differential if needed (adjust loser's score up)
    if (maxRunDiff !== null && maxRunDiff > 0) {
      const diff = Math.abs(homescore - awayscore);
      if (diff > maxRunDiff) {
        if (homeWins) awayscore = homescore - maxRunDiff;
        else homescore = awayscore - maxRunDiff;
      }
    }

    return { home: g.home, away: g.away, homescore, awayscore };
  });
}

/**
 * Generate directed outcomes for the matchup possibility check.
 * Forces teamXId and teamYId to win or lose all their games (with max run
 * differential), while all other games are randomized. This lets us
 * efficiently explore whether complementary seeds are achievable without
 * relying on pure 50/50 chance.
 *
 * When X and Y play each other, X's outcome takes priority.
 */
export function generateMatchupDirectedOutcomes(
  games: RemainingGame[],
  teamXId: number,
  teamXWins: boolean,
  teamYId: number,
  teamYWins: boolean,
  maxRunDiff: number | null
): SimulatedOutcome[] {
  const maxDiff = maxRunDiff ?? 10;
  return games.map((g) => {
    const xInGame = g.home === teamXId || g.away === teamXId;
    const yInGame = g.home === teamYId || g.away === teamYId;

    if (xInGame) {
      // X's desired outcome takes priority (covers head-to-head games too)
      const homeWins = g.home === teamXId ? teamXWins : !teamXWins;
      return { home: g.home, away: g.away, homescore: homeWins ? maxDiff : 0, awayscore: homeWins ? 0 : maxDiff };
    }
    if (yInGame) {
      const homeWins = g.home === teamYId ? teamYWins : !teamYWins;
      return { home: g.home, away: g.away, homescore: homeWins ? maxDiff : 0, awayscore: homeWins ? 0 : maxDiff };
    }
    // Other games: random
    const homeWins = Math.random() < 0.5;
    return { home: g.home, away: g.away, homescore: homeWins ? 1 : 0, awayscore: homeWins ? 0 : 1 };
  });
}

/**
 * Generate worst-case outcomes for a specific team:
 * - Team always loses with max score differential
 * - Other games are randomized.
 * Used in the possibility check for seeds worse than the team's current position.
 */
export function generateWorstCaseOutcomes(
  games: RemainingGame[],
  teamId: number,
  maxRunDiff: number | null
): SimulatedOutcome[] {
  const maxDiff = maxRunDiff ?? 10;
  return games.map((g) => {
    if (g.home === teamId) {
      return { home: g.home, away: g.away, homescore: 0, awayscore: maxDiff };
    }
    if (g.away === teamId) {
      return { home: g.home, away: g.away, homescore: maxDiff, awayscore: 0 };
    }
    const homeWins = Math.random() < 0.5;
    return {
      home: g.home,
      away: g.away,
      homescore: homeWins ? 1 : 0,
      awayscore: homeWins ? 0 : 1,
    };
  });
}

/**
 * Generate best-case outcomes for a specific team:
 * - Team always wins with max score differential
 * - Other games: opponents of teams competing for the target seed lose
 *   (simplified: just random for non-favored games)
 */
export function generateBestCaseOutcomes(
  games: RemainingGame[],
  teamId: number,
  maxRunDiff: number | null
): SimulatedOutcome[] {
  const maxDiff = maxRunDiff ?? 10;
  return games.map((g) => {
    if (g.home === teamId) {
      return { home: g.home, away: g.away, homescore: maxDiff, awayscore: 0 };
    }
    if (g.away === teamId) {
      return { home: g.home, away: g.away, homescore: 0, awayscore: maxDiff };
    }
    // For other games, random outcome
    const homeWins = Math.random() < 0.5;
    return {
      home: g.home,
      away: g.away,
      homescore: homeWins ? 1 : 0,
      awayscore: homeWins ? 0 : 1,
    };
  });
}

/**
 * Check if a standings result meets the seed target.
 */
export function meetsSeedTarget(
  standings: StandingsRow[],
  teamId: number,
  targetSeed: number,
  seedMode: "exact" | "or_better" | "or_worse"
): boolean {
  const row = standings.find((r) => r.teamid === teamId);
  if (!row) return false;
  if (seedMode === "exact") return row.rank_final === targetSeed;
  if (seedMode === "or_worse") return row.rank_final >= targetSeed;
  return row.rank_final <= targetSeed; // or_better
}

/**
 * Upgrade win/loss-only outcomes (1-0 scores) to realistic random scores while
 * preserving the same winner for each game. Used when the sample scenario was
 * captured from a Layer 1 (win/loss-only) simulation.
 */
export function addScoresToOutcomes(
  outcomes: SimulatedOutcome[],
  maxRunDiff: number
): SimulatedOutcome[] {
  const maxDiff = maxRunDiff > 0 ? maxRunDiff : 10;
  return outcomes.map((o) => {
    if (o.homescore === o.awayscore) return o; // tie — leave as-is
    const homeWon = o.homescore > o.awayscore;
    const winnerRuns = Math.floor(Math.random() * 10) + 1; // 1–10
    const rawLoserRuns = Math.floor(Math.random() * winnerRuns); // 0 to winner-1
    const loserRuns = Math.max(rawLoserRuns, winnerRuns - maxDiff); // respect run diff cap
    return {
      ...o,
      homescore: homeWon ? winnerRuns : loserRuns,
      awayscore: homeWon ? loserRuns : winnerRuns,
    };
  });
}

/**
 * Check if the result is ambiguous — meaning teams near the target seed boundary
 * share the same wltpct, so score-based tiebreakers could change the outcome.
 * Returns true if Layer 2 (scored simulations) is needed.
 */
export function isAmbiguous(
  standings: StandingsRow[],
  teamId: number,
  targetSeed: number,
  seedMode: "exact" | "or_better" | "or_worse"
): boolean {
  const teamRow = standings.find((r) => r.teamid === teamId);
  if (!teamRow) return false;

  // Find teams at the boundary seed(s) — the seeds on either side of the cutoff
  // or_better: boundary is between targetSeed and targetSeed+1
  // or_worse:  boundary is between targetSeed-1 and targetSeed
  // exact:     only targetSeed matters
  const boundarySeeds = seedMode === "exact"
    ? [targetSeed]
    : seedMode === "or_worse"
    ? [targetSeed - 1, targetSeed]
    : [targetSeed, targetSeed + 1];

  const boundaryTeams = standings.filter((r) => boundarySeeds.includes(r.rank_final));

  // Check if team X shares wltpct with any boundary team that isn't itself
  const teamPct = teamRow.wltpct;
  const hasTie = boundaryTeams.some(
    (r) => r.teamid !== teamId && Math.abs(r.wltpct - teamPct) < 0.000001
  );

  // Also check if team's rank could shift: are there ties at the seed boundary?
  const atBoundary = standings.filter(
    (r) => boundarySeeds.includes(r.rank_final) || r.rank_final === teamRow.rank_final
  );
  const pcts = new Set(atBoundary.map((r) => r.wltpct.toFixed(6)));

  return hasTie || pcts.size < atBoundary.length;
}
