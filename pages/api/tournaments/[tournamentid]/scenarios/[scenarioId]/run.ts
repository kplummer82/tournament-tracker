import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { runTournamentScenarioAnalysis, runTournamentFirstRoundMatchupAnalysis } from "@/lib/scenarios/engine";

function parseIds(req: NextApiRequest): { tournamentId: number; scenarioId: number } | null {
  const rawT = Array.isArray(req.query.tournamentid) ? req.query.tournamentid[0] : req.query.tournamentid;
  const rawS = Array.isArray(req.query.scenarioId) ? req.query.scenarioId[0] : req.query.scenarioId;
  const tournamentId = parseInt(String(rawT ?? ""), 10);
  const scenarioId = parseInt(String(rawS ?? ""), 10);
  if (!Number.isFinite(tournamentId) || !Number.isFinite(scenarioId)) return null;
  return { tournamentId, scenarioId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ids = parseIds(req);
  if (!ids) return res.status(400).json({ error: "Invalid ids" });
  const { tournamentId, scenarioId } = ids;

  try {
    // Fetch the scenario
    const rows = await sql`
      SELECT * FROM scenario_questions
      WHERE id = ${scenarioId}
        AND entity_type = 'tournament'
        AND entity_id = ${tournamentId}
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
          ? await runTournamentFirstRoundMatchupAnalysis(
              tournamentId,
              scenario.team_id,
              scenario.opponent_team_id,
              onProgress
            )
          : await runTournamentScenarioAnalysis(
              tournamentId,
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
        console.error("[tournament scenario run]", err);
        await sql`
          UPDATE scenario_questions
          SET status = 'error', error_message = ${msg}, updated_at = NOW()
          WHERE id = ${scenarioId}
        `.catch(() => {});
      }
    })();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[tournament scenario run API]", err);
    return res.status(500).json({ error: message });
  }
}
