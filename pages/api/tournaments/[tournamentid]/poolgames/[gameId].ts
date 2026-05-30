import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";
import { advanceTournamentWinner } from "@/lib/tournament-bracket-games";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentid = Number(req.query.tournamentid);
  const gameId = Number(req.query.gameId);
  if (!Number.isFinite(tournamentid)) return res.status(400).json({ error: "Invalid tournament id" });
  if (!Number.isFinite(gameId)) return res.status(400).json({ error: "Invalid game id" });

  const session = await requireTournamentAccess(req, res, tournamentid);
  if (!session) return;

  if (req.method === "PATCH") return patchGame(req, res, tournamentid, gameId);
  if (req.method === "DELETE") return deleteGame(req, res, tournamentid, gameId);

  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}

async function patchGame(req: NextApiRequest, res: NextApiResponse, tournamentid: number, gameId: number) {
  const body = req.body ?? {};
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;

  // Allow-listed columns. All optional; only set what's provided.
  const stringCols: Record<string, string> = {
    gamedate: "gamedate",
    gametime: "gametime",
    location: "location",
    field: "field",
  };
  for (const [bodyKey, col] of Object.entries(stringCols)) {
    if (bodyKey in body) {
      const v = body[bodyKey];
      sets.push(`${col} = $${i++}`);
      params.push(v == null || v === "" ? null : String(v));
    }
  }

  const intCols: Record<string, string> = {
    location_id: "location_id",
    tournament_venue_id: "tournament_venue_id",
    homescore: "homescore",
    awayscore: "awayscore",
    gamestatusid: "gamestatusid",
  };
  for (const [bodyKey, col] of Object.entries(intCols)) {
    if (bodyKey in body) {
      const v = body[bodyKey];
      sets.push(`${col} = $${i++}`);
      params.push(v == null || v === "" ? null : Number(v));
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  params.push(gameId, tournamentid);

  try {
    const client = await pool.connect();
    try {
      const r = await client.query(
        `UPDATE tournamentgames
            SET ${sets.join(", ")}
          WHERE id = $${i++} AND tournamentid = $${i++}
          RETURNING id, bracket_id, bracket_game_id`,
        params,
      );
      if (!r.rowCount) return res.status(404).json({ error: "Game not found" });

      // If this was a bracket game and scores/status touched, propagate the winner
      const updated = r.rows[0];
      const scoreOrStatusChanged =
        "homescore" in body || "awayscore" in body || "gamestatusid" in body;
      if (updated.bracket_id != null && updated.bracket_game_id != null && scoreOrStatusChanged) {
        try {
          await advanceTournamentWinner(
            tournamentid,
            Number(updated.id),
            Number(updated.bracket_id),
            String(updated.bracket_game_id),
          );
        } catch (err) {
          console.error("[advanceTournamentWinner]", err);
        }
      }

      return res.status(200).json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to update game" });
  }
}

async function deleteGame(_req: NextApiRequest, res: NextApiResponse, tournamentid: number, gameId: number) {
  try {
    const client = await pool.connect();
    try {
      const r = await client.query(
        `DELETE FROM tournamentgames WHERE id = $1 AND tournamentid = $2 AND poolorbracket = 'Pool'`,
        [gameId, tournamentid],
      );
      if (!r.rowCount) return res.status(404).json({ error: "Game not found" });
      return res.status(200).json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete game" });
  }
}
