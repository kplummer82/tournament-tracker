import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { runScenarioAnalysis, runFirstRoundMatchupAnalysis } from "@/lib/scenarios/engine";

function parseIds(req: NextApiRequest): { seasonId: number; scenarioId: number } | null {
  const rawSeason = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const rawScenario = Array.isArray(req.query.scenarioId) ? req.query.scenarioId[0] : req.query.scenarioId;
  const seasonId = parseInt(String(rawSeason ?? ""), 10);
  const scenarioId = parseInt(String(rawScenario ?? ""), 10);
  if (!Number.isFinite(seasonId) || !Number.isFinite(scenarioId)) return null;
  return { seasonId, scenarioId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ids = parseIds(req);
  if (!ids) return res.status(400).json({ error: "Invalid ids" });
  const { seasonId, scenarioId } = ids;

  try {
    // Fetch the scenario
    const rows = await sql`
      SELECT * FROM scenario_questions
      WHERE id = ${scenarioId}
        AND entity_type = 'season'
        AND entity_id = ${seasonId}
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const scenario = rows[0];

    // Mark as running
    await sql`
      UPDATE scenario_questions
      SET status = 'running', simulations_run = 0, error_message = NULL, updated_at = NOW()
      WHERE id = ${scenarioId}
    `;

    // Return immediately — run analysis in background
    res.status(202).json({ scenario: { ...scenario, status: "running" } });

    // Background execution
    (async () => {
      try {
        const onProgress = async (simRun: number) => {
          await sql`
            UPDATE scenario_questions
            SET simulations_run = ${simRun}, updated_at = NOW()
            WHERE id = ${scenarioId}
          `.catch(() => {});
        };

        const result = scenario.question_type === "first_round_matchup"
          ? await runFirstRoundMatchupAnalysis(
              seasonId,
              scenario.team_id,
              scenario.opponent_team_id,
              onProgress
            )
          : await runScenarioAnalysis(
              seasonId,
              scenario.team_id,
              scenario.target_seed,
              scenario.seed_mode as "exact" | "or_better",
              onProgress
            );

        await sql`
          UPDATE scenario_questions
          SET is_possible = ${result.isPossible},
              probability = ${result.probability},
              simulations_run = ${result.simulationsRun},
              status = 'completed',
              error_message = NULL,
              updated_at = NOW()
          WHERE id = ${scenarioId}
        `;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        console.error("[scenario run]", err);
        await sql`
          UPDATE scenario_questions
          SET status = 'error', error_message = ${msg}, updated_at = NOW()
          WHERE id = ${scenarioId}
        `.catch(() => {});
      }
    })();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[scenario run API]", err);
    return res.status(500).json({ error: message });
  }
}
