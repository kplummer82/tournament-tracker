import type { GameRecord, SeasonConfig, TeamStats } from "./types";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate a single tiebreaker for one team within a tied group.
 *
 * @param code          - tiebreaker code string (matches tiebreakers.tiebreaker in DB)
 * @param teamId        - the team being evaluated
 * @param memberIds     - all teamIds in the current tied group (including teamId)
 * @param allGames      - every completed regular-season / pool game (not pre-filtered)
 * @param allStats      - pre-computed base stats for every team in the season/tournament
 * @param config        - season/tournament config (maxrundiff, forfeit_run_diff)
 * @returns             - numeric value for ranking, or null to indicate "skip"
 */
export function evaluateTiebreaker(
  code: string,
  teamId: number,
  memberIds: number[],
  allGames: GameRecord[],
  allStats: Map<number, TeamStats>,
  config: SeasonConfig
): number | null {
  const stats = allStats.get(teamId);

  // --- Simple stats-based tiebreakers (read directly from allStats) ----------
  switch (code) {
    case "wltpct":
      return stats?.wltpct ?? 0;
    case "rundifferential":
    case "adjusted_run_differential":
      return stats?.rundifferential ?? 0;
    case "runsscored":
    case "adjusted_runs_scored":
      return stats?.runsscored ?? 0;
    case "runsagainst":
    case "adjusted_runs_against":
      return stats?.runsagainst ?? 0;
    case "average_run_differential":
      return stats?.average_run_differential ?? 0;
    case "average_runs_scored":
      return stats?.average_runs_scored ?? 0;
    case "average_runs_against":
      return stats?.average_runs_against ?? 0;
  }

  // --- H2H tiebreakers (need within-group game filtering) --------------------
  const h2hGames = allGames.filter(
    (g) => memberIds.includes(g.home) && memberIds.includes(g.away)
  );

  switch (code) {
    case "head_to_head":
      return headToHead(teamId, memberIds, h2hGames, false);
    case "head_to_group":
      return headToHead(teamId, memberIds, h2hGames, true);
    case "head_to_head_rundiff":
      return headToHeadRunDiff(teamId, memberIds, h2hGames, config, false);
    case "head_to_group_rundiff":
      return headToHeadRunDiff(teamId, memberIds, h2hGames, config, true);
    case "head_to_head_runs_against":
      return headToHeadRunsAgainst(teamId, memberIds, h2hGames, config, false);
    case "head_to_group_runs_against":
      return headToHeadRunsAgainst(teamId, memberIds, h2hGames, config, true);
  }

  // --- Complex tiebreakers (need all games + allStats) -----------------------
  switch (code) {
    case "common_opponents":
      return commonOpponents(teamId, memberIds, allGames);
    case "strength_of_schedule":
      return strengthOfSchedule(teamId, allGames, allStats);
    case "fewest_forfeits":
      return fewestForfeits(teamId, allGames);
    case "coin_toss":
      return coinToss(teamId);
  }

  // Unknown tiebreaker — treat as 0 (no effect)
  return 0;
}

// ---------------------------------------------------------------------------
// H2H helpers
// ---------------------------------------------------------------------------

/** Win points from one game for a given side ('home' | 'away'). */
function winPts(game: GameRecord, side: "home" | "away"): number {
  if (game.winnerSide === side) return 1;
  if (game.winnerSide !== null) return 0; // other side forfeited, this side wins → handled above OR this side forfeited
  // Actually: if winnerSide = 'home', home wins; if winnerSide = 'away', away wins
  // The above cases handle forfeits.  Normal game:
  const score = side === "home" ? (game.homescore ?? 0) : (game.awayscore ?? 0);
  const oppScore = side === "home" ? (game.awayscore ?? 0) : (game.homescore ?? 0);
  if (score > oppScore) return 1;
  if (score < oppScore) return 0;
  return 0.5;
}

/**
 * Head-to-Head win percentage (with or without dominant-team fallback).
 *
 * strictGroupOnly = true  → head_to_group: all pairs must have played; else null
 * strictGroupOnly = false → head_to_head:  dominant-team fallback for incomplete round-robins
 *
 * Case A: All N*(N-1)/2 pairs played → return H2H win%
 * Case B (head_to_head only): Exactly 1 dominant team → return 1.0 for dominant, 0.0 for others
 * Case C: → return null (skip tiebreaker)
 */
