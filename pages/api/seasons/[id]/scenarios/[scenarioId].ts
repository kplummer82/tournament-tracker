import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseIds(req: NextApiRequest): { seasonId: number; scenarioId: number } | null {
  const rawSeason = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const rawScenario = Array.isArray(req.query.scenarioId) ? req.query.scenarioId[0] : req.query.scenarioId;
  const seasonId = parseInt(String(rawSeason ?? ""), 10);
  const scenarioId = parseInt(String(rawScenario ?? ""), 10);
  if (!Number.isFinite(seasonId) || !Number.isFinite(scenarioId)) return null;
  return { seasonId, scenarioId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ids = parseIds(req);
  if (!ids) return res.status(400).json({ error: "Invalid ids" });
  const { seasonId, scenarioId } = ids;

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sq.id, sq.entity_type, sq.entity_id, sq.question_type,
          sq.team_id, t1.name AS team_name,
          sq.opponent_team_id, t2.name AS opponent_team_name,
          sq.target_seed, sq.seed_mode,
          sq.is_possible, sq.probability, sq.simulations_run,
          sq.sample_scenario,
          sq.most_likely_seed, sq.seed_distribution,
          sq.status, sq.error_message,
          sq.created_at, sq.updated_at
        FROM scenario_questions sq
        LEFT JOIN teams t1 ON t1.teamid = sq.team_id
        LEFT JOIN teams t2 ON t2.teamid = sq.opponent_team_id
        WHERE sq.id = ${scenarioId}
          AND sq.entity_type = 'season'
          AND sq.entity_id = ${seasonId}
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
          AND entity_type = 'season'
          AND entity_id = ${seasonId}
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
    console.error("[scenario detail API]", err);
    return res.status(500).json({ error: message });
  }
}
