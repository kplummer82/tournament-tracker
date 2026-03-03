import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function parseId(val: string | string[] | undefined): number | null {
  const raw = Array.isArray(val) ? val[0] : val;
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentId = parseId(req.query.tournamentid);
  const teamId = parseId(req.query.teamId);

  if (!tournamentId) return res.status(400).json({ error: "Invalid tournamentid" });
  if (!teamId) return res.status(400).json({ error: "Invalid teamId" });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const client = await pool.connect();
    try {
      const poolGamesResult = await client.query(
        `SELECT COUNT(*) AS count FROM tournamentgames
         WHERE tournamentid = $1
           AND (home = $2 OR away = $2)
           AND poolorbracket = 'Pool'`,
        [tournamentId, teamId]
      );

      const bracketAssignmentsResult = await client.query(
        `SELECT COUNT(*) AS count FROM bracket_assignments ba
         JOIN tournament_bracket tb ON tb.tournament_id = ba.tournament_id
         WHERE tb.tournament_id = $1 AND ba.team_id = $2`,
        [tournamentId, teamId]
      );

      const poolGames = parseInt(poolGamesResult.rows[0]?.count || "0", 10);
      const bracketAssignments = parseInt(bracketAssignmentsResult.rows[0]?.count || "0", 10);

      return res.status(200).json({
        poolGames,
        bracketAssignments,
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[team impact analysis]", err);
    return res.status(500).json({ error: message });
  }
}
