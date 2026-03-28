import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          sq.id, sq.entity_type, sq.entity_id, sq.question_type,
          sq.team_id, t1.name AS team_name,
          sq.opponent_team_id, t2.name AS opponent_team_name,
          sq.target_seed, sq.seed_mode,
          sq.is_possible, sq.probability, sq.simulations_run,
          sq.status, sq.error_message,
          sq.created_at, sq.updated_at
        FROM scenario_questions sq
        LEFT JOIN teams t1 ON t1.teamid = sq.team_id
        LEFT JOIN teams t2 ON t2.teamid = sq.opponent_team_id
        WHERE sq.entity_type = 'season' AND sq.entity_id = ${seasonId}
        ORDER BY sq.created_at DESC
      `;
      return res.status(200).json({ scenarios: rows });
    }

    if (req.method === "POST") {
      const { questionType, teamId, targetSeed, seedMode, opponentTeamId } = req.body ?? {};
      const qType = questionType === "first_round_matchup" ? "first_round_matchup" : "seed_achievable";

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }

      // Validate team is in this season
      const teamCheck = await sql`
        SELECT 1 FROM season_teams WHERE season_id = ${seasonId} AND team_id = ${teamId}
      `;
      if (teamCheck.length === 0) {
        return res.status(400).json({ error: "Team is not enrolled in this season" });
      }

      if (qType === "seed_achievable") {
        if (!targetSeed) {
          return res.status(400).json({ error: "targetSeed is required for seed_achievable" });
        }
        const mode = seedMode === "exact" ? "exact" : "or_better";
        const seed = parseInt(targetSeed, 10);
        if (!Number.isFinite(seed) || seed < 1) {
          return res.status(400).json({ error: "targetSeed must be a positive integer" });
        }
        const teamCount = await sql`
          SELECT COUNT(*)::int AS count FROM season_teams WHERE season_id = ${seasonId}
        `;
        if (seed > (teamCount[0]?.count ?? 0)) {
          return res.status(400).json({ error: "targetSeed exceeds number of teams in season" });
        }
        const rows = await sql`
          INSERT INTO scenario_questions (entity_type, entity_id, question_type, team_id, target_seed, seed_mode)
          VALUES ('season', ${seasonId}, 'seed_achievable', ${teamId}, ${seed}, ${mode})
          RETURNING *
        `;
        return res.status(201).json({ scenario: rows[0] });
      }

      // first_round_matchup
      if (!opponentTeamId) {
        return res.status(400).json({ error: "opponentTeamId is required for first_round_matchup" });
      }
      if (Number(teamId) === Number(opponentTeamId)) {
        return res.status(400).json({ error: "teamId and opponentTeamId must be different teams" });
      }
      const opponentCheck = await sql`
        SELECT 1 FROM season_teams WHERE season_id = ${seasonId} AND team_id = ${opponentTeamId}
      `;
      if (opponentCheck.length === 0) {
        return res.status(400).json({ error: "Opponent team is not enrolled in this season" });
      }
      const rows = await sql`
        INSERT INTO scenario_questions (entity_type, entity_id, question_type, team_id, opponent_team_id)
        VALUES ('season', ${seasonId}, 'first_round_matchup', ${teamId}, ${opponentTeamId})
        RETURNING *
      `;
      return res.status(201).json({ scenario: rows[0] });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[scenarios API]", err);
    return res.status(500).json({ error: message });
  }
}
