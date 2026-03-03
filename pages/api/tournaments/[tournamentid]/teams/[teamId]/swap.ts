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

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const newTeamId = parseId(body.newTeamId);

    if (!newTeamId) {
      return res.status(400).json({ error: "newTeamId is required" });
    }

    if (newTeamId === teamId) {
      return res.status(400).json({ error: "Cannot swap a team with itself" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const newTeamExists = await client.query(
        `SELECT teamid FROM teams WHERE teamid = $1`,
        [newTeamId]
      );
      if (newTeamExists.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Replacement team does not exist" });
      }

      const alreadyEnrolled = await client.query(
        `SELECT teamid FROM tournamentteams WHERE tournamentid = $1 AND teamid = $2`,
        [tournamentId, newTeamId]
      );
      if (alreadyEnrolled.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Replacement team is already enrolled in this tournament" });
      }

      const oldTeamData = await client.query(
        `SELECT pool_group FROM tournamentteams WHERE tournamentid = $1 AND teamid = $2`,
        [tournamentId, teamId]
      );
      if (oldTeamData.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Team to replace not found in this tournament" });
      }

      const poolGroup = oldTeamData.rows[0].pool_group;

      const bracketResult = await client.query(
        `UPDATE bracket_assignments
         SET team_id = $1
         WHERE tournament_id = $2 AND team_id = $3`,
        [newTeamId, tournamentId, teamId]
      );

      const homeGamesResult = await client.query(
        `UPDATE tournamentgames
         SET home = $1
         WHERE tournamentid = $2 AND home = $3`,
        [newTeamId, tournamentId, teamId]
      );

      const awayGamesResult = await client.query(
        `UPDATE tournamentgames
         SET away = $1
         WHERE tournamentid = $2 AND away = $3`,
        [newTeamId, tournamentId, teamId]
      );

      await client.query(
        `DELETE FROM tournamentteams WHERE tournamentid = $1 AND teamid = $2`,
        [tournamentId, teamId]
      );

      await client.query(
        `INSERT INTO tournamentteams (tournamentid, teamid, pool_group)
         VALUES ($1, $2, $3)`,
        [tournamentId, newTeamId, poolGroup]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        swapped: true,
        poolGamesUpdated: (homeGamesResult.rowCount || 0) + (awayGamesResult.rowCount || 0),
        bracketAssignmentsUpdated: bracketResult.rowCount || 0,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[team swap]", err);
    return res.status(500).json({ error: message });
  }
}
