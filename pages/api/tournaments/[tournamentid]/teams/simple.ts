import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentid } = req.query as { tournamentid?: string };
  const tid = Number(tournamentid);
  if (!tid || Number.isNaN(tid)) return res.status(400).json({ error: "Invalid tournament id" });
  try {
    const client = await pool.connect();
    try {
      const q = `
        SELECT tt.teamid AS id, t.name
        FROM tournamentteams tt
        JOIN teams t ON t.id = tt.teamid
        WHERE tt.tournamentid = $1
        ORDER BY t.name
      `;
      const r = await client.query(q, [tid]);
      return res.status(200).json({ teams: r.rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load teams" });
  }
}
