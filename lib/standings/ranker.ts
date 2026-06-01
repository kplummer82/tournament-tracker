import { computeBaseStats } from "./baseStats";
import { evaluateTiebreaker } from "./tiebreakers";
import type { GameRecord, SeasonConfig, StandingsRow, TeamRecord, TeamStats, TiebreakerConfig } from "./types";

/**
 * State carried through the tiebreaker-narrowing loop.
 * `lexiKeys` encodes each team's position so far; teams sharing a key are still tied.
 * `details` records each evaluated tiebreaker value per team (for display/debug).
 */
export type NarrowState = {
  lexiKeys: Map<number, number>;
  details: Map<number, Record<string, number | null>>;
};

/** Initialize narrowing state: every team starts in one tied group (key 0). */
export function initNarrowState(teams: TeamRecord[]): NarrowState {
  return {
    lexiKeys: new Map(teams.map((t) => [t.teamid, 0])),
    details: new Map(teams.map((t) => [t.teamid, {}])),
  };
}

/** Group team ids by their current lexiKey. */
function groupByLexiKey(lexiKeys: Map<number, number>): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const [tid, key] of lexiKeys) {
    const arr = groups.get(key);
    if (arr) arr.push(tid);
    else groups.set(key, [tid]);
  }
  return groups;
}

/**
 * Apply a single tiebreaker to the current state, narrowing tied groups in place.
 *
 * `valueOverride` lets a caller substitute the ranking value for specific teams
 * (used for manual coin-toss results). When provided and it returns a non-null
 * value for a team, that value is used instead of evaluateTiebreaker.
 */
export function applyTiebreaker(
  state: NarrowState,
  tb: TiebreakerConfig,
  teamCount: number,
  games: GameRecord[],
  allStats: Map<number, TeamStats>,
  config: SeasonConfig,
  valueOverride?: (teamId: number, memberIds: number[]) => number | null
): void {
  const B = teamCount + 1; // base for lexiKey encoding
  const groups = groupByLexiKey(state.lexiKeys);

  for (const [groupKey, memberIds] of groups) {
    if (memberIds.length === 1) {
      // Already unique — still expand key (rank=1) so keys grow uniformly.
      const ov = valueOverride?.(memberIds[0], memberIds) ?? null;
      const val = ov !== null ? ov : evaluateTiebreaker(tb.code, memberIds[0], memberIds, games, allStats, config);
      state.details.get(memberIds[0])![tb.code] = val;
      state.lexiKeys.set(memberIds[0], groupKey * B + 1);
      continue;
    }

    // Evaluate tiebreaker for each member (with optional override)
    const vals = new Map<number, number | null>();
    for (const mid of memberIds) {
      const ov = valueOverride?.(mid, memberIds) ?? null;
      const v = ov !== null ? ov : evaluateTiebreaker(tb.code, mid, memberIds, games, allStats, config);
      vals.set(mid, v);
      state.details.get(mid)![tb.code] = v;
    }

    const ranks = rankWithinGroup(vals, tb.sortDirection);
    for (const mid of memberIds) {
      const rank = ranks.get(mid) ?? 1;
      state.lexiKeys.set(mid, groupKey * B + rank);
    }
  }
}

/**
 * Compute final standings given game records, teams, tiebreaker config, and season config.
 *
 * Pure synchronous function — no DB access.
 *
 * Algorithm (TypeScript equivalent of the recursive SQL CTE):
 *   1. Compute base stats for all teams.
 *   2. Initialize all teams with lexiKey = 0 (all in one group).
 *   3. For each tiebreaker (sorted by priority): narrow tied groups (applyTiebreaker).
 *   4. Compute rank_final via dense-rank: 1 + count of distinct smaller lexiKeys.
 *
 * `manualCoinToss` (optional): map of teamId → seed_order (1 = best) for teams whose
 * coin-toss tie was resolved by a real-world coin toss. When the `coin_toss` tiebreaker
 * runs, any tied group whose members are ALL present in this map uses the manual order
 * instead of the deterministic hash. Simulations omit this map and keep deterministic
 * coin tosses.
 */
export function computeStandings(
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig,
  manualCoinToss?: Map<number, number>
): StandingsRow[] {
  if (teams.length === 0) return [];

  const allStats = computeBaseStats(games, teams, config);
  const sortedTBs = [...tiebreakers].sort((a, b) => a.priority - b.priority);
  const state = initNarrowState(teams);

  for (const tb of sortedTBs) {
    let override: ((teamId: number, memberIds: number[]) => number | null) | undefined;

    if (tb.code === "coin_toss" && manualCoinToss && manualCoinToss.size > 0) {
      override = (_teamId, memberIds) => {
        // Apply manual order only when EVERY member of this tied group is resolved.
        const allResolved = memberIds.every((m) => manualCoinToss.has(m));
        if (!allResolved) return null;
        // coin_toss sorts DESC (higher wins); seed_order 1 = best → negate.
        return -manualCoinToss.get(_teamId)!;
      };
    }

    applyTiebreaker(state, tb, teams.length, games, allStats, config, override);
  }

  // Dense-rank: rank_final = 1 + count of distinct smaller lexiKeys
  const allKeys = [...new Set(state.lexiKeys.values())].sort((a, b) => a - b);
  const keyToRank = new Map(allKeys.map((key, idx) => [key, idx + 1]));

  return teams.map((t) => {
    const stats = allStats.get(t.teamid)!;
    const key = state.lexiKeys.get(t.teamid) ?? 0;
    return {
      ...stats,
      rank_final: keyToRank.get(key) ?? 1,
      lexi_key: key,
      details: state.details.get(t.teamid) ?? {},
    };
  });
}

/**
 * Rank a set of (teamId → value | null) entries within one tied group.
 *
 * NULL handling:
 *   - All-NULL → all get rank 1 (tiebreaker skipped, group stays together)
 *   - Mixed    → NULLs rank last (after all non-null teams), tied with each other
 *
 * Returns Map<teamId, rank> (1-indexed, dense).
 */
function rankWithinGroup(
  vals: Map<number, number | null>,
  sortDir: "ASC" | "DESC"
): Map<number, number> {
  const result = new Map<number, number>();
  const nonNull = [...vals.entries()].filter((e): e is [number, number] => e[1] !== null);
  const nullTeams = [...vals.entries()].filter((e) => e[1] === null).map(([id]) => id);

  // All-NULL → all rank 1
  if (nonNull.length === 0) {
    for (const [tid] of vals) result.set(tid, 1);
    return result;
  }

  // Rank non-null values (dense rank)
  for (const [tid, val] of nonNull) {
    let rank = 1;
    for (const [, otherVal] of nonNull) {
      if (sortDir === "DESC" && otherVal > val) rank++;
      if (sortDir === "ASC" && otherVal < val) rank++;
    }
    result.set(tid, rank);
  }

  // NULLs rank after all non-null teams
  const maxRank = Math.max(...result.values()) + 1;
  for (const tid of nullTeams) {
    result.set(tid, maxRank);
  }

  return result;
}
