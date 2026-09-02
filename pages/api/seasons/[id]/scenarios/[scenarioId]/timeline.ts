import type { NextApiRequest, NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth/requireSession";
import { reserveTimelineRun } from "@/lib/scenarios/runLimit";
import {
  getSeasonPlayedDates,
  samplePlayedDates,
  getTimelineMaxPoints,
  getTimelineSimulations,
  runScenarioTimeline,
  type TimelineScenario,
} from "@/lib/scenarios/timeline";

function parseIds(req: NextApiRequest): { seasonId: number; scenarioId: number } | null {
  const rawSeason = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const rawScenario = Array.isArray(req.query.scenarioId) ? req.query.scenarioId[0] : req.query.scenarioId;
  const seasonId = parseInt(String(rawSeason ?? ""), 10);
  const scenarioId = parseInt(String(rawScenario ?? ""), 10);
  if (!Number.isFinite(seasonId) || !Number.isFinite(scenarioId)) return null;
  return { seasonId, scenarioId };
}

/** Confirm the scenario exists and belongs to this season. */
async function loadScenario(seasonId: number, scenarioId: number) {
  const rows = await sql`
    SELECT * FROM scenario_questions
    WHERE id = ${scenarioId}
      AND entity_type = 'season'
      AND entity_id = ${seasonId}
  `;
  return rows.length ? rows[0] : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ids = parseIds(req);
  if (!ids) return res.status(400).json({ error: "Invalid ids" });
  const { seasonId, scenarioId } = ids;

  try {
    // GET — read the timeline and whatever points have landed so far. Ungated,
    // matching the scenario read routes.
    if (req.method === "GET") {
      const timelines = await sql`
        SELECT t.*
        FROM scenario_timelines t
        JOIN scenario_questions sq ON sq.id = t.scenario_id
        WHERE t.scenario_id = ${scenarioId}
          AND sq.entity_type = 'season'
          AND sq.entity_id = ${seasonId}
      `;
      if (timelines.length === 0) {
        return res.status(200).json({ timeline: null, points: [] });
      }
      const timeline = timelines[0];
      const points = await sql`
        SELECT point_index, as_of_date::text AS as_of_date, is_possible, probability,
               most_likely_seed, most_likely_opponent_id, seed_distribution,
               matchup_distribution, simulations_run, error_message
        FROM scenario_timeline_points
        WHERE timeline_id = ${timeline.id}
        ORDER BY point_index
      `;
      return res.status(200).json({ timeline, points });
    }

    if (req.method === "DELETE") {
      const scenario = await loadScenario(seasonId, scenarioId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });
      // Points cascade.
      await sql`DELETE FROM scenario_timelines WHERE scenario_id = ${scenarioId}`;
      return res.status(200).json({ deleted: true });
    }

    if (req.method === "POST") {
      // A timeline is one full analysis per plotted date, so it gets its own
      // (much smaller) daily allowance rather than drawing on the scenario cap.
      const session = await requireSession(req, res);
      if (!session) return;
      const gate = await reserveTimelineRun(session.user.id, session.user.role === "admin");
      if (!gate.allowed) {
        return res.status(429).json({
          error: `Daily timeline limit reached (${gate.limit} per day). Try again later.`,
          code: "rate_limited",
          limit: gate.limit,
        });
      }

      const scenario = await loadScenario(seasonId, scenarioId);
      if (!scenario) return res.status(404).json({ error: "Scenario not found" });

      const maxPoints = await getTimelineMaxPoints();
      // Always span the whole regular season — first completed game date to last —
      // even when the scenario itself is pinned to an as-of date. The point of the
      // chart is the full arc; the scenario's own as-of date only fixes the single
      // number on the card above it.
      const dates = samplePlayedDates(await getSeasonPlayedDates(seasonId), maxPoints);

      if (dates.length < 2) {
        return res.status(400).json({
          error: "Not enough completed game dates to plot a timeline. At least two are needed.",
        });
      }

      const simBudget = await getTimelineSimulations();

      const upserted = await sql`
        INSERT INTO scenario_timelines (scenario_id, status, points_total, points_done)
        VALUES (${scenarioId}, 'running', ${dates.length}, 0)
        ON CONFLICT (scenario_id) DO UPDATE
          SET status = 'running',
              points_total = EXCLUDED.points_total,
              points_done = 0,
              error_message = NULL,
              updated_at = NOW()
        RETURNING *
      `;
      const timeline = upserted[0];
      await sql`DELETE FROM scenario_timeline_points WHERE timeline_id = ${timeline.id}`;

      // Return immediately — the client polls GET for partial results.
      res.status(202).json({ timeline, points: [] });

      waitUntil((async () => {
        try {
          await runScenarioTimeline(
            seasonId,
            scenario as TimelineScenario,
            dates,
            simBudget,
            async (index, asOfDate, result, error) => {
              await sql`
                INSERT INTO scenario_timeline_points (
                  timeline_id, point_index, as_of_date, is_possible, probability,
                  most_likely_seed, most_likely_opponent_id, seed_distribution,
                  matchup_distribution, simulations_run, error_message
                ) VALUES (
                  ${timeline.id}, ${index}, ${asOfDate},
                  ${result?.isPossible ?? null},
                  ${result?.probability ?? null},
                  ${result?.mostLikelySeed ?? null},
                  ${result?.mostLikelyOpponentId ?? null},
                  ${result?.seedDistribution ? JSON.stringify(result.seedDistribution) : null}::jsonb,
                  ${result?.matchupDistribution ? JSON.stringify(result.matchupDistribution) : null}::jsonb,
                  ${result?.simulationsRun ?? 0},
                  ${error}
                )
                ON CONFLICT (timeline_id, point_index) DO NOTHING
              `;
              await sql`
                UPDATE scenario_timelines
                SET points_done = ${index + 1}, updated_at = NOW()
                WHERE id = ${timeline.id}
              `.catch(() => {});
            }
          );

          await sql`
            UPDATE scenario_timelines
            SET status = 'completed', error_message = NULL, updated_at = NOW()
            WHERE id = ${timeline.id}
          `;
        } catch (err: unknown) {
          // Stored on the timeline and shown to the user as why the plot failed —
          // keep the real reason (same rationale as the scenario run route).
          const msg = err instanceof Error ? err.message : "Timeline failed";
          console.error("[scenario timeline]", err);
          await sql`
            UPDATE scenario_timelines
            SET status = 'error', error_message = ${msg}, updated_at = NOW()
            WHERE id = ${timeline.id}
          `.catch(() => {});
        }
      })());
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[scenario timeline API]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
