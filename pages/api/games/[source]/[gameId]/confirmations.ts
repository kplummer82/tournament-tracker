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
      // Return all roster players (role='player') with their confirmation status
      const rows = await sql`
        SELECT
          r.id          AS roster_id,
          r.first_name,
          r.last_name,
          r.jersey_number,
          COALESCE(gc.status, 'pending') AS status
        FROM team_roster r
        LEFT JOIN game_confirmations gc
          ON gc.roster_id = r.id
          AND gc.game_source = ${params.source}
          AND gc.game_id = ${params.gameId}
        WHERE r.teamid = ${teamId}
          AND r.role = 'player'
        ORDER BY r.jersey_number ASC NULLS LAST, r.last_name ASC NULLS LAST, r.first_name ASC
      `;
      return res.status(200).json({ confirmations: rows });
    }

    if (req.method === "PUT") {
      const { confirmations } = req.body ?? {};
      if (!Array.isArray(confirmations)) {
        return res.status(400).json({ error: "confirmations array is required" });
      }

      // Upsert each confirmation
      for (const c of confirmations) {
        const rosterId = parseInt(String(c.roster_id), 10);
        const status = String(c.status);
        if (!Number.isFinite(rosterId) || !["confirmed", "declined", "pending"].includes(status)) continue;

        await sql`
          INSERT INTO game_confirmations (game_source, game_id, team_id, roster_id, status, updated_at)
          VALUES (${params.source}, ${params.gameId}, ${teamId}, ${rosterId}, ${status}, NOW())
          ON CONFLICT (game_source, game_id, roster_id)
          DO UPDATE SET status = ${status}, updated_at = NOW()
        `;
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    console.error("[confirmations] error", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
