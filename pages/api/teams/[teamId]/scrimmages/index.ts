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
  if (isNaN(teamId)) return res.status(400).json({ error: "Invalid team ID" });

  /* ── GET ─────────────────────────────────────────────────────── */
  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT
          sc.*,
          ot.name                              AS team_name,
          COALESCE(opp.name, sc.opponent_name) AS opponent_display,
          gs.gamestatus                        AS gamestatus_label
        FROM scrimmages sc
        JOIN   teams ot  ON ot.teamid  = sc.team_id
        LEFT JOIN teams opp ON opp.teamid = sc.opponent_team_id
        LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
        WHERE sc.team_id = ${teamId}
        ORDER BY sc.gamedate NULLS LAST, sc.gametime NULLS LAST, sc.id
      `;
      return res.status(200).json({ scrimmages: rows });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages] GET error", err);
      return res.status(500).json({ error: msg });
    }
  }

  /* ── POST ────────────────────────────────────────────────────── */
  if (req.method === "POST") {
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
        INSERT INTO scrimmages
          (team_id, gamedate, gametime, opponent_team_id, opponent_name,
           location, notes, homescore, awayscore, gamestatusid)
        VALUES (
          ${teamId},
          ${gamedate ?? null},
          ${gtime},
          ${typeof opponent_team_id === "number" ? opponent_team_id : null},
          ${typeof opponent_name === "string" ? opponent_name.trim() || null : null},
          ${typeof location === "string" ? location.trim() || null : null},
          ${typeof notes === "string" ? notes.trim() || null : null},
          ${homescore ?? null},
          ${awayscore ?? null},
          ${gamestatusid ?? null}
        )
        RETURNING *
      `;
      return res.status(201).json({ scrimmage: rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages] POST error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
