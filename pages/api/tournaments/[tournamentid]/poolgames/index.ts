import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { requireTournamentAccess } from "@/lib/auth/requireSession";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tournamentid = Number(req.query.tournamentid);
  if (!Number.isFinite(tournamentid)) return res.status(400).json({ error: "Invalid tournament id" });

  try {
    if (req.method === "GET") {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `
          select pv.id,
                 pv.tournamentid,
                 pv.hometeam,
                 pv.awayteam,
                 pv.gamedate,
                 pv.gametime,
                 pv.homescore,
                 pv.awayscore,
                 pv.gamestatusid,
                 pv.gamestatus,
                 pv.tournament_venue_id,
                 pv.field,
                 -- Resolve from the linked venue first (source of truth), so games
                 -- scheduled via the auto-scheduler — which sets tournament_venue_id
                 -- but not the legacy denormalized location text — still show a venue.
                 coalesce(l.name, tv.custom_name, pv.location)  as location,
                 coalesce(pv.location_id, tv.location_id)       as location_id,
                 coalesce(l.address, tv.custom_address)         as venue_address,
                 coalesce(l.city,    tv.custom_city)            as venue_city,
                 coalesce(l.state,   tv.custom_state)           as venue_state
            from poolgames_view pv
            left join tournament_venues tv on tv.id = pv.tournament_venue_id
            left join locations l on l.id = tv.location_id
           where pv.tournamentid = $1
           order by pv.gamedate, pv.gametime, pv.id
          `,
          [tournamentid]
        );
        return res.status(200).json({ games: r.rows });
      } finally {
        client.release();
      }
    }

    if (req.method === "POST") {
      const session = await requireTournamentAccess(req, res, tournamentid);
      if (!session) return;

      const {
        hometeam, awayteam, gamedate, gametime,
        homescore = null, awayscore = null, gamestatusid,
        tournament_venue_id = null, location_id = null, location = null, field = null,
      } = req.body ?? {};

      if (!hometeam || !awayteam || !gamedate || !gametime || !gamestatusid) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const time = String(gametime).length === 5 ? `${gametime}:00` : String(gametime);

      const client = await pool.connect();
      try {
        await client.query(
          `
          insert into poolgames_view
            (tournamentid, gamedate, gametime, hometeam, awayteam, homescore, awayscore, gamestatusid)
          values ($1, $2::date, $3::time, $4, $5, $6, $7, $8)
          `,
          [
            tournamentid, gamedate, time, hometeam, awayteam,
            homescore === null ? null : Number(homescore),
            awayscore === null ? null : Number(awayscore),
            Number(gamestatusid),
          ]
        );

        let newId: number | null = null;
        if (tournament_venue_id != null || location_id != null || location || field) {
          // The view insert can't return the new id directly (INSTEAD OF triggers don't support RETURNING here),
          // so find the just-inserted row by tournament + teams + date + time and apply the venue/field columns.
          const lookup = await client.query(
            `
            select tg.id
              from tournamentgames tg
              join teams th on th.teamid = tg.home
              join teams ta on ta.teamid = tg.away
             where tg.tournamentid = $1
               and tg.poolorbracket = 'Pool'
               and tg.gamedate = $2::date
               and tg.gametime = $3::time
               and th.name = $4
               and ta.name = $5
             order by tg.id desc
             limit 1
            `,
            [tournamentid, gamedate, time, hometeam, awayteam]
          );
          newId = lookup.rows[0]?.id ?? null;
          if (newId != null) {
            await client.query(
              `
              update tournamentgames
                 set tournament_venue_id = $1,
                     location_id         = $2,
                     location            = $3,
                     field               = $4
               where id = $5 and tournamentid = $6
              `,
              [
                tournament_venue_id != null ? Number(tournament_venue_id) : null,
                location_id != null ? Number(location_id) : null,
                location || null,
                field || null,
                Number(newId),
                tournamentid,
              ]
            );
          }
        }
        return res.status(201).json({ ok: true, id: newId });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to create game" });
      } finally {
        client.release();
      }
    }

    if (req.method === "PUT") {
      const session = await requireTournamentAccess(req, res, tournamentid);
      if (!session) return;

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
      const {
        id,
        home, away, gamedate, gametime,
        homescore = null, awayscore = null, gamestatusid,
        tournament_venue_id = null, location_id = null, location = null, field = null,
      } = body;

      if (!id) return res.status(400).json({ error: "Missing game id" });
      if (home == null || away == null || !gamedate || !gametime) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const time = String(gametime).length === 5 ? `${gametime}:00` : String(gametime);
      const dateStr = String(gamedate).slice(0, 10);

      const client = await pool.connect();
      try {
        const r = await client.query(
          `
          UPDATE tournamentgames
             SET gamedate            = $1::date,
                 gametime            = $2::time,
                 home                = $3,
                 away                = $4,
                 homescore           = $5,
                 awayscore           = $6,
                 gamestatusid        = $7,
                 tournament_venue_id = $8,
                 location_id         = $9,
                 location            = $10,
                 field               = $11
           WHERE id = $12 AND tournamentid = $13 AND poolorbracket = 'Pool'
          `,
          [
            dateStr, time, Number(home), Number(away),
            homescore === null ? null : Number(homescore),
            awayscore === null ? null : Number(awayscore),
            gamestatusid != null && gamestatusid !== "" ? Number(gamestatusid) : null,
            tournament_venue_id != null ? Number(tournament_venue_id) : null,
            location_id != null ? Number(location_id) : null,
            location || null,
            field || null,
            Number(id),
            tournamentid,
          ]
        );
        if (!r.rowCount) return res.status(404).json({ error: "Game not found" });
        return res.status(200).json({ ok: true });
      } catch (e: unknown) {
        console.error("PUT poolgames error:", e);
        return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update game" });
      } finally {
        client.release();
      }
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
