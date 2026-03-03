import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export type SeasonStandingsRow = {
  seasonid: number;
  seasonname: string | null;
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

  const includeInProgress = req.query.includeInProgress !== "false";

  try {
    const standings = (await sql`
      SELECT
        seasonid,
        seasonname,
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
      FROM public.fn_season_standings_lexi_noorder(
        ${seasonId},
        ${includeInProgress},
        false,
        ${null}
      )
      ORDER BY rank_final ASC
    `) as SeasonStandingsRow[];

    return res.status(200).json({ standings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[season standings API]", err);
    return res.status(500).json({ error: message });
  }
}
