import { computeBaseStats } from "./baseStats";
import { evaluateTiebreaker } from "./tiebreakers";
import type { GameRecord, SeasonConfig, StandingsRow, TeamRecord, TiebreakerConfig } from "./types";

/**
 * Compute final standings given game records, teams, tiebreaker config, and season config.
 *
 * Pure synchronous function — no DB access.
 *
 * Algorithm (TypeScript equivalent of the recursive SQL CTE):
 *   1. Compute base stats for all teams.
 *   2. Initialize all teams with lexiKey = 0 (all in one group).
 *   3. For each tiebreaker (sorted by priority):
 *      a. Group teams by current lexiKey (same key = currently tied).
 *      b. For each group, evaluate the tiebreaker for every member.
 *      c. Rank within the group (NULL handling: all-NULL → all rank 1 → skip;
 *         mixed → NULLs rank last, tied with each other).
 *      d. New lexiKey = oldKey × B + rank  (B = total teams + 1).
 *      e. Record tiebreaker value in `details`.
 *   4. Compute rank_final via dense-rank: 1 + count of distinct smaller lexiKeys.
 */
export function computeStandings(
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig
): StandingsRow[] {
  if (teams.length === 0) return [];

  const allStats = computeBaseStats(games, teams, config);
  const B = teams.length + 1; // base for lexiKey encoding

  // Sort tiebreakers by priority ascending
  const sortedTBs = [...tiebreakers].sort((a, b) => a.priority - b.priority);

  // Per-team state
  const lexiKeys = new Map<number, number>(teams.map((t) => [t.teamid, 0]));
  const details = new Map<number, Record<string, number | null>>(
    teams.map((t) => [t.teamid, {}])
  );

  for (const tb of sortedTBs) {
    // Group teams by their current lexiKey
    const groups = new Map<number, number[]>();
    for (const [tid, key] of lexiKeys) {
      const arr = groups.get(key);
      if (arr) arr.push(tid);
      else groups.set(key, [tid]);
    }

    for (const [groupKey, memberIds] of groups) {
      if (memberIds.length === 1) {
        // Already unique — still must expand key (rank=1) so the key grows at the
        // same rate as multi-member groups and keeps its correct relative position.
        const val = evaluateTiebreaker(tb.code, memberIds[0], memberIds, games, allStats, config);
        details.get(memberIds[0])![tb.code] = val;
        lexiKeys.set(memberIds[0], groupKey * B + 1);
        continue;
      }

      // Evaluate tiebreaker for each member
      const vals = new Map<number, number | null>();
      for (const mid of memberIds) {
        const v = evaluateTiebreaker(tb.code, mid, memberIds, games, allStats, config);
        vals.set(mid, v);
        details.get(mid)![tb.code] = v;
      }

      // Rank within group
      const ranks = rankWithinGroup(vals, tb.sortDirection);

      // Update lexiKeys
      for (const mid of memberIds) {
        const rank = ranks.get(mid) ?? 1;
        lexiKeys.set(mid, groupKey * B + rank);
      }
    }
  }

  // Dense-rank: rank_final = 1 + count of distinct smaller lexiKeys
  const allKeys = [...new Set(lexiKeys.values())].sort((a, b) => a - b);
  const keyToRank = new Map(allKeys.map((key, idx) => [key, idx + 1]));

  return teams.map((t) => {
    const stats = allStats.get(t.teamid)!;
    const key = lexiKeys.get(t.teamid) ?? 0;
    return {
      ...stats,
      rank_final: keyToRank.get(key) ?? 1,
      lexi_key: key,
      details: details.get(t.teamid) ?? {},
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
