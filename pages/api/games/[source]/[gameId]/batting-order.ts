import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseParams(req: NextApiRequest) {
  const source = String(req.query.source);
  if (source !== "season" && source !== "tournament") return null;
  const gameId = parseInt(String(Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId), 10);
  if (!Number.isFinite(gameId)) return null;
  return { source, gameId } as const;
}

function parseTeamId(req: NextApiRequest): number | null {
  const raw = req.method === "GET" ? req.query.team : req.body?.team_id;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const params = parseParams(req);
  if (!params) return res.status(400).json({ error: "Invalid source or gameId" });

  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "team / team_id is required" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          bo.bat_order,
          bo.roster_id,
          r.first_name,
          r.last_name,
          r.jersey_number
        FROM game_batting_order bo
        JOIN team_roster r ON r.id = bo.roster_id
        WHERE bo.game_source = ${params.source}
          AND bo.game_id = ${params.gameId}
          AND bo.team_id = ${teamId}
        ORDER BY bo.bat_order ASC
      `;
      return res.status(200).json({ order: rows });
    }

    if (req.method === "PUT") {
      const { order } = req.body ?? {};
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: "order array is required" });
      }

      // Delete existing and insert new in sequence
      await sql`
        DELETE FROM game_batting_order
        WHERE game_source = ${params.source}
          AND game_id = ${params.gameId}
          AND team_id = ${teamId}
      `;

      for (const entry of order) {
        const rosterId = parseInt(String(entry.roster_id), 10);
        const batOrder = parseInt(String(entry.bat_order), 10);
        if (!Number.isFinite(rosterId) || !Number.isFinite(batOrder)) continue;

        await sql`
          INSERT INTO game_batting_order (game_source, game_id, team_id, roster_id, bat_order)
          VALUES (${params.source}, ${params.gameId}, ${teamId}, ${rosterId}, ${batOrder})
        `;
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    console.error("[batting-order] error", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
