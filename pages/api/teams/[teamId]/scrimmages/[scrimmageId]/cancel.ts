import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { requireTeamAccess } from "@/lib/auth/requireSession";

const CANCELED_STATUS_ID = 8;

const SCHEDULED_STATUS_ID = 1;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const teamId = parseInt(req.query.teamId as string, 10);
  const scrimmageId = parseInt(req.query.scrimmageId as string, 10);
  if (isNaN(teamId) || isNaN(scrimmageId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  const session = await requireTeamAccess(req, res, teamId);
  if (!session) return;

  const existing = await sql`
    SELECT id FROM scrimmages
    WHERE id = ${scrimmageId}
      AND (team_id = ${teamId} OR opponent_team_id = ${teamId})
  `;
  if (existing.length === 0) {
    return res.status(404).json({ error: "Scrimmage not found" });
  }

  if (req.method === "POST") {
    const noteRaw = req.body?.note;
    const note = typeof noteRaw === "string" ? noteRaw.trim() || null : null;

    try {
      const rows = await sql`
        UPDATE scrimmages SET
          gamestatusid        = ${CANCELED_STATUS_ID},
          cancellation_note   = ${note},
          canceled_by_team_id = ${teamId},
          canceled_at         = NOW()
        WHERE id = ${scrimmageId}
        RETURNING *
      `;
      return res.status(200).json({ scrimmage: rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages/cancel] POST error", err);
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    try {
      const rows = await sql`
        UPDATE scrimmages SET
          gamestatusid        = ${SCHEDULED_STATUS_ID},
          cancellation_note   = NULL,
          canceled_by_team_id = NULL,
          canceled_at         = NULL
        WHERE id = ${scrimmageId}
        RETURNING *
      `;
      return res.status(200).json({ scrimmage: rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      console.error("[scrimmages/cancel] DELETE error", err);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
