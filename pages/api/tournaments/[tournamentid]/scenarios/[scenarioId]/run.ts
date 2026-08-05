import type { NextApiRequest, NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";
import { reserveScenarioRun } from "@/lib/scenarios/runLimit";
import { runTournamentScenarioAnalysis, runTournamentFirstRoundMatchupAnalysis, runTournamentMostLikelySeedAnalysis, runTournamentMostLikelyMatchupAnalysis } from "@/lib/scenarios/engine";

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
    // Scenarios are open to any logged-in user, but each run costs compute — cap
    // non-admins to a configurable daily limit (admins uncapped).
    const session = await requireSession(req, res);
    if (!session) return;
    const gate = await reserveScenarioRun(session.user.id, session.user.role === "admin");
    if (!gate.allowed) {
      return res.status(429).json({
        error: `Daily scenario limit reached (${gate.limit} per day). Try again later.`,
        code: "rate_limited",
        limit: gate.limit,
      });
    }

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

    // Background execution — waitUntil keeps the function alive after the 202 response
    waitUntil((async () => {
      try {
        const onProgress = async (simRun: number) => {
          await sql`
            UPDATE scenario_questions
            SET simulations_run = ${simRun}, updated_at = NOW()
            WHERE id = ${scenarioId}
          `.catch(() => {});
        };

        const asOfDate = scenario.as_of_date ?? undefined;
        const simulationMethod: "monte_carlo" | "pythagorean" =
          scenario.simulation_method === "pythagorean" ? "pythagorean" : "monte_carlo";
        const includeInProgress = scenario.include_in_progress === true;

        const result = scenario.question_type === "first_round_matchup"
          ? await runTournamentFirstRoundMatchupAnalysis(
              tournamentId,
              scenario.team_id,
              scenario.opponent_team_id,
              onProgress,
              asOfDate,
              simulationMethod,
              includeInProgress
            )
          : scenario.question_type === "most_likely_seed"
          ? await runTournamentMostLikelySeedAnalysis(tournamentId, scenario.team_id, onProgress, asOfDate, simulationMethod, includeInProgress)
          : scenario.question_type === "most_likely_matchup"
          ? await runTournamentMostLikelyMatchupAnalysis(tournamentId, scenario.team_id, onProgress, asOfDate, simulationMethod, includeInProgress)
          : await runTournamentScenarioAnalysis(
              tournamentId,
              scenario.team_id,
              scenario.target_seed,
              scenario.seed_mode as "exact" | "or_better",
              onProgress,
              asOfDate,
              simulationMethod,
              includeInProgress
            );

        const sampleJson = result.sampleWinningScenario !== null
          ? JSON.stringify(result.sampleWinningScenario)
          : null;
        const distJson = result.seedDistribution !== null
          ? JSON.stringify(result.seedDistribution)
          : null;
        const matchupDistJson = result.matchupDistribution
          ? JSON.stringify(result.matchupDistribution)
          : null;

        await sql`
          UPDATE scenario_questions
          SET is_possible = ${result.isPossible},
              probability = ${result.probability},
              simulations_run = ${result.simulationsRun},
              sample_scenario = ${sampleJson}::jsonb,
              most_likely_seed = ${result.mostLikelySeed},
              seed_distribution = ${distJson}::jsonb,
              matchup_distribution = ${matchupDistJson}::jsonb,
              most_likely_opponent_id = ${result.mostLikelyOpponentId ?? null},
              status = 'completed',
              error_message = NULL,
              updated_at = NOW()
          WHERE id = ${scenarioId}
        `;
      } catch (err: unknown) {
        // Stored in scenario_questions.error_message and shown to the user as
        // why their analysis failed — keep the real reason (not an HTTP leak).
        const msg = err instanceof Error ? err.message : "Analysis failed";
        console.error("[tournament scenario run]", err);
        await sql`
          UPDATE scenario_questions
          SET status = 'error', error_message = ${msg}, updated_at = NOW()
          WHERE id = ${scenarioId}
        `.catch(() => {});
      }
    })());
  } catch (err: unknown) {
    const message = "Server error";
    console.error("[tournament scenario run API]", err);
    return res.status(500).json({ error: message });
  }
}
