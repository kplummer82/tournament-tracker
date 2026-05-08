import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

// Public endpoint — no auth required.
// Returns only client-safe feature flags (not sensitive settings like max_simulations).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const rows = await sql`
      SELECT key, value FROM app_settings
      WHERE key IN ('itunes_enabled')
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return res.status(200).json({
      itunes_enabled: (map.itunes_enabled ?? "true") !== "false",
    });
  } catch (err: unknown) {
    console.error("[settings/public]", err);
    // Fail open — clients treat all features as enabled on error
    return res.status(200).json({ itunes_enabled: true });
  }
}
