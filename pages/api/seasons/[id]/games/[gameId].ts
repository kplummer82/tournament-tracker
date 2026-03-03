import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  const gameId = parseInt(String(Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId), 10);

  if (!Number.isFinite(seasonId) || !Number.isFinite(gameId)) {
    return res.status(400).json({ error: "Invalid season or game id" });
  }

  try {
    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM season_games
        WHERE id = ${gameId} AND season_id = ${seasonId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Game not found" });
      return res.status(200).json({ ok: true });
    }

    // PATCH: update scores and/or status (use PUT on /games for full date/team edits)
    if (req.method === "PATCH") {
      const { homescore, awayscore, gamestatusid } = req.body ?? {};

      const rows = await sql`
        UPDATE season_games SET
          homescore    = ${homescore != null && homescore !== "" ? Number(homescore) : null},
          awayscore    = ${awayscore != null && awayscore !== "" ? Number(awayscore) : null},
          gamestatusid = ${gamestatusid != null && gamestatusid !== "" ? Number(gamestatusid) : null}
        WHERE id = ${gameId} AND season_id = ${seasonId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Game not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["DELETE", "PATCH"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/games/[gameId]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