function headToHead(
  teamId: number,
  memberIds: number[],
  h2hGames: GameRecord[],
  strictGroupOnly: boolean
): number | null {
  const n = memberIds.length;
  if (n < 2) return null;

  // Build pairTotals: Map of `${team}_${opp}` → total win points
  const pairTotals = new Map<string, number>();
  for (const g of h2hGames) {
    const hKey = `${g.home}_${g.away}`;
    const aKey = `${g.away}_${g.home}`;
    pairTotals.set(hKey, (pairTotals.get(hKey) ?? 0) + winPts(g, "home"));
    pairTotals.set(aKey, (pairTotals.get(aKey) ?? 0) + winPts(g, "away"));
  }

  // Check if all N*(N-1)/2 unordered pairs have played
  const playedPairs = new Set<string>();
  for (const g of h2hGames) {
    const key = `${Math.min(g.home, g.away)}_${Math.max(g.home, g.away)}`;
    playedPairs.add(key);
  }
  const requiredPairs = (n * (n - 1)) / 2;
  const allPairsPlayed = playedPairs.size >= requiredPairs;

  if (allPairsPlayed) {
    // Case A: use H2H win%
    let totalWinPts = 0;
    let gameCount = 0;
    for (const opp of memberIds) {
      if (opp === teamId) continue;
      const key = `${teamId}_${opp}`;
      if (pairTotals.has(key)) {
        // pairTotals entry = total win points across all games vs this opp
        // We want average win pt per game vs this opp
        // But pairTotals is win pts per ordered pair summed — each game contributes once per side
        // Actually game_pts in SQL was per-game, so pairTotals = sum of win pts vs opp
        // For win%, we want total win pts / total games played vs all opponents
        totalWinPts += pairTotals.get(key)!;
        // Count games vs this opp
        const gamesVsOpp = h2hGames.filter(
          (g) =>
            (g.home === teamId && g.away === opp) ||
            (g.away === teamId && g.home === opp)
        ).length;
        gameCount += gamesVsOpp;
      }
    }
    if (gameCount === 0) return null;
    return totalWinPts / gameCount;
  }

  if (strictGroupOnly) {
    // head_to_group: no dominant-team fallback
    return null;
  }

  // Case B: dominant-team algorithm (head_to_head only)
  // Build directed beats graph: X beats Y if X's total pts vs Y > Y's total pts vs X
  const beats = new Map<number, Set<number>>();
  for (const a of memberIds) beats.set(a, new Set());

  for (const a of memberIds) {
    for (const b of memberIds) {
      if (a === b) continue;
      const aVsB = pairTotals.get(`${a}_${b}`) ?? null;
      const bVsA = pairTotals.get(`${b}_${a}`) ?? null;
      if (aVsB !== null && bVsA !== null && aVsB > bVsA) {
        beats.get(a)!.add(b);
      }
    }
  }

  // Transitive reachability up to depth 4
  const reachable = computeTransitiveReach(beats, memberIds, 4);

  const dominantTeams = memberIds.filter(
    (id) => (reachable.get(id)?.size ?? 0) === n - 1
  );

  if (dominantTeams.length === 1) {
    return dominantTeams[0] === teamId ? 1.0 : 0.0;
  }

  // Case C: unresolvable
  return null;
}

/** BFS transitive reachability up to maxDepth hops in the beats graph. */
function computeTransitiveReach(
  beats: Map<number, Set<number>>,
  memberIds: number[],
  maxDepth: number
): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();
  for (const src of memberIds) {
    const visited = new Set<number>();
    const queue: [number, number][] = [[src, 0]];
    while (queue.length > 0) {
      const [node, depth] = queue.shift()!;
      if (depth >= maxDepth) continue;
      for (const dst of beats.get(node) ?? []) {
        if (dst !== src && !visited.has(dst)) {
          visited.add(dst);
          queue.push([dst, depth + 1]);
        }
      }
    }
    result.set(src, visited);
  }
  return result;
}

/**
 * H2H run differential (capped).
 * strictGroupOnly = true  → head_to_group_rundiff: all pairs must have played; else null
 * strictGroupOnly = false → head_to_head_rundiff: null only if zero H2H games played
 */
function headToHeadRunDiff(
  teamId: number,
  memberIds: number[],
  h2hGames: GameRecord[],
  config: SeasonConfig,
  strictGroupOnly: boolean
): number | null {
  const n = memberIds.length;

  if (strictGroupOnly) {
    const playedPairs = new Set<string>();
    for (const g of h2hGames) {
      playedPairs.add(`${Math.min(g.home, g.away)}_${Math.max(g.home, g.away)}`);
    }
    if (playedPairs.size < (n * (n - 1)) / 2) return null;
  }

  const { maxrundiff, forfeit_run_diff } = config;
  let total = 0;
  let gameCount = 0;

  for (const g of h2hGames) {
    if (g.home === teamId) {
      gameCount++;
      if (g.winnerSide === "home") total += forfeit_run_diff;
      else if (g.winnerSide === "away") total -= forfeit_run_diff;
      else {
        const diff = (g.homescore ?? 0) - (g.awayscore ?? 0);
        total += Math.max(-maxrundiff, Math.min(maxrundiff, diff));
      }
    } else if (g.away === teamId) {
      gameCount++;
      if (g.winnerSide === "away") total += forfeit_run_diff;
      else if (g.winnerSide === "home") total -= forfeit_run_diff;
      else {
        const diff = (g.awayscore ?? 0) - (g.homescore ?? 0);
        total += Math.max(-maxrundiff, Math.min(maxrundiff, diff));
      }
    }
  }

  return gameCount > 0 ? total : null;
}

