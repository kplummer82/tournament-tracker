import { detectCoinTossGroups, groupSignature } from "./coinToss";
import { fetchCoinTossResults, type CoinTossScope } from "./index";
import type { GameRecord, SeasonConfig, TeamRecord, TiebreakerConfig } from "./types";

export type CoinTossTeam = {
  teamid: number;
  team: string;
  seedOrder: number | null; // saved finish order within the group (1 = best), or null if unresolved
};

export type CoinTossGroup = {
  groupSig: string;
  pool_group: string | null; // tournaments only; null for seasons / ungrouped
  resolved: boolean; // every member has a saved seed_order
  teams: CoinTossTeam[]; // sorted by seedOrder when resolved, else by teamid
};

/**
 * Detect coin-toss groups, scoping by pool group when one is provided.
 *
 * Teams in different pools must never share a coin-toss group even if they happen
 * to share a lexiKey, so each raw detected group is partitioned by pool group and
 * any resulting sub-group of size < 2 is dropped.
 */
export function detectScopedGroups(
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig,
  poolGroupOf?: Map<number, string | null>
): { members: number[]; pool_group: string | null }[] {
  const raw = detectCoinTossGroups(games, teams, tiebreakers, config);

  if (!poolGroupOf) {
    return raw.map((members) => ({ members, pool_group: null }));
  }

  const out: { members: number[]; pool_group: string | null }[] = [];
  for (const members of raw) {
    const byPool = new Map<string, number[]>();
    for (const tid of members) {
      const pg = poolGroupOf.get(tid) ?? null;
      const key = pg ?? "__none__";
      const arr = byPool.get(key);
      if (arr) arr.push(tid);
      else byPool.set(key, [tid]);
    }
    for (const [key, sub] of byPool) {
      if (sub.length < 2) continue;
      out.push({ members: sub.sort((a, b) => a - b), pool_group: key === "__none__" ? null : key });
    }
  }
  return out;
}

/**
 * Build everything the standings API needs for coin-toss handling:
 *  - `manualCoinToss`: teamId → seed_order map to pass into computeStandings, containing
 *    only fully-resolved groups whose signature still matches a currently detected group.
 *  - `groups`: the full set of currently detected groups with their resolution state,
 *    for the UI banner/modal. (Saved results whose group no longer exists are dropped —
 *    auto-invalidation.)
 */
export async function buildCoinTossContext(
  scope: CoinTossScope,
  scopeId: number,
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig,
  poolGroupOf?: Map<number, string | null>
): Promise<{ manualCoinToss: Map<number, number>; groups: CoinTossGroup[] }> {
  const detected = detectScopedGroups(games, teams, tiebreakers, config, poolGroupOf);
  const saved = await fetchCoinTossResults(scope, scopeId);
  const nameOf = new Map(teams.map((t) => [t.teamid, t.team]));

  const manualCoinToss = new Map<number, number>();
  const groups: CoinTossGroup[] = [];

  for (const g of detected) {
    const sig = groupSignature(g.members);
    const savedInner = saved.get(sig);
    // Resolved only when EVERY member has a saved seed_order for this exact signature.
    const resolved = !!savedInner && g.members.every((m) => savedInner.has(m));

    if (resolved) {
      for (const m of g.members) manualCoinToss.set(m, savedInner!.get(m)!);
    }

    const teamsOut: CoinTossTeam[] = g.members.map((tid) => ({
      teamid: tid,
      team: nameOf.get(tid) ?? "—",
      seedOrder: savedInner?.get(tid) ?? null,
    }));

    teamsOut.sort((a, b) => {
      if (a.seedOrder != null && b.seedOrder != null) return a.seedOrder - b.seedOrder;
      if (a.seedOrder != null) return -1;
      if (b.seedOrder != null) return 1;
      return a.teamid - b.teamid;
    });

    groups.push({ groupSig: sig, pool_group: g.pool_group, resolved, teams: teamsOut });
  }

  // Stable ordering of groups for the UI: by pool group then signature.
  groups.sort((a, b) => {
    const pa = a.pool_group ?? "";
    const pb = b.pool_group ?? "";
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.groupSig < b.groupSig ? -1 : a.groupSig > b.groupSig ? 1 : 0;
  });

  return { manualCoinToss, groups };
}

/**
 * Validate a coin-toss submission against currently detected groups.
 *
 * `order` is teamIds best→worst. It is valid only if its members, sorted, form the
 * signature `groupSig` AND that signature matches a currently detected group exactly.
 * This rejects saving against a stale group (membership has since changed).
 */
export function validateCoinTossSubmission(
  groupSig: string,
  order: number[],
  games: GameRecord[],
  teams: TeamRecord[],
  tiebreakers: TiebreakerConfig[],
  config: SeasonConfig,
  poolGroupOf?: Map<number, string | null>
): { ok: true } | { ok: false; error: string } {
  const uniq = Array.from(new Set(order));
  if (uniq.length !== order.length) return { ok: false, error: "Duplicate team in order" };
  if (order.length < 2) return { ok: false, error: "A coin toss needs at least 2 teams" };

  if (groupSignature(order) !== groupSig) {
    return { ok: false, error: "Submitted teams do not match the group signature" };
  }

  const detected = detectScopedGroups(games, teams, tiebreakers, config, poolGroupOf);
  const match = detected.find((g) => groupSignature(g.members) === groupSig);
  if (!match) {
    return { ok: false, error: "This tie no longer exists — the group has changed" };
  }

  return { ok: true };
}
