import { sql } from "@/lib/db";

// Per-user daily cap on scenario simulation runs. Scenarios are open to every
// logged-in user (a differentiating analytics feature), so this throttles
// cost/abuse rather than gating access. Admins are uncapped. The limits are
// configurable via app_settings (see /api/admin/settings).
//
// Two budgets are tracked separately via scenario_run_log.kind:
//   'scenario' — one ordinary as-of/current run
//   'timeline' — a scenario replayed across many as-of dates (far more compute,
//                so it gets its own, much smaller allowance)

export const DEFAULT_SCENARIO_DAILY_LIMIT = 20;
export const DEFAULT_TIMELINE_DAILY_LIMIT = 3;

/** Read a positive integer app_settings value, falling back on any error. */
async function readLimit(key: string, fallback: number): Promise<number> {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
    const n = rows.length ? parseInt(rows[0].value, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** Admin-configured daily scenario run limit, falling back to the default on any error. */
export async function getScenarioDailyRunLimit(): Promise<number> {
  return readLimit("scenario_daily_run_limit", DEFAULT_SCENARIO_DAILY_LIMIT);
}

/** Admin-configured daily timeline run limit, falling back to the default on any error. */
export async function getTimelineDailyRunLimit(): Promise<number> {
  return readLimit("timeline_daily_run_limit", DEFAULT_TIMELINE_DAILY_LIMIT);
}

export interface ScenarioRunReservation {
  allowed: boolean;
  limit: number;
  used: number;
}

/**
 * Check the caller's rolling-24h count for one run kind and, if under the limit,
 * record this run. Admins always pass and are not logged. There is a benign race
 * under heavy concurrency (two runs could both pass the count) — acceptable for a
 * soft cost throttle, not a security boundary.
 */
async function reserve(
  userId: string,
  isAdmin: boolean,
  kind: "scenario" | "timeline",
  limit: number
): Promise<ScenarioRunReservation> {
  if (isAdmin) return { allowed: true, limit: Infinity, used: 0 };

  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM scenario_run_log
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND created_at > NOW() - INTERVAL '24 hours'
  `;
  const used = rows[0]?.c ?? 0;
  if (used >= limit) return { allowed: false, limit, used };

  await sql`INSERT INTO scenario_run_log (user_id, kind) VALUES (${userId}, ${kind})`;
  return { allowed: true, limit, used: used + 1 };
}

export async function reserveScenarioRun(
  userId: string,
  isAdmin: boolean
): Promise<ScenarioRunReservation> {
  return reserve(userId, isAdmin, "scenario", await getScenarioDailyRunLimit());
}

export async function reserveTimelineRun(
  userId: string,
  isAdmin: boolean
): Promise<ScenarioRunReservation> {
  return reserve(userId, isAdmin, "timeline", await getTimelineDailyRunLimit());
}
