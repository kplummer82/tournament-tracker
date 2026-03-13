import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseTournamentId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseTournamentId(req);
  if (!tournamentId) return res.status(400).json({ error: "Invalid tournament id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sq.id, sq.entity_type, sq.entity_id, sq.question_type,
          sq.team_id, t.name AS team_name,
          sq.target_seed, sq.seed_mode,
          sq.is_possible, sq.probability, sq.simulations_run,
          sq.status, sq.error_message,
          sq.created_at, sq.updated_at
        FROM scenario_questions sq
        LEFT JOIN teams t ON t.teamid = sq.team_id
        WHERE sq.entity_type = 'tournament' AND sq.entity_id = ${tournamentId}
        ORDER BY sq.created_at DESC
      `;
      return res.status(200).json({ scenarios: rows });
    }

    if (req.method === "POST") {
      const { teamId, targetSeed, seedMode } = req.body ?? {};

      if (!teamId || !targetSeed) {
        return res.status(400).json({ error: "teamId and targetSeed are required" });
      }

      const mode = seedMode === "exact" ? "exact" : "or_better";
      const seed = parseInt(targetSeed, 10);
      if (!Number.isFinite(seed) || seed < 1) {
        return res.status(400).json({ error: "targetSeed must be a positive integer" });
      }

      // Validate team is in this tournament
      const teamCheck = await sql`
        SELECT 1 FROM tournamentteams WHERE tournamentid = ${tournamentId} AND teamid = ${teamId}
      `;
      if (teamCheck.length === 0) {
        return res.status(400).json({ error: "Team is not in this tournament" });
      }

      // Validate seed is within range
      const teamCount = await sql`
        SELECT COUNT(*)::int AS count FROM tournamentteams WHERE tournamentid = ${tournamentId}
      `;
      if (seed > (teamCount[0]?.count ?? 0)) {
        return res.status(400).json({ error: "targetSeed exceeds number of teams in tournament" });
      }

      const rows = await sql`
        INSERT INTO scenario_questions (entity_type, entity_id, team_id, target_seed, seed_mode)
        VALUES ('tournament', ${tournamentId}, ${teamId}, ${seed}, ${mode})
        RETURNING *
      `;

      return res.status(201).json({ scenario: rows[0] });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament scenarios API]", err);
    return res.status(500).json({ error: message });
  }
}
