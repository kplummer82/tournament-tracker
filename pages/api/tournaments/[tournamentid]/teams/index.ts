// pages/api/tournaments/[tournamentid]/teams/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number((req.query as any).tournamentid);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Missing tournament id" });

  if (req.method === "GET") {
    const sql = `
      SELECT tt.teamid AS id, t.name, t.season, tt.pool_group
      FROM tournamentteams tt
      JOIN teams t ON t.teamid = tt.teamid
      WHERE tt.tournamentid = $1
      ORDER BY tt.pool_group NULLS LAST, t.name ASC
    `;
    const db = await pool.connect();
    try {
      const { rows } = await db.query(sql, [id]);
      return res.status(200).json(rows); // [{ id, name, season, pool_group }, ...]
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to fetch teams" });
    } finally {
      db.release();
    }
  }

  if (req.method === "POST") {
    const session = await requireTournamentAccess(req, res, id);
    if (!session) return;

    // Modal adds by teamId into the base table
    const { teamIds } = (req.body ?? {}) as { teamIds: number[] };
    if (!Array.isArray(teamIds) || teamIds.length === 0)
      return res.status(400).json({ error: "No teamIds provided" });

    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      for (const teamId of teamIds) {
        await db.query(
          `INSERT INTO tournamentteams (tournamentid, teamid)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM tournamentteams WHERE tournamentid = $1 AND teamid = $2
           )`,
          [id, Number(teamId)]
        );
      }
      await db.query("COMMIT");
      return res.status(200).json({ ok: true, added: teamIds.length });
    } catch (e: any) {
      await db.query("ROLLBACK");
      return res.status(500).json({ error: e?.message || "Failed to add teams" });
    } finally {
      db.release();
    }
  }

  return res.status(405).end();
}
