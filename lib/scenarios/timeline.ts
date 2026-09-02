/**
 * Scenario timelines — replay one scenario question at successive as-of dates.
 *
 * The engine already supports as-of analysis (it filters both the completed-game
 * set and the remaining-game set by date), so a timeline is just the same question
 * asked repeatedly. Each point is a full analysis, so the per-point simulation
 * budget is deliberately much smaller than a one-off scenario run.
 *
 * Seasons only: tournaments run over one or two days, which would yield a
 * one- or two-point chart.
 */

import { sql } from "@/lib/db";
import {
  runScenarioAnalysis,
  runFirstRoundMatchupAnalysis,
  runMostLikelySeedAnalysis,
  runMostLikelyMatchupAnalysis,
  type EngineResult,
} from "./engine";

export const DEFAULT_TIMELINE_MAX_POINTS = 12;
export const DEFAULT_TIMELINE_SIMULATIONS = 2000;

/** The subset of a scenario_questions row a timeline needs. */
export type TimelineScenario = {
  question_type: string;
  team_id: number;
  target_seed: number | null;
  seed_mode: string | null;
  opponent_team_id: number | null;
  simulation_method: string | null;
};

/** Read a positive integer app_settings value, falling back on any error. */
async function readSetting(key: string, fallback: number): Promise<number> {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
    const n = rows.length ? parseInt(rows[0].value, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function getTimelineMaxPoints(): Promise<number> {
  return readSetting("scenario_timeline_max_points", DEFAULT_TIMELINE_MAX_POINTS);
}

export async function getTimelineSimulations(): Promise<number> {
  return readSetting("scenario_timeline_simulations", DEFAULT_TIMELINE_SIMULATIONS);
}

/**
 * Distinct dates on which a regular-season game actually finished, ascending.
 * Uses the season settled-status rule from lib/standings (4 Final, 6/7 forfeit);
 * on the season side a NULL gamestatusid means unplayed, so no COALESCE here.
 * The ::text cast sidesteps the Date-vs-string normalization the standings
 * fetchers have to do on driver-returned dates.
 */
export async function getSeasonPlayedDates(seasonId: number): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT gamedate::text AS d
    FROM season_games
    WHERE season_id = ${seasonId}
      AND game_type = 'regular'
      AND gamestatusid IN (4, 6, 7)
      AND gamedate IS NOT NULL
    ORDER BY d
  `;
  return rows.map((r) => r.d as string);
}

/**
 * Reduce a list of dates to at most `max` points, spread evenly and always
 * keeping the first and last. The last played date is the current state — as-of
 * a date after which nothing has been played is the same analysis as "now" — so
 * no separate present-day point is needed.
 */
export function samplePlayedDates(dates: string[], max: number): string[] {
  if (max < 2 || dates.length <= max) return [...dates];

  const out: string[] = [];
  const step = (dates.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    const d = dates[idx];
    // Rounding can land on the same index twice; keep the series strictly increasing.
    if (out[out.length - 1] !== d) out.push(d);
  }
  return out;
}

export type TimelinePointCallback = (
  index: number,
  asOfDate: string,
  result: EngineResult | null,
  error: string | null
) => Promise<void>;

/** Dispatch one as-of analysis for the scenario's question type. */
function analyzeAt(
  seasonId: number,
  scenario: TimelineScenario,
  asOfDate: string,
  simBudget: number
): Promise<EngineResult> {
  const method: "monte_carlo" | "pythagorean" =
    scenario.simulation_method === "pythagorean" ? "pythagorean" : "monte_carlo";

  switch (scenario.question_type) {
    case "first_round_matchup":
      return runFirstRoundMatchupAnalysis(
        seasonId,
        scenario.team_id,
        scenario.opponent_team_id as number,
        undefined,
        asOfDate,
        method,
        simBudget
      );
    case "most_likely_seed":
      return runMostLikelySeedAnalysis(seasonId, scenario.team_id, undefined, asOfDate, method, simBudget);
    case "most_likely_matchup":
      return runMostLikelyMatchupAnalysis(seasonId, scenario.team_id, undefined, asOfDate, method, simBudget);
    default:
      return runScenarioAnalysis(
        seasonId,
        scenario.team_id,
        scenario.target_seed as number,
        (scenario.seed_mode ?? "or_better") as "exact" | "or_better" | "or_worse",
        undefined,
        asOfDate,
        method,
        simBudget
      );
  }
}

/**
 * Run the scenario once per date, sequentially, reporting each point as it lands.
 *
 * Sequential rather than pooled: it bounds peak memory (each analysis holds a full
 * standings dataset) and lets partial results stream to the polling client.
 *
 * A single point can legitimately fail — runPythagoreanAnalysis throws when any
 * team has no completed games, which is common at the earliest dates — so failures
 * are reported per point instead of aborting the whole timeline.
 */
export async function runScenarioTimeline(
  seasonId: number,
  scenario: TimelineScenario,
  dates: string[],
  simBudget: number,
  onPoint: TimelinePointCallback
): Promise<void> {
  for (let i = 0; i < dates.length; i++) {
    const asOfDate = dates[i];
    try {
      const result = await analyzeAt(seasonId, scenario, asOfDate, simBudget);
      await onPoint(i, asOfDate, result, null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      await onPoint(i, asOfDate, null, msg);
    }
  }
}
