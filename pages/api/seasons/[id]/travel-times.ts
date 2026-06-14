import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireSeasonAccess } from "@/lib/auth/requireSession";
import { ensureTravelTimesForLocations, CHANGEOVER_MINUTES } from "@/lib/tournaments/travelTimes";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Distinct official location ids referenced by a season's schedule config. */
function locationIdsFromConfig(config: unknown): number[] {
  const ids = new Set<number>();
  const dayRules = (config as { dayRules?: unknown[] })?.dayRules;
  if (Array.isArray(dayRules)) {
    for (const rule of dayRules) {
      const slots = (rule as { gameSlots?: unknown[] })?.gameSlots;
      if (!Array.isArray(slots)) continue;
      for (const s of slots) {
        const locId = (s as { locationId?: unknown })?.locationId;
        if (locId != null && Number.isFinite(Number(locId))) ids.add(Number(locId));
      }
    }
  }
  return [...ids];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end("Method Not Allowed");
  }

  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  const session = await requireSeasonAccess(req, res, seasonId);
  if (!session) return;

  const client = await pool.connect();
  try {
    const { rows: seasonRows } = await client.query(
      `SELECT schedule_config FROM seasons WHERE id = $1`,
      [seasonId],
    );
    const config = seasonRows[0]?.schedule_config ?? null;
    const configLocIds = locationIdsFromConfig(config);

    // Fall back to / union committed regular-game locations so a saved schedule
    // still flags travel conflicts even when the config has been cleared.
    const { rows: gameRows } = await client.query(
      `SELECT DISTINCT location_id
         FROM season_games
        WHERE season_id = $1 AND game_type = 'regular' AND location_id IS NOT NULL`,
      [seasonId],
    );
    const gameLocIds = gameRows.map((r) => Number(r.location_id)).filter((n) => Number.isFinite(n));

    const locIds = [...new Set([...configLocIds, ...gameLocIds])];
    const drivingMinutes = await ensureTravelTimesForLocations(client, locIds);

    return res.status(200).json({
      drivingMinutes,
      changeoverMinutes: CHANGEOVER_MINUTES,
    });
  } catch (err: any) {
    console.error("[seasons/[id]/travel-times] error", err);
    return res.status(500).json({ error: err?.message ?? "Server error" });
  } finally {
    client.release();
  }
}
