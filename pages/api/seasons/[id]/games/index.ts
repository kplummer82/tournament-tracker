import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

function parseSeasonId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeTime(t: string): string {
  return String(t).length === 5 ? `${t}:00` : String(t);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const seasonId = parseSeasonId(req);
  if (!seasonId) return res.status(400).json({ error: "Invalid season id" });

  try {
    if (req.method === "GET") {
      const { game_type } = req.query;
      let rows;
      if (game_type === "playoff") {
        rows = await sql`
          SELECT
            sg.id,
            sg.gamedate,
            to_char(sg.gametime, 'HH24:MI') AS gametime,
            sg.home,   ht.name AS home_team,
            sg.away,   at.name AS away_team,
            sg.homescore,
            sg.awayscore,
            sg.game_type,
            sg.gamestatusid,
            gs.gamestatus AS gamestatus_label
          FROM season_games sg
          JOIN teams ht ON ht.teamid = sg.home
          JOIN teams at ON at.teamid = sg.away
          LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
          WHERE sg.season_id = ${seasonId} AND sg.game_type = 'playoff'
          ORDER BY sg.gamedate NULLS LAST, sg.gametime NULLS LAST, sg.id
        `;
      } else {
        // Default: regular season games
        rows = await sql`
          SELECT
            sg.id,
            sg.gamedate,
            to_char(sg.gametime, 'HH24:MI') AS gametime,
            sg.home,   ht.name AS home_team,
            sg.away,   at.name AS away_team,
            sg.homescore,
            sg.awayscore,
            sg.game_type,
            sg.gamestatusid,
            gs.gamestatus AS gamestatus_label
          FROM season_games sg
          JOIN teams ht ON ht.teamid = sg.home
          JOIN teams at ON at.teamid = sg.away
          LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
          WHERE sg.season_id = ${seasonId} AND sg.game_type = 'regular'
          ORDER BY sg.gamedate NULLS LAST, sg.gametime NULLS LAST, sg.id
        `;
      }
      return res.status(200).json({ games: rows });
    }

    if (req.method === "POST") {
      const {
        home, away, gamedate, gametime,
        homescore = null, awayscore = null,
        gamestatusid, game_type = "regular",
      } = req.body ?? {};

      if (!home || !away || !gamedate || !gametime) {
        return res.status(400).json({ error: "home, away, gamedate, gametime are required" });
      }

      const inserted = await sql`
        INSERT INTO season_games (
          season_id, gamedate, gametime, home, away,
          homescore, awayscore, game_type, gamestatusid
        )
        VALUES (
          ${seasonId},
          ${String(gamedate).slice(0, 10)}::date,
          ${normalizeTime(String(gametime))}::time,
          ${Number(home)},
          ${Number(away)},
          ${homescore != null && homescore !== "" ? Number(homescore) : null},
          ${awayscore != null && awayscore !== "" ? Number(awayscore) : null},
          ${game_type === "playoff" ? "playoff" : "regular"},
          ${gamestatusid != null && gamestatusid !== "" ? Number(gamestatusid) : null}
        )
        RETURNING id
      `;
      return res.status(201).json({ ok: true, id: inserted[0].id });
    }

    if (req.method === "PUT") {
      // Update an existing game
      const {
        id, home, away, gamedate, gametime,
        homescore = null, awayscore = null, gamestatusid,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ error: "id is required" });
      if (home == null || away == null || !gamedate || !gametime) {
        return res.status(400).json({ error: "home, away, gamedate, gametime are required" });
      }

      const rows = await sql`
        UPDATE season_games SET
          gamedate    = ${String(gamedate).slice(0, 10)}::date,
          gametime    = ${normalizeTime(String(gametime))}::time,
          home        = ${Number(home)},
          away        = ${Number(away)},
          homescore   = ${homescore != null && homescore !== "" ? Number(homescore) : null},
          awayscore   = ${awayscore != null && awayscore !== "" ? Number(awayscore) : null},
          gamestatusid = ${gamestatusid != null && gamestatusid !== "" ? Number(gamestatusid) : null}
        WHERE id = ${Number(id)} AND season_id = ${seasonId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: "Game not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    return res.status(405).end("Method Not Allowed");
  } catch (err: any) {
    console.error("[seasons/[id]/games] error", err);
    return res.status(500).json({ error: err.message ?? "Server error" });
  }
}
