import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseIds(req: NextApiRequest): { tournamentId: number; scenarioId: number } | null {
  const rawT = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const rawS = Array.isArray(req.query.scenarioId) ? req.query.scenarioId[0] : req.query.scenarioId;
  const tournamentId = parseInt(String(rawT ?? ""), 10);
  const scenarioId = parseInt(String(rawS ?? ""), 10);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(scenarioId)) return null;
  return { tournamentId, scenarioId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ids = parseIds(req);
  if (!ids) return res.status(400).json({ error: "Invalid ids" });
  const { tournamentId, scenarioId } = ids;

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sq.*, t.name AS team_name
        FROM scenario_questions sq
        LEFT JOIN teams t ON t.teamid = sq.team_id
        WHERE sq.id = ${scenarioId}
          AND sq.entity_type = 'tournament'
          AND sq.entity_id = ${tournamentId}
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: "Scenario not found" });
      }
      return res.status(200).json({ scenario: rows[0] });
    }

    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM scenario_questions
        WHERE id = ${scenarioId}
          AND entity_type = 'tournament'
          AND entity_id = ${tournamentId}
        RETURNING id
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: "Scenario not found" });
      }
      return res.status(200).json({ deleted: true });
    }

    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament scenario detail API]", err);
    return res.status(500).json({ error: message });
  }
}
