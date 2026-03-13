import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/requireSession";

const SETTINGS_KEYS = ["max_simulations", "require_user_approval"] as const;
type SettingsKey = (typeof SETTINGS_KEYS)[number];

const DEFAULTS: Record<SettingsKey, string> = {
  max_simulations: "10000",
  require_user_approval: "false",
};

async function getSetting(key: SettingsKey): Promise<string> {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows.length ? rows[0].value : DEFAULTS[key];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    if (req.method === "GET") {
      const maxSim = parseInt(await getSetting("max_simulations"), 10);
      const requireApproval = (await getSetting("require_user_approval")) === "true";
      return res.status(200).json({
        settings: { max_simulations: maxSim, require_user_approval: requireApproval },
      });
    }

    if (req.method === "PUT") {
      const body = req.body ?? {};

      // Handle max_simulations if provided
      if (body.max_simulations !== undefined) {
        const val = parseInt(body.max_simulations, 10);
        if (!Number.isFinite(val) || val < 100 || val > 1_000_000) {
          return res.status(400).json({ error: "max_simulations must be between 100 and 1,000,000" });
        }
        const strVal = String(val);
        await sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('max_simulations', ${strVal}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }

      // Handle require_user_approval if provided
      if (body.require_user_approval !== undefined) {
        const boolVal = body.require_user_approval === true || body.require_user_approval === "true";
        const strVal = boolVal ? "true" : "false";
        await sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('require_user_approval', ${strVal}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }

      // Return current settings
      const maxSim = parseInt(await getSetting("max_simulations"), 10);
      const requireApproval = (await getSetting("require_user_approval")) === "true";
      return res.status(200).json({
        settings: { max_simulations: maxSim, require_user_approval: requireApproval },
      });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[admin settings]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ error: message });
  }
}
