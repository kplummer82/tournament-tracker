import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentid = Number(req.query.tournamentid);
  const gameId = Number(req.query.gameId);
  if (!Number.isFinite(tournamentid)) return res.status(400).json({ error: "Invalid tournament id" });
  if (!Number.isFinite(gameId)) return res.status(400).json({ error: "Invalid game id" });

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = await pool.connect();
    try {
      // Pool games live in tournamentgames (poolgames_view is a view on top).
      const r = await client.query(
        `DELETE FROM tournamentgames WHERE id = $1 AND tournamentid = $2 AND poolorbracket = 'Pool'`,
        [gameId, tournamentid]
      );
      if (!r.rowCount) {
        return res.status(404).json({ error: "Game not found" });
      }
      return res.status(200).json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete game" });
  }
}
