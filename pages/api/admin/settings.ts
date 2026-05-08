import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

const SETTINGS_KEYS = ["max_simulations", "require_user_approval", "mapbox_enabled", "usps_enabled", "itunes_enabled"] as const;
type SettingsKey = (typeof SETTINGS_KEYS)[number];

const DEFAULTS: Record<SettingsKey, string> = {
  max_simulations: "10000",
  require_user_approval: "false",
  mapbox_enabled: "false",
  usps_enabled: "true",
  itunes_enabled: "true",
};

async function getSetting(key: SettingsKey): Promise<string> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows.length ? rows[0].value : DEFAULTS[key];
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
    require_user_approval: (await getSetting("require_user_approval")) === "true",
    mapbox_enabled: (await getSetting("mapbox_enabled")) === "true",
    usps_enabled: (await getSetting("usps_enabled")) !== "false",
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

      if (body.max_simulations !== undefined) {
        const val = parseInt(body.max_simulations, 10);
        if (!Number.isFinite(val) || val < 100 || val > 1_000_000) {
          return res.status(400).json({ error: "max_simulations must be between 100 and 1,000,000" });
        }
        await sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('max_simulations', ${String(val)}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }

      if (body.require_user_approval !== undefined) await upsertBool("require_user_approval", body.require_user_approval);
      if (body.mapbox_enabled !== undefined)        await upsertBool("mapbox_enabled", body.mapbox_enabled);
      if (body.usps_enabled !== undefined)          await upsertBool("usps_enabled", body.usps_enabled);
      if (body.itunes_enabled !== undefined)        await upsertBool("itunes_enabled", body.itunes_enabled);

      return res.status(200).json({ settings: await readAll() });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[admin settings]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ error: message });
  }
}
