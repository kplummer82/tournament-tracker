import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

/** Row shape from fn_pool_standings_lexi_noorder, with pool_group attached */
export type StandingsRow = {
  tournamentid: number;
  tournamentname: string | null;
  teamid: number;
  team: string | null;
  runsscored: number;
  wins: number;
  games: number;
  wltpct: number;
  rundifferential: number;
  runsagainst: number;
  rank_final: number;
  lexi_key: number;
  details: Record<string, unknown> | null;
  pool_group: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.tournamentid)
    ? req.query.tournamentid[0]
    : (req.query.tournamentid as string | undefined);
  const tournamentId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(tournamentId)) {
    return res.status(400).json({ error: "Invalid tournamentid" });
  }

  const includeInProgress = req.query.includeInProgress !== "false";

  // Optional group filter: ?pool_group=A
  const filterGroup =
    typeof req.query.pool_group === "string" && req.query.pool_group.trim() !== ""
      ? req.query.pool_group.trim()
      : null;

  try {
    // 1. Get all standings from the function
    const standingsRaw = (await sql`
      SELECT
        tournamentid,
        tournamentname,
        teamid,
        team,
        runsscored,
        wins,
        games,
        wltpct,
        rundifferential,
        runsagainst,
        rank_final,
        lexi_key,
        details
      FROM public.fn_pool_standings_lexi_noorder(
        ${tournamentId},
        ${includeInProgress},
        false,
        ${null}
      )
      ORDER BY rank_final ASC
    `) as Omit<StandingsRow, "pool_group">[];

    // 2. Fetch pool_group for all teams in this tournament
    const teamGroups = (await sql`
      SELECT teamid, pool_group
      FROM public.tournamentteams
      WHERE tournamentid = ${tournamentId}
    `) as { teamid: number; pool_group: string | null }[];

    const groupMap = new Map(teamGroups.map((r) => [r.teamid, r.pool_group ?? null]));

    // 3. Attach pool_group to each standings row
    let rows: StandingsRow[] = standingsRaw.map((r) => ({
      ...r,
      pool_group: groupMap.get(r.teamid) ?? null,
    }));

    // 4. If a group filter was requested, filter to that group and re-rank 1..N
    if (filterGroup !== null) {
      rows = rows.filter((r) => r.pool_group === filterGroup);
      // Re-rank: rows are already ordered by rank_final (within-group order is preserved
      // because same-tournament games between group members produce correct relative rankings)
      rows = rows.map((r, idx) => ({ ...r, rank_final: idx + 1 }));
    }

    return res.status(200).json({ standings: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[standings API]", err);
    return res.status(500).json({ error: message });
  }
}
