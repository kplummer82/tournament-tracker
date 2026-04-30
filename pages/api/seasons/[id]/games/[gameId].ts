import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";
import { advanceWinner } from "@/lib/bracket-games";
import { requireSeasonAccess } from "@/lib/auth/requireSession";

const FORFEIT_STATUS_IDS = new Set([6, 7]); // Home Team Forfeit, Away Team Forfeit

function normalizeTime(t: string): string {
  return String(t).length === 5 ? `${t}:00` : String(t);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseInt(String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id), 10);
  const gameId = parseInt(String(Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId), 10);

  if (!Number.isFinite(seasonId) || !Number.isFinite(gameId)) {
    return res.status(400).json({ error: "Invalid season or game id" });
  }

  try {
    if (req.method === "DELETE") {
      const session = await requireSeasonAccess(req, res, seasonId);
      if (!session) return;

      const rows = await sql`
        DELETE FROM season_games
        WHERE id = ${gameId} AND season_id = ${seasonId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Game not found" });
      return res.status(200).json({ ok: true });
    }

    // PATCH: update scores, status, and/or scheduling fields
    if (req.method === "PATCH") {
      const session = await requireSeasonAccess(req, res, seasonId);
      if (!session) return;

      const body = req.body ?? {};

      // Build SET clauses dynamically for provided fields
      const sets: ReturnType<typeof sql>[] = [];
      if ("homescore" in body) sets.push(sql`homescore = ${body.homescore != null && body.homescore !== "" ? Number(body.homescore) : null}`);
      if ("awayscore" in body) sets.push(sql`awayscore = ${body.awayscore != null && body.awayscore !== "" ? Number(body.awayscore) : null}`);
      if ("gamestatusid" in body) sets.push(sql`gamestatusid = ${body.gamestatusid != null && body.gamestatusid !== "" ? Number(body.gamestatusid) : null}`);
      if ("gamedate" in body) sets.push(sql`gamedate = ${body.gamedate ? String(body.gamedate).slice(0, 10) : null}::date`);
      if ("gametime" in body) sets.push(sql`gametime = ${body.gametime ? normalizeTime(String(body.gametime)) : null}::time`);
      if ("location" in body) sets.push(sql`location = ${body.location || null}`);
      if ("field" in body) sets.push(sql`field = ${body.field || null}`);
      if ("location_id" in body) sets.push(sql`location_id = ${body.location_id ? Number(body.location_id) : null}`);

      if (!sets.length) return res.status(400).json({ error: "No fields to update" });

      // Join SET clauses with commas
      let setClause = sets[0];
      for (let i = 1; i < sets.length; i++) {
        setClause = sql`${setClause}, ${sets[i]}`;
      }

      const rows = await sql`
        UPDATE season_games SET ${setClause}
        WHERE id = ${gameId} AND season_id = ${seasonId}
        RETURNING id, bracket_id, bracket_game_id
      `;
      if (!rows.length) return res.status(404).json({ error: "Game not found" });

      // If this is a bracket game and scores or forfeit status were updated, advance the winner
      const row = rows[0];
      const isForfeitUpdate = "gamestatusid" in body && FORFEIT_STATUS_IDS.has(Number(body.gamestatusid));
      if (row.bracket_id && row.bracket_game_id && ("homescore" in body || "awayscore" in body || isForfeitUpdate)) {
        try {
          await advanceWinner(seasonId, gameId, row.bracket_id, row.bracket_game_id);
        } catch (advErr) {
          console.error("[advanceWinner] error (non-fatal)", advErr);
        }
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["DELETE", "PATCH"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/games/[gameId]] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
