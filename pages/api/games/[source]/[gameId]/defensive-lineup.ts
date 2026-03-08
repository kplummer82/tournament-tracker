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

const VALID_POSITIONS = new Set(["P","C","1B","2B","3B","SS","LF","CF","RF","DH","BN"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const params = parseParams(req);
  if (!params) return res.status(400).json({ error: "Invalid source or gameId" });

  const teamId = parseTeamId(req);
  if (!teamId) return res.status(400).json({ error: "team / team_id is required" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          dl.inning,
          dl.position,
          dl.roster_id,
          r.first_name,
          r.last_name,
          r.jersey_number
        FROM game_defensive_lineup dl
        JOIN team_roster r ON r.id = dl.roster_id
        WHERE dl.game_source = ${params.source}
          AND dl.game_id = ${params.gameId}
          AND dl.team_id = ${teamId}
        ORDER BY dl.inning ASC, dl.position ASC
      `;
      return res.status(200).json({ lineup: rows });
    }

    if (req.method === "PUT") {
      const { lineup } = req.body ?? {};
      if (!Array.isArray(lineup)) {
        return res.status(400).json({ error: "lineup array is required" });
      }

      // Delete existing and insert new in sequence
      await sql`
        DELETE FROM game_defensive_lineup
        WHERE game_source = ${params.source}
          AND game_id = ${params.gameId}
          AND team_id = ${teamId}
      `;

      for (const entry of lineup) {
        const rosterId = parseInt(String(entry.roster_id), 10);
        const inning = parseInt(String(entry.inning), 10);
        const position = String(entry.position);
        if (!Number.isFinite(rosterId) || !Number.isFinite(inning)) continue;
        if (inning < 1 || inning > 9) continue;
        if (!VALID_POSITIONS.has(position)) continue;

        await sql`
          INSERT INTO game_defensive_lineup (game_source, game_id, team_id, roster_id, inning, position)
          VALUES (${params.source}, ${params.gameId}, ${teamId}, ${rosterId}, ${inning}, ${position})
        `;
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    console.error("[defensive-lineup] error", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
