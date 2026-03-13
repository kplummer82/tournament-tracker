import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentid } = req.query as { tournamentid?: string };
  const tid = Number(Array.isArray(tournamentid) ? tournamentid[0] : tournamentid);
  if (!tid || Number.isNaN(tid)) return res.status(400).json({ error: "Invalid tournament id" });

  try {
    const client = await pool.connect();
    try {
      // Pull from your view so we only show teams already added to the tournament.
      // Join tournamentteams to include pool_group for client-side filtering.
      const q = `
        SELECT tv.teamid AS id, tv.name, tt.pool_group
        FROM tournamentteams_view tv
        JOIN tournamentteams tt ON tt.teamid = tv.teamid AND tt.tournamentid = tv.tournamentid
        WHERE tv.tournamentid = $1
        ORDER BY tv.name
      `;
      const r = await client.query(q, [tid]);
      return res.status(200).json({ teams: r.rows }); // [{id, name, pool_group}]
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("teams/options error:", e);
    return res.status(500).json({ error: "Failed to load teams" });
  }
}