/**
 * H2H runs against (runs scored by opponents against this team in H2H games).
 * Sort direction ASC — fewer runs against is better.
 * strictGroupOnly = true  → head_to_group_runs_against: all pairs must have played
 * strictGroupOnly = false → head_to_head_runs_against: null only if zero H2H games
 *
 * Forfeit winner gets 0 runs against; forfeit loser gets forfeit_run_diff runs against.
 */
function headToHeadRunsAgainst(
  teamId: number,
  memberIds: number[],
  h2hGames: GameRecord[],
  config: SeasonConfig,
  strictGroupOnly: boolean
): number | null {
  const n = memberIds.length;

  if (strictGroupOnly) {
    const playedPairs = new Set<string>();
    for (const g of h2hGames) {
      playedPairs.add(`${Math.min(g.home, g.away)}_${Math.max(g.home, g.away)}`);
    }
    if (playedPairs.size < (n * (n - 1)) / 2) return null;
  }

  let total = 0;
  let gameCount = 0;

  for (const g of h2hGames) {
    if (g.home === teamId) {
      gameCount++;
      if (g.winnerSide === "home") total += 0;             // won forfeit — 0 RA
      else if (g.winnerSide === "away") total += config.forfeit_run_diff; // lost forfeit
      else total += g.awayscore ?? 0;
    } else if (g.away === teamId) {
      gameCount++;
      if (g.winnerSide === "away") total += 0;             // won forfeit — 0 RA
      else if (g.winnerSide === "home") total += config.forfeit_run_diff; // lost forfeit
      else total += g.homescore ?? 0;
    }
  }

  return gameCount > 0 ? total : null;
}

// ---------------------------------------------------------------------------
// Complex tiebreakers
// ---------------------------------------------------------------------------

/**
 * Common Opponents: wins vs non-member opponents that have played every group member.
 * Returns null if no common opponents exist.
 */
function commonOpponents(
  teamId: number,
  memberIds: number[],
  allGames: GameRecord[]
): number | null {
  // For each non-member opponent, collect which group members they've played
  const oppCoverage = new Map<number, Set<number>>();

  for (const g of allGames) {
    const homeInGroup = memberIds.includes(g.home);
    const awayInGroup = memberIds.includes(g.away);

    if (homeInGroup && !awayInGroup) {
      // g.away is an opponent of a group member (g.home)
      if (!oppCoverage.has(g.away)) oppCoverage.set(g.away, new Set());
      oppCoverage.get(g.away)!.add(g.home);
    }
    if (awayInGroup && !homeInGroup) {
      // g.home is an opponent of a group member (g.away)
      if (!oppCoverage.has(g.home)) oppCoverage.set(g.home, new Set());
      oppCoverage.get(g.home)!.add(g.away);
    }
  }

  // Common opponents = those who've played every group member
  const commonOpps = [...oppCoverage.entries()]
    .filter(([, covered]) => covered.size === memberIds.length)
    .map(([oppId]) => oppId);

  if (commonOpps.length === 0) return null;

  // Count wins for teamId vs common opponents
  let wins = 0;
  for (const g of allGames) {
    if (g.home === teamId && commonOpps.includes(g.away)) {
      wins += winPts(g, "home");
    } else if (g.away === teamId && commonOpps.includes(g.home)) {
      wins += winPts(g, "away");
    }
  }
  return wins;
}

/**
 * Strength of Schedule: total_opp_wins / total_opp_games across all unique opponents played.
 * Returns null if no games played.
 */
function strengthOfSchedule(
  teamId: number,
  allGames: GameRecord[],
  allStats: Map<number, TeamStats>
): number | null {
  const opponents = new Set<number>();
  for (const g of allGames) {
    if (g.home === teamId) opponents.add(g.away);
    if (g.away === teamId) opponents.add(g.home);
  }
  if (opponents.size === 0) return null;

  let totalOppWins = 0;
  let totalOppGames = 0;
  for (const oppId of opponents) {
    const oppStats = allStats.get(oppId);
    if (oppStats) {
      totalOppWins += oppStats.wins;
      totalOppGames += oppStats.games;
    }
  }

  return totalOppGames > 0 ? totalOppWins / totalOppGames : null;
}

/**
 * Fewest Forfeits: count of games this team was responsible for forfeiting.
 * Lower is better (ASC sort direction).
 * Counts across ALL regular-season games, not just within the tied group.
 */
function fewestForfeits(teamId: number, allGames: GameRecord[]): number {
  let count = 0;
  for (const g of allGames) {
    if (g.home === teamId && g.winnerSide === "away") count++; // home forfeited
    if (g.away === teamId && g.winnerSide === "home") count++; // away forfeited
  }
  return count;
}

/**
 * Coin Toss: deterministic pseudo-random integer per team using FNV-1a hash.
 * Stable across queries; higher value wins (DESC sort direction).
 */
function coinToss(teamId: number): number {
  let hash = 2166136261;
  const s = String(teamId);
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // unsigned 32-bit
}
