import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  const teamId = parseInt(String(Array.isArray(req.query.teamId) ? req.query.teamId[0] : req.query.teamId), 10);

  if (!Number.isFinite(seasonId) || !Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Invalid season or team id" });
  }

  if (req.method === "DELETE") {
    try {
      const rows = await sql`
        DELETE FROM season_teams
        WHERE season_id = ${seasonId} AND team_id = ${teamId}
        RETURNING team_id
      `;
      if (!rows.length) return res.status(404).json({ error: "Team not in this season" });
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[seasons/[id]/teams/[teamId]] error", err);
      return res.status(500).json({ error: err.message ?? "Server error" });
    }
  }

  res.setHeader("Allow", ["DELETE"]);
  return res.status(405).end("Method Not Allowed");
}
