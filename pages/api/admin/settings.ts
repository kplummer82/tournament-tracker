import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

const SETTINGS_KEYS = [
  "max_simulations",
  "scenario_daily_run_limit",
  "timeline_daily_run_limit",
  "scenario_timeline_max_points",
  "scenario_timeline_simulations",
  "require_user_approval",
  "mapbox_enabled",
  "itunes_enabled",
] as const;
type SettingsKey = (typeof SETTINGS_KEYS)[number];

const DEFAULTS: Record<SettingsKey, string> = {
  max_simulations: "10000",
  scenario_daily_run_limit: "20",
  timeline_daily_run_limit: "3",
  scenario_timeline_max_points: "12",
  scenario_timeline_simulations: "2000",
  require_user_approval: "false",
  mapbox_enabled: "false",
  itunes_enabled: "true",
};

/** Bounds for each integer setting, enforced on PUT. */
const INT_RANGES: Partial<Record<SettingsKey, { min: number; max: number; label: string }>> = {
  max_simulations: { min: 100, max: 1_000_000, label: "max_simulations" },
  scenario_daily_run_limit: { min: 1, max: 10_000, label: "scenario_daily_run_limit" },
  timeline_daily_run_limit: { min: 1, max: 1_000, label: "timeline_daily_run_limit" },
  scenario_timeline_max_points: { min: 2, max: 60, label: "scenario_timeline_max_points" },
  scenario_timeline_simulations: { min: 100, max: 100_000, label: "scenario_timeline_simulations" },
};

async function getSetting(key: SettingsKey): Promise<string> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows.length ? rows[0].value : DEFAULTS[key];
}

/** Validate and upsert an integer setting. Returns an error message, or null on success. */
async function upsertInt(key: SettingsKey, raw: unknown): Promise<string | null> {
  const range = INT_RANGES[key];
  if (!range) return `${key} is not an integer setting`;
  const val = parseInt(String(raw), 10);
  if (!Number.isFinite(val) || val < range.min || val > range.max) {
    return `${range.label} must be between ${range.min.toLocaleString()} and ${range.max.toLocaleString()}`;
  }
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${String(val)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return null;
}

async function upsertBool(key: SettingsKey, raw: unknown) {
  const boolVal = raw === true || raw === "true";
  const strVal = boolVal ? "true" : "false";
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${strVal}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

async function readAll() {
  return {
    max_simulations: parseInt(await getSetting("max_simulations"), 10),
    scenario_daily_run_limit: parseInt(await getSetting("scenario_daily_run_limit"), 10),
    timeline_daily_run_limit: parseInt(await getSetting("timeline_daily_run_limit"), 10),
    scenario_timeline_max_points: parseInt(await getSetting("scenario_timeline_max_points"), 10),
    scenario_timeline_simulations: parseInt(await getSetting("scenario_timeline_simulations"), 10),
    require_user_approval: (await getSetting("require_user_approval")) === "true",
    mapbox_enabled: (await getSetting("mapbox_enabled")) === "true",
    itunes_enabled: (await getSetting("itunes_enabled")) !== "false",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    if (req.method === "GET") {
      return res.status(200).json({ settings: await readAll() });
    }

    if (req.method === "PUT") {
      const body = req.body ?? {};

      for (const key of Object.keys(INT_RANGES) as SettingsKey[]) {
        if (body[key] === undefined) continue;
        const error = await upsertInt(key, body[key]);
        if (error) return res.status(400).json({ error });
      }

      if (body.require_user_approval !== undefined) await upsertBool("require_user_approval", body.require_user_approval);
      if (body.mapbox_enabled !== undefined)        await upsertBool("mapbox_enabled", body.mapbox_enabled);
      if (body.itunes_enabled !== undefined)        await upsertBool("itunes_enabled", body.itunes_enabled);

      return res.status(200).json({ settings: await readAll() });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[admin settings]", err);
    const message = "Server error";
    return res.status(500).json({ error: message });
  }
}
