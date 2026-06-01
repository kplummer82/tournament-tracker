import { computeBaseStats } from "./baseStats";
import { applyTiebreaker, initNarrowState } from "./ranker";
import type { GameRecord, SeasonConfig, TeamRecord, TiebreakerConfig } from "./types";

/**
 * Stable signature for a tied group: member team IDs sorted ascending, joined by '-'.
 * Used to persist and auto-invalidate a manual coin-toss result — a saved result only
 * applies when a currently-detected group has the exact same signature.
 */
export function groupSignature(teamIds: number[]): string {
  return [...teamIds].sort((a, b) => a - b).join("-");
}

/**
 * Detect the groups of teams that are still tied entering the `coin_toss` tiebreaker.
 *
 * Runs the same narrowing loop as `computeStandings` but over every configured
 * tiebreaker EXCEPT `coin_toss`. Teams that then share a lexiKey are tied all the way
 * to the coin toss; groups of size ≥ 2 are returned. Order within each returned group
 * is by ascending teamid (stable; callers can re-sort by saved seed order).
 *
 * If `coin_toss` is not in the configured tiebreakers at all, no group can be broken by
 * it — but teams genuinely tied to the end are still surfaced (they have no resolution),
 * so we still return them.
 */
export function detectCoinTossGroups(
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig
): number[][] {
  if (teams.length === 0) return [];

  const allStats = computeBaseStats(games, teams, config);
  const state = initNarrowState(teams);

  const preCoinToss = [...tiebreakers]
    .filter((tb) => tb.code !== "coin_toss")
    .sort((a, b) => a.priority - b.priority);

  for (const tb of preCoinToss) {
    applyTiebreaker(state, tb, teams.length, games, allStats, config);
  }

  const groups = new Map<number, number[]>();
  for (const [tid, key] of state.lexiKeys) {
    const arr = groups.get(key);
    if (arr) arr.push(tid);
    else groups.set(key, [tid]);
  }

  return [...groups.values()]
    .filter((members) => members.length >= 2)
    .map((members) => [...members].sort((a, b) => a - b));
}
