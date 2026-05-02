import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

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
    const rows = await sql`
      SELECT
        MIN(gamedate)::text AS min_date,
        MAX(gamedate)::text AS max_date
      FROM season_games
      WHERE season_id = ${seasonId}
        AND game_type = 'regular'
        AND gamestatusid IN (4, 6, 7)
    `;
    const { min_date, max_date } = rows[0] ?? {};
    return res.status(200).json({
      minDate: min_date ?? null,
      maxDate: max_date ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[season date-range API]", err);
    return res.status(500).json({ error: message });
  }
}
