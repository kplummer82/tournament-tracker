import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@/lib/db";

export type GameDetail = {
  id: number;
  source: "season" | "tournament" | "scrimmage";
  gamedate: string | null;
  gametime: string | null;
  home: number | null;
  home_team: string | null;
  away: number | null;
  away_team: string | null;
  homescore: number | null;
  awayscore: number | null;
  gamestatusid: number | null;
  gamestatus_label: string | null;
  context_id: number | null;
  context_name: string | null;
  location: string | null;
  field: string | null;
  location_id: number | null;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  game_type: string | null;
  bracket_id: number | null;
  bracket_game_id: string | null;
};

function parseParams(req: NextApiRequest) {
  const source = String(req.query.source);
  if (source !== "season" && source !== "tournament" && source !== "scrimmage") return null;
  const gameId = parseInt(String(Array.isArray(req.query.gameId) ? req.query.gameId[0] : req.query.gameId), 10);
  if (!Number.isFinite(gameId)) return null;
  return { source, gameId } as const;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const params = parseParams(req);
  if (!params) return res.status(400).json({ error: "Invalid source or gameId" });

  try {
    let rows: GameDetail[];

    if (params.source === "scrimmage") {
      rows = (await sql`
        SELECT
          sc.id,
          'scrimmage'::text                AS source,
          sc.gamedate::text                AS gamedate,
          to_char(sc.gametime, 'HH24:MI') AS gametime,
          sc.team_id                       AS home,
          ht.name                          AS home_team,
          sc.opponent_team_id              AS away,
          COALESCE(opp.name, sc.opponent_name, 'TBD') AS away_team,
          sc.homescore,
          sc.awayscore,
          sc.gamestatusid,
          gs.gamestatus                    AS gamestatus_label,
          NULL::int                        AS context_id,
          NULL::text                       AS context_name,
          COALESCE(sc.location, scloc.name) AS location,
          sc.field,
          sc.location_id,
          NULL::text                       AS game_type,
          NULL::int                        AS bracket_id,
          NULL::text                       AS bracket_game_id
        FROM scrimmages sc
        JOIN teams ht ON ht.teamid = sc.team_id
        LEFT JOIN teams opp ON opp.teamid = sc.opponent_team_id
        LEFT JOIN gamestatusoptions gs ON gs.id = sc.gamestatusid
        LEFT JOIN locations scloc ON scloc.id = sc.location_id
        WHERE sc.id = ${params.gameId}
        LIMIT 1
      `) as GameDetail[];
    } else if (params.source === "season") {
      rows = (await sql`
        SELECT
          sg.id,
          'season'::text                  AS source,
          sg.gamedate::text               AS gamedate,
          to_char(sg.gametime, 'HH24:MI') AS gametime,
          sg.home,
          ht.name                         AS home_team,
          sg.away,
          at.name                         AS away_team,
          sg.homescore,
          sg.awayscore,
          sg.gamestatusid,
          gs.gamestatus                   AS gamestatus_label,
          sg.season_id                    AS context_id,
          s.name                          AS context_name,
          sg.location,
          sg.field,
          sg.location_id,
          sg.game_type,
          sg.bracket_id,
          sg.bracket_game_id
        FROM season_games sg
        LEFT JOIN teams ht ON ht.teamid = sg.home
        LEFT JOIN teams at ON at.teamid = sg.away
        LEFT JOIN gamestatusoptions gs ON gs.id = sg.gamestatusid
        JOIN seasons s ON s.id = sg.season_id
        WHERE sg.id = ${params.gameId}
        LIMIT 1
      `) as GameDetail[];
    } else {
      rows = (await sql`
        SELECT
          tg.id,
          'tournament'::text              AS source,
          tg.gamedate::text               AS gamedate,
          to_char(tg.gametime, 'HH24:MI') AS gametime,
          tg.home,
          ht.name                         AS home_team,
          tg.away,
          at.name                         AS away_team,
          tg.homescore,
          tg.awayscore,
          tg.gamestatusid,
          gs.gamestatus                   AS gamestatus_label,
          tg.tournamentid                 AS context_id,
          t.name                          AS context_name,
          tg.location,
          tg.field,
          tg.location_id,
          NULL::text                      AS game_type,
          NULL::int                       AS bracket_id,
          NULL::text                      AS bracket_game_id
        FROM tournamentgames tg
        LEFT JOIN teams ht ON ht.teamid = tg.home
        LEFT JOIN teams at ON at.teamid = tg.away
        LEFT JOIN gamestatusoptions gs ON gs.id = tg.gamestatusid
        JOIN tournaments t ON t.tournamentid = tg.tournamentid
        WHERE tg.id = ${params.gameId}
        LIMIT 1
      `) as GameDetail[];
    }

    if (!rows.length) return res.status(404).json({ error: "Game not found" });

    const game = rows[0];
    // Hydrate official location address fields so the UI can build a Google
    // Maps directions link.
    if (game.location_id != null) {
      const locRows = await sql`
        SELECT name, address, city, state FROM locations WHERE id = ${game.location_id}
      `;
      if (locRows[0]) {
        game.location_name = locRows[0].name ?? null;
        game.location_address = locRows[0].address ?? null;
        game.location_city = locRows[0].city ?? null;
        game.location_state = locRows[0].state ?? null;
      } else {
        game.location_name = null;
        game.location_address = null;
        game.location_city = null;
        game.location_state = null;
      }
    } else {
      game.location_name = null;
      game.location_address = null;
      game.location_city = null;
      game.location_state = null;
    }

    return res.status(200).json({ game });
  } catch (err: unknown) {
    console.error("[games/[source]/[gameId]] error", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
  }
}
