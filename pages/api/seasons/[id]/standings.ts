import type { NextApiRequest, NextApiResponse } from "next";
import {
  fetchSeasonStandingsData,
  fetchSeasonRemainingGameCount,
  computeStandings,
} from "@/lib/standings";
import { buildCoinTossContext, resolveCoinTossPhase } from "@/lib/standings/coinTossService";
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

  const includeInProgress = req.query.includeInProgress === "true";
  const rawAsOf = Array.isArray(req.query.asOfDate) ? req.query.asOfDate[0] : req.query.asOfDate;
  const asOfDate = typeof rawAsOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawAsOf) ? rawAsOf : undefined;

  try {
    const [data, remainingGames] = await Promise.all([
      fetchSeasonStandingsData(seasonId, { includeInProgress, asOfDate }),
      fetchSeasonRemainingGameCount(seasonId),
    ]);
    const { manualCoinToss, groups } = await buildCoinTossContext(
      "season",
      seasonId,
      data.games,
      data.teams,
      data.tiebreakers,
      data.config
    );
    const rows = computeStandings(data.games, data.teams, data.tiebreakers, data.config, manualCoinToss);
    const standings = [...rows].sort((a, b) => a.rank_final - b.rank_final);

    // `manualCoinToss` above is applied at every phase — a result saved when the
    // season was final stays valid if a game is later reopened for a correction.
    // Only the affordance changes.
    const phase = resolveCoinTossPhase({
      coinTossConfigured: data.tiebreakers.some((tb) => tb.code === "coin_toss"),
      completedGames: data.games.length,
      remainingGames,
      asOfDate,
    });

    return res.status(200).json({
      standings,
      coinToss: { groups: phase === "none" ? [] : groups, phase, remainingGames },
    });
  } catch (err: unknown) {
    const message = "Server error";
    console.error("[season standings API]", err);
    return res.status(500).json({ error: message });
  }
}
