import type { NextApiRequest, NextApiResponse } from "next";
import { fetchTournamentStandingsData, computeStandings } from "@/lib/standings";
import type { StandingsRow } from "@/lib/standings";

export type { StandingsRow };

export type TournamentStandingsRow = StandingsRow & {
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

  // Optional group filter: ?pool_group=A
  const filterGroup =
    typeof req.query.pool_group === "string" && req.query.pool_group.trim() !== ""
      ? req.query.pool_group.trim()
      : null;

  try {
    const data = await fetchTournamentStandingsData(tournamentId);
    const rows = computeStandings(data.games, data.teams, data.tiebreakers, data.config);

    // Fetch pool_group assignments for each team
    const { sql } = await import("@/lib/db");
    const teamGroups = (await sql`
      SELECT teamid, pool_group
      FROM public.tournamentteams
      WHERE tournamentid = ${tournamentId}
    `) as { teamid: number; pool_group: string | null }[];

    const groupMap = new Map(teamGroups.map((r) => [r.teamid, r.pool_group ?? null]));

    let standings: TournamentStandingsRow[] = rows
      .sort((a, b) => a.rank_final - b.rank_final)
      .map((r) => ({ ...r, pool_group: groupMap.get(r.teamid) ?? null }));

    if (filterGroup !== null) {
      standings = standings.filter((r) => r.pool_group === filterGroup);
      standings = standings.map((r, idx) => ({ ...r, rank_final: idx + 1 }));
    }

    return res.status(200).json({ standings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[standings API]", err);
    return res.status(500).json({ error: message });
  }
}
