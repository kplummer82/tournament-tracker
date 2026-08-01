import { sql } from "@/lib/db";

// Per-user daily cap on scenario runs. Scenarios are open to every logged-in
// user (a differentiating analytics feature), so this throttles cost/abuse
// rather than gating access. Admins are uncapped. The limit is configurable via
// app_settings.scenario_daily_run_limit (see /api/admin/settings).

export const DEFAULT_SCENARIO_DAILY_LIMIT = 20;

/** Admin-configured daily run limit, falling back to the default on any error. */
export async function getScenarioDailyRunLimit(): Promise<number> {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'scenario_daily_run_limit'`;
    const n = rows.length ? parseInt(rows[0].value, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SCENARIO_DAILY_LIMIT;
  } catch {
    return DEFAULT_SCENARIO_DAILY_LIMIT;
  }
}

export interface ScenarioRunReservation {
  allowed: boolean;
  limit: number;
  used: number;
}

/**
 * Check the caller's rolling-24h run count and, if under the limit, record this
 * run. Admins always pass and are not logged. There is a benign race under
 * heavy concurrency (two runs could both pass the count) — acceptable for a
 * soft cost throttle, not a security boundary.
 */
export async function reserveScenarioRun(
  userId: string,
  isAdmin: boolean
): Promise<ScenarioRunReservation> {
  if (isAdmin) return { allowed: true, limit: Infinity, used: 0 };

  const limit = await getScenarioDailyRunLimit();
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM scenario_run_log
    WHERE user_id = ${userId}
      AND created_at > NOW() - INTERVAL '24 hours'
  `;
  const used = rows[0]?.c ?? 0;
  if (used >= limit) return { allowed: false, limit, used };

  await sql`INSERT INTO scenario_run_log (user_id) VALUES (${userId})`;
  return { allowed: true, limit, used: used + 1 };
}
