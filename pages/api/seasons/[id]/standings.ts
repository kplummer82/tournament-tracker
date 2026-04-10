import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSeasonStandingsData, computeStandings } from "@/lib/standings";
import type { StandingsRow } from "@/lib/standings";

export type SeasonStandingsRow = StandingsRow & {
  seasonid?: number;
  seasonname?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const seasonId = raw != null ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(seasonId)) {
    return res.status(400).json({ error: "Invalid season id" });
  }

  try {
    const data = await fetchSeasonStandingsData(seasonId);
    const rows = computeStandings(data.games, data.teams, data.tiebreakers, data.config);
    const standings = [...rows].sort((a, b) => a.rank_final - b.rank_final);
    return res.status(200).json({ standings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[season standings API]", err);
    return res.status(500).json({ error: message });
  }
}
