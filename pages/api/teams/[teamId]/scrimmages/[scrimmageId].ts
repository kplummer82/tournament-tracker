import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function normalizeTime(t: unknown): string | null {
  if (typeof t !== "string" || !t.trim()) return null;
  return t.trim();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const teamId = parseInt(req.query.teamId as string, 10);
  const scrimmageId = parseInt(req.query.scrimmageId as string, 10);

  if (isNaN(teamId) || isNaN(scrimmageId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  /* ── PATCH ───────────────────────────────────────────────────── */
  if (req.method === "PATCH") {
    const {
      gamedate,
      gametime,
      opponent_team_id,
      opponent_name,
      location,
      notes,
      homescore,
      awayscore,
      gamestatusid,
    } = req.body ?? {};

    const hasOpponent =
      (typeof opponent_team_id === "number" && !isNaN(opponent_team_id)) ||
      (typeof opponent_name === "string" && opponent_name.trim().length > 0);

    if (!hasOpponent) {
      return res.status(400).json({
        error: "opponent_team_id or opponent_name is required",
      });
    }

    const gtime = normalizeTime(gametime);

    try {
      const rows = await sql`
        UPDATE scrimmages SET
          gamedate         = ${gamedate ?? null},
          gametime         = ${gtime},
          opponent_team_id = ${typeof opponent_team_id === "number" ? opponent_team_id : null},
          opponent_name    = ${typeof opponent_name === "string" ? opponent_name.trim() || null : null},
          location         = ${typeof location === "string" ? location.trim() || null : null},
          notes            = ${typeof notes === "string" ? notes.trim() || null : null},
          homescore        = ${homescore ?? null},
          awayscore        = ${awayscore ?? null},
          gamestatusid     = ${gamestatusid ?? null}
        WHERE id = ${scrimmageId} AND team_id = ${teamId}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ error: "Scrimmage not found" });
      return res.status(200).json({ scrimmage: rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages/id] PATCH error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── DELETE ──────────────────────────────────────────────────── */
  if (req.method === "DELETE") {
    try {
      const rows = await sql`
        DELETE FROM scrimmages
        WHERE id = ${scrimmageId} AND team_id = ${teamId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Scrimmage not found" });
      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages/id] DELETE error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
